/**
 * Singleton para el stream de proximidades. Mantiene en memoria el último
 * factor recibido por cada par (tagId, zoneId) y notifica cambios a los
 * componentes suscritos.
 *
 * El backend solo emite pares con factor > 0 → si un (tag, zona) deja de
 * aparecer en un batch significa que su factor cayó a 0 (OUTSIDE). Para
 * detectarlo: en cada batch, marcamos qué pares aparecen, y los que NO
 * los purgamos en el siguiente tick visual del componente.
 *
 * Para el visor 3D lo más útil es exponer:
 *  - factorByZone(zoneId) → max factor de cualquier tag para esa zona
 *  - factorByTag(tagId) → max factor de cualquier zona para ese tag
 */
import { safetrackWebSocket } from './websocket';
import type { ProximityBatch, ProximityFactor } from '../types/zones';

type Key = string; // `${tagId}|${zoneId}`

/**
 * Provider externo para modo Replay. Cuando está seteado, las consultas
 * (`factorByZone`/`factorByTag`) delegan en él en lugar de leer del WS.
 * Permite que las zonas se coloreen y los avatares cambien según los
 * eventos históricos en lugar de la actividad en vivo.
 */
export interface ProximityProvider {
  factorByZone(zoneId: number): number;
  factorByTag(tagId: string): number;
}

class ProximityStream {
  private factors = new Map<Key, ProximityFactor>();
  private subscribers = new Set<() => void>();
  private currentPlantId: string | null = null;
  private subscribedTopic: string | null = null;
  private replaySource: ProximityProvider | null = null;

  setPlant(plantId: string): void {
    const topic = `/topic/proximity/${plantId}`;
    if (this.subscribedTopic === topic) return;

    if (this.subscribedTopic) {
      safetrackWebSocket.unsubscribe(this.subscribedTopic);
      this.subscribedTopic = null;
    }
    if (this.currentPlantId !== plantId) {
      this.factors.clear();
      this.currentPlantId = plantId;
    }

    // Asegura el cliente STOMP activo aunque no se haya entrado a /live.
    safetrackWebSocket.connect();
    safetrackWebSocket.subscribe(topic, (frame) => {
      try {
        const batch = JSON.parse(frame.body) as ProximityBatch;
        this.applyBatch(batch);
      } catch (err) {
        console.error('[Proximity] bad batch', err);
      }
    });
    this.subscribedTopic = topic;
  }

  private applyBatch(batch: ProximityBatch): void {
    // Construir set de pares presentes en este batch.
    const presentKeys = new Set<Key>();
    for (const p of batch.proximities) {
      const k = this.keyOf(p.tagId, p.zoneId);
      presentKeys.add(k);
      this.factors.set(k, p);
    }
    // Cualquier par que ya teníamos y NO viene en el batch → factor cayó
    // a 0 (OUTSIDE). Lo eliminamos para que el frontend lo trate como tal.
    for (const k of Array.from(this.factors.keys())) {
      if (!presentKeys.has(k)) this.factors.delete(k);
    }
    this.subscribers.forEach((fn) => fn());
  }

  private keyOf(tagId: string, zoneId: number): Key {
    return `${tagId}|${zoneId}`;
  }

  /** Máximo factor para una zona entre todos los tags. 0 si nadie cerca. */
  factorByZone(zoneId: number): number {
    if (this.replaySource) return this.replaySource.factorByZone(zoneId);
    let max = 0;
    for (const f of this.factors.values()) {
      if (f.zoneId === zoneId && f.factor > max) max = f.factor;
    }
    return max;
  }

  /** Máximo factor para un tag entre todas las zonas. 0 si está OUTSIDE. */
  factorByTag(tagId: string): number {
    if (this.replaySource) return this.replaySource.factorByTag(tagId);
    let max = 0;
    for (const f of this.factors.values()) {
      if (f.tagId === tagId && f.factor > max) max = f.factor;
    }
    return max;
  }

  /**
   * Activa el modo replay: las consultas se sirven desde el provider en lugar
   * del WS. Pasar null para volver al live. Notifica suscriptores.
   */
  setReplaySource(source: ProximityProvider | null): void {
    if (this.replaySource === source) return;
    this.replaySource = source;
    this.subscribers.forEach((fn) => fn());
  }

  /**
   * Fuerza un disparo a suscriptores — útil cuando el provider del replay
   * actualiza internamente sus eventos activos y necesitamos que los
   * visores releyan los factores.
   */
  refresh(): void {
    this.subscribers.forEach((fn) => fn());
  }

  subscribeChanges(fn: () => void): () => void {
    this.subscribers.add(fn);
    return () => this.subscribers.delete(fn);
  }
}

export const proximityStream = new ProximityStream();
