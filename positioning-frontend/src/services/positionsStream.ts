/**
 * Singleton fuera de React que mantiene el estado de las posiciones de los tags
 * en tiempo real, con dos snapshots (prev/last) por tag para que los visores
 * puedan interpolar a 60 fps entre frames recibidos a ~1 Hz.
 *
 * Flujo:
 *   1. setPlant(plantId): pide snapshot inicial vía REST y se suscribe al
 *      topic /topic/positions/{plantId} del WebSocket STOMP.
 *   2. Cada batch que llega del servidor avanza prev→last para cada tagId
 *      (shift) y notifica a los componentes suscritos.
 *   3. Los visores piden getInterpolated(tagId) en cada frame de animación.
 *
 * Vive como singleton para sobrevivir a desmontados de React StrictMode.
 */
import { api } from './api';
import { safetrackWebSocket } from './websocket';
import type {
  InterpolatedPosition,
  PositionSnapshot,
  PositionsBatch,
  Quality,
  RealtimePosition,
} from '../types/positions';

interface TagState {
  prev: RealtimePosition;
  last: RealtimePosition;
  prevReceivedAt: number; // performance.now()
  receivedAt: number;     // performance.now()
}

class PositionsStream {
  private states = new Map<string, TagState>();
  private subscribers = new Set<() => void>();
  private currentPlantId: string | null = null;
  private subscribedTopic: string | null = null;
  private loading = false;

  /**
   * Cambia la planta a observar. Si es la misma, no-op.
   * Carga snapshot inicial y se suscribe al WS.
   */
  async setPlant(plantId: string): Promise<void> {
    const topic = `/topic/positions/${plantId}`;
    if (this.subscribedTopic === topic) return;

    // Limpiar suscripción anterior
    if (this.subscribedTopic) {
      safetrackWebSocket.unsubscribe(this.subscribedTopic);
      this.subscribedTopic = null;
    }
    if (this.currentPlantId !== plantId) {
      this.states.clear();
      this.notify();
      this.currentPlantId = plantId;
    }
    this.loading = true;

    // 1. Snapshot inicial vía REST
    try {
      const { data } = await api.get<PositionSnapshot[]>('/v1/positions/current', { params: { plantId } });
      const now = performance.now();
      for (const p of data) {
        const sample: RealtimePosition = {
          tagId: p.tagId,
          x: p.x,
          y: p.y,
          z: p.z,
          quality: p.quality,
          ts: p.ts,
        };
        this.states.set(p.tagId, {
          prev: sample,
          last: sample,
          prevReceivedAt: now,
          receivedAt: now,
        });
      }
    } catch (err) {
      console.warn('[positionsStream] Could not load snapshot', err);
    } finally {
      this.loading = false;
    }

    // 2. Conectar WS si no lo está y suscribirse al topic de la planta
    safetrackWebSocket.connect();
    safetrackWebSocket.subscribe(topic, (message) => {
      try {
        const batch: PositionsBatch = JSON.parse(message.body);
        this.applyBatch(batch);
      } catch (err) {
        console.warn('[positionsStream] Failed to parse batch', err);
      }
    });
    this.subscribedTopic = topic;

    this.notify();
  }

  /**
   * Devuelve la posición interpolada (entre prev y last) en el momento actual.
   * Si elapsed > dt entre frames, devuelve last (no extrapola).
   */
  getInterpolated(tagId: string): InterpolatedPosition | null {
    const s = this.states.get(tagId);
    if (!s) return null;
    const dt = s.receivedAt - s.prevReceivedAt;
    const elapsed = performance.now() - s.prevReceivedAt;
    const t = dt > 0 ? Math.min(1, elapsed / dt) : 1;
    return {
      tagId,
      x: s.prev.x + (s.last.x - s.prev.x) * t,
      y: s.prev.y + (s.last.y - s.prev.y) * t,
      z: s.prev.z + (s.last.z - s.prev.z) * t,
      quality: s.last.quality,
    };
  }

  /**
   * Posición "raw" del último frame recibido (sin interpolar). Útil para
   * paneles informativos donde no hace falta animación.
   */
  getLast(tagId: string): RealtimePosition | null {
    return this.states.get(tagId)?.last ?? null;
  }

  getQuality(tagId: string): Quality | null {
    return this.states.get(tagId)?.last.quality ?? null;
  }

  getTagIds(): string[] {
    return Array.from(this.states.keys());
  }

  isLoading(): boolean {
    return this.loading;
  }

  /** Suscripción a notificaciones de "se actualizó la lista de tags conocidos". */
  subscribeChanges(callback: () => void): () => void {
    this.subscribers.add(callback);
    return () => {
      this.subscribers.delete(callback);
    };
  }

  // ---- internos ----

  private applyBatch(batch: PositionsBatch): void {
    const now = performance.now();
    let newTagAdded = false;
    for (const p of batch.positions) {
      const existing = this.states.get(p.tagId);
      if (existing) {
        this.states.set(p.tagId, {
          prev: existing.last,
          last: p,
          prevReceivedAt: existing.receivedAt,
          receivedAt: now,
        });
      } else {
        this.states.set(p.tagId, {
          prev: p,
          last: p,
          prevReceivedAt: now,
          receivedAt: now,
        });
        newTagAdded = true;
      }
    }
    if (newTagAdded) this.notify();
  }

  private notify(): void {
    for (const cb of this.subscribers) cb();
  }
}

export const positionsStream = new PositionsStream();
