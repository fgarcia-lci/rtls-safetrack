/**
 * Singleton del stream de alertas (proximity events). Combina:
 *   - Snapshot inicial vía REST (eventos abiertos al montar el panel).
 *   - Push WebSocket vía /topic/alerts/{plantId} cuando un operario entra
 *     o sale de una zona.
 *
 * Mantiene en memoria los eventos abiertos (operario aún dentro) y los
 * últimos N cerrados (histórico reciente). Notifica cambios a los
 * componentes suscritos.
 *
 * Patrón clonado de positionsStream.ts para coherencia. Estructura visual
 * alineada con NotificationCenter del DT para que la futura integración
 * sea trivial.
 */
import { safetrackWebSocket } from './websocket';
import { proximityEventService } from './proximityEventService';
import { browserNotifications } from './browserNotifications';
import type { AlertNotification, ProximityEvent } from '../types/zones';

const MAX_HISTORY = 50;

class AlertsStream {
  /** Eventos abiertos (operario aún dentro), id → evento. */
  private openEvents = new Map<number, ProximityEvent>();
  /** Histórico de eventos cerrados (más reciente primero, hasta MAX_HISTORY). */
  private history: ProximityEvent[] = [];
  /** Último timestamp de "alerta nueva" para que la UI flashee. */
  private lastNewAlertAt = 0;

  private subscribers = new Set<() => void>();
  private currentPlantId: string | null = null;
  private subscribedTopic: string | null = null;
  private connected = false;

  async setPlant(plantId: string): Promise<void> {
    const topic = `/topic/alerts/${plantId}`;
    if (this.subscribedTopic === topic) return;

    if (this.subscribedTopic) {
      safetrackWebSocket.unsubscribe(this.subscribedTopic);
      this.subscribedTopic = null;
    }
    if (this.currentPlantId !== plantId) {
      this.openEvents.clear();
      this.history = [];
      this.currentPlantId = plantId;
      this.notify();
    }

    // Suscribimos AL INSTANTE, antes de cualquier await. Así no
    // importa cuánto tarde el snapshot REST: si llega un push WS, lo
    // procesamos. Si lo dejábamos detrás del await y la promesa se
    // colgaba o tardaba mucho, el subscribe nunca se emitía.
    safetrackWebSocket.connect();
    safetrackWebSocket.subscribe(topic, (frame) => {
      try {
        const alert = JSON.parse(frame.body) as AlertNotification;
        this.applyAlert(alert);
      } catch (err) {
        console.error('[Alerts] bad frame', err);
      }
    });
    this.subscribedTopic = topic;
    this.connected = true;
    this.notify();

    // Snapshot inicial — eventos abiertos. Hacemos esto DESPUÉS del
    // subscribe para no perder pushes mientras corre el REST.
    try {
      const open = await proximityEventService.list(plantId, true);
      for (const e of open) {
        if (!this.openEvents.has(e.id)) this.openEvents.set(e.id, e);
      }
      this.notify();
    } catch (err) {
      console.error('[Alerts] fetch open error', err);
    }
  }

  private applyAlert(alert: AlertNotification): void {
    if (alert.kind === 'ENTER') {
      // Convierte a ProximityEvent (parcial — sólo lo que viene en el push).
      // Los campos enriquecidos del worker (foto/empresa/rol) viajan en el
      // push para que el drawer/banner pinten contexto sin un fetch extra.
      const ev: ProximityEvent = {
        id: alert.eventId,
        tagId: 0, // no viene en el push; se completará al refrescar
        tagSerial: alert.tagSerial,
        workerId: alert.workerId,
        workerName: alert.workerName,
        workerCode: alert.workerCode,
        workerPhotoUrl: alert.workerPhotoUrl,
        workerCompanyName: alert.workerCompanyName,
        workerCompanyType: alert.workerCompanyType,
        workerRoleInPlant: alert.workerRoleInPlant,
        zoneId: alert.zoneId,
        zoneCode: alert.zoneCode,
        zoneName: alert.zoneName,
        zoneType: alert.zoneType,
        zoneSeverity: alert.severity,
        zoneColor: alert.displayColor,
        plantId: this.currentPlantId ?? '',
        enteredAt: alert.ts,
        maxSeverity: alert.severity,
      };
      this.openEvents.set(alert.eventId, ev);
      this.lastNewAlertAt = Date.now();
      // Notificación nativa del SO si la pestaña está en background
      // (no-op si visible o sin permiso; ver browserNotifications.ts).
      browserNotifications.showAlert(alert);
    } else if (alert.kind === 'EXIT') {
      const ev = this.openEvents.get(alert.eventId);
      if (ev) {
        ev.exitedAt = alert.ts;
        ev.durationSec = alert.durationSec ?? null;
        this.openEvents.delete(alert.eventId);
        this.history.unshift(ev);
        if (this.history.length > MAX_HISTORY) this.history.length = MAX_HISTORY;
      }
    }
    this.notify();
  }

  /** Marca un evento como ACK (mutación local + REST). */
  async ack(eventId: number): Promise<void> {
    try {
      const updated = await proximityEventService.ack(eventId);
      const existing = this.openEvents.get(eventId);
      if (existing) {
        existing.acknowledgedAt = updated.acknowledgedAt;
        existing.acknowledgedBy = updated.acknowledgedBy;
      }
      this.notify();
    } catch (err) {
      console.error('[Alerts] ack error', err);
      throw err;
    }
  }

  getOpen(): ProximityEvent[] {
    return Array.from(this.openEvents.values()).sort(
      (a, b) => (b.maxSeverity ?? 0) - (a.maxSeverity ?? 0)
    );
  }

  getHistory(): ProximityEvent[] {
    return [...this.history];
  }

  /** Cuántos eventos abiertos sin ACK — el badge del bell. */
  getUnreadCount(): number {
    let n = 0;
    for (const e of this.openEvents.values()) {
      if (!e.acknowledgedAt) n++;
    }
    return n;
  }

  isConnected(): boolean {
    return this.connected;
  }

  getLastNewAlertAt(): number {
    return this.lastNewAlertAt;
  }

  subscribeChanges(fn: () => void): () => void {
    this.subscribers.add(fn);
    return () => this.subscribers.delete(fn);
  }

  private notify(): void {
    this.subscribers.forEach((fn) => fn());
  }
}

export const alertsStream = new AlertsStream();
