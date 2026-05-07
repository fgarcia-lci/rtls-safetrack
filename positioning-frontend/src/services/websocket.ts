// WebSocket service para RTLS Safetrack — patrón clonado del DT pero genérico.
//
// El DT usa un WS muy acoplado a Redux (notificationsSlice, AlertNotificationInstance).
// Aquí simplificamos: el service solo gestiona la conexión y permite suscribirse
// a topics arbitrarios desde fuera (Redux thunks, hooks, componentes, etc.).
//
// Topics esperados en Safetrack:
//   /topic/positions/{plantId}     — batch de posiciones cada 200-300 ms
//   /topic/alerts/{plantId}        — alertas de proximidad
//   /user/queue/notifications      — notificaciones por usuario (futuro)

import { Client, type IMessage, type StompSubscription } from '@stomp/stompjs';
import SockJS from 'sockjs-client';
import { config } from '../config/config';

const ACCESS_TOKEN_KEY = 'safetrack_access_token';

type MessageHandler = (message: IMessage) => void;

class SafetrackWebSocketService {
  private client: Client | null = null;
  private isConnecting = false;
  private subscriptions: Map<string, { handler: MessageHandler; sub?: StompSubscription }> = new Map();
  private onConnectedListeners: Array<() => void> = [];
  private onDisconnectedListeners: Array<() => void> = [];

  /**
   * Inicia la conexión STOMP. Si ya está conectado, no hace nada.
   */
  connect(): void {
    if (this.client?.connected) {
      console.log('[WS] Already connected');
      return;
    }
    if (this.isConnecting) {
      console.log('[WS] Connection already in progress');
      return;
    }

    const token = localStorage.getItem(ACCESS_TOKEN_KEY);
    if (!token) {
      console.warn('[WS] No JWT token; aborting connect');
      return;
    }

    this.isConnecting = true;
    const wsUrl = `${config.api.baseUrl}/ws?token=${encodeURIComponent(token)}`;

    this.client = new Client({
      webSocketFactory: () => new SockJS(wsUrl) as unknown as WebSocket,
      connectHeaders: { Authorization: `Bearer ${token}` },
      debug: (str) => console.log('[STOMP]', str),
      reconnectDelay: 3000,
      heartbeatIncoming: 10000,
      heartbeatOutgoing: 10000,
    });

    this.client.onConnect = () => {
      console.log('[WS] Connected');
      this.isConnecting = false;
      // Re-suscribirse a topics que se hubieran pedido antes de la conexión
      for (const [topic, entry] of this.subscriptions.entries()) {
        entry.sub = this.client!.subscribe(topic, entry.handler);
      }
      this.onConnectedListeners.forEach((fn) => fn());
    };

    this.client.onStompError = (frame) => {
      console.error('[WS] STOMP error', frame.headers['message']);
      this.isConnecting = false;
    };

    this.client.onWebSocketError = (error) => {
      console.error('[WS] WebSocket error', error);
      this.isConnecting = false;
    };

    this.client.onWebSocketClose = () => {
      console.log('[WS] Closed');
      this.isConnecting = false;
      this.onDisconnectedListeners.forEach((fn) => fn());
    };

    this.client.activate();
  }

  /**
   * Suscribirse a un topic. Se mantiene la suscripción si la conexión cae
   * y se restaura al reconectar.
   */
  subscribe(topic: string, handler: MessageHandler): void {
    this.subscriptions.set(topic, { handler });
    if (this.client?.connected) {
      const sub = this.client.subscribe(topic, handler);
      this.subscriptions.get(topic)!.sub = sub;
    }
  }

  unsubscribe(topic: string): void {
    const entry = this.subscriptions.get(topic);
    if (entry?.sub) entry.sub.unsubscribe();
    this.subscriptions.delete(topic);
  }

  disconnect(): void {
    this.isConnecting = false;
    if (this.client) {
      this.client.deactivate();
      this.client = null;
    }
    this.subscriptions.clear();
  }

  isConnected(): boolean {
    return this.client?.connected ?? false;
  }

  onConnected(fn: () => void): void {
    this.onConnectedListeners.push(fn);
  }

  onDisconnected(fn: () => void): void {
    this.onDisconnectedListeners.push(fn);
  }
}

export const safetrackWebSocket = new SafetrackWebSocketService();
