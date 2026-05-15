// Singleton de stream de SOS. Suscribe a /topic/sos/{plantId} y mantiene
// en memoria los SOS activos (no resueltos / cancelados). Notifica a
// componentes suscritos cuando cambian.
//
// Patrón clonado de alertsStream para coherencia.
import { safetrackWebSocket } from './websocket';
import { sosService } from './sosService';
import type { SosNotification, SosEventDto, SosStatus } from '../types/sos';

class SosStream {
  /** Eventos activos (no resueltos / cancelados), id → notificación enriquecida. */
  private active = new Map<number, SosNotification>();
  /** Último SOS recibido (ms epoch) — para que la sirena dispare flash al cambio. */
  private lastNewSosAt = 0;

  private subscribers = new Set<() => void>();
  private currentPlantId: string | null = null;
  private subscribedTopic: string | null = null;

  async setPlant(plantId: string): Promise<void> {
    const topic = `/topic/sos/${plantId}`;
    if (this.subscribedTopic === topic) return;

    if (this.subscribedTopic) {
      safetrackWebSocket.unsubscribe(this.subscribedTopic);
      this.subscribedTopic = null;
    }
    if (this.currentPlantId !== plantId) {
      this.active.clear();
      this.currentPlantId = plantId;
      this.notify();
    }

    // Snapshot inicial: SOS activos en la planta.
    try {
      const list = await sosService.listActive(plantId);
      for (const ev of list) this.active.set(ev.id, this.dtoToNotification(ev));
      this.notify();
    } catch (err) {
      console.error('[SOS] fetch active error', err);
    }

    // Igual que alertsStream: nos aseguramos de que el WS esté conectado
    // por si el usuario nunca ha entrado a /live (donde positionsStream
    // lo levanta). Sin esto los SOS solo llegan tras F5.
    safetrackWebSocket.connect();
    safetrackWebSocket.subscribe(topic, (frame) => {
      try {
        const n = JSON.parse(frame.body) as SosNotification;
        this.applyNotification(n);
      } catch (err) {
        console.error('[SOS] bad frame', err);
      }
    });
    this.subscribedTopic = topic;
  }

  private applyNotification(n: SosNotification): void {
    if (n.status === 'RESOLVED' || n.status === 'CANCELLED') {
      // Cierre — quitar de activos
      this.active.delete(n.eventId);
    } else {
      const existing = this.active.get(n.eventId);
      this.active.set(n.eventId, n);
      if (!existing) this.lastNewSosAt = Date.now();
    }
    this.notify();
  }

  /** Conversión SosEventDto (REST) → SosNotification (forma idéntica al push WS). */
  private dtoToNotification(ev: SosEventDto): SosNotification {
    return {
      eventId: ev.id,
      triggeredAt: ev.triggeredAt,
      status: ev.status as SosStatus,
      workerId: ev.workerId,
      tagSerial: null,    // no viene en el DTO REST; queda null hasta que llegue push
      workerName: null, workerCode: null, workerPhotoUrl: null,
      workerCompanyName: null, workerCompanyType: null, workerRoleInPlant: null,
      workerPhone: null,
      posX: null, posY: null, posZ: null,
      zonesAtTrigger: null, nearbyWorkerIds: null,
      batteryPct: null, rssiDbm: null,
    };
  }

  getActive(): SosNotification[] {
    return Array.from(this.active.values()).sort(
      (a, b) => +new Date(b.triggeredAt) - +new Date(a.triggeredAt),
    );
  }

  getCount(): number {
    return this.active.size;
  }

  getLastNewSosAt(): number {
    return this.lastNewSosAt;
  }

  subscribeChanges(fn: () => void): () => void {
    this.subscribers.add(fn);
    return () => this.subscribers.delete(fn);
  }

  private notify(): void {
    this.subscribers.forEach((fn) => fn());
  }
}

export const sosStream = new SosStream();
