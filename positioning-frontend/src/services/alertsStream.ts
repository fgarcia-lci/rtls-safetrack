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
    if (this.currentPlantId === plantId) return;

    if (this.subscribedTopic) {
      safetrackWebSocket.unsubscribe(this.subscribedTopic);
      this.subscribedTopic = null;
    }
    this.openEvents.clear();
    this.history = [];
    this.currentPlantId = plantId;
    this.notify();

    // Snapshot inicial — eventos abiertos.
    try {
      const open = await proximityEventService.list(plantId, true);
      for (const e of open) this.openEvents.set(e.id, e);
      this.notify();
    } catch (err) {
      console.error('[Alerts] fetch open error', err);
    }

    // Suscripción WebSocket — recibe AlertNotification (no ProximityEvent).
    const topic = `/topic/alerts/${plantId}`;
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
  }

  private applyAlert(alert: AlertNotification): void {
    if (alert.kind === 'ENTER') {
      // Convierte a ProximityEvent (parcial — sólo lo que viene en el push).
      const ev: ProximityEvent = {
        id: alert.eventId,
        tagId: 0, // no viene en el push; se completará al refrescar
        tagSerial: alert.tagSerial,
        workerName: alert.workerName,
        workerCode: alert.workerCode,
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
