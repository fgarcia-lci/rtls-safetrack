// Hook que sirve de "reemplazo" del usePositionsStream durante el modo Replay
// del visor Live. La idea: el visor 3D/2D no sabe si las posiciones vienen
// del WS en vivo o del histórico — sigue llamando a `tagIds` /
// `getInterpolated(serial)` igual. Aquí gestionamos:
//
//   1. El reloj de reproducción (currentTimeMs) avanzando según playing+speed.
//   2. La interpolación lineal entre dos muestras consecutivas de cada worker
//      según ese reloj.
//   3. Los eventos de proximidad y SOS activos en el instante actual, para
//      que las zonas se pinten coloreadas igual que en vivo.

import { useCallback, useEffect, useMemo, useRef, useState, type MutableRefObject } from 'react';
import type {
  PlaybackDto,
  PlaybackProximityEvent,
  PlaybackSosEvent,
} from '../types/playback';
import type { InterpolatedPosition, Quality, RealtimePosition } from '../types/positions';

export interface ReplayStreamOptions {
  /** Snapshot batch ya cargado desde /v1/playback. null = no hay replay activo. */
  playback: PlaybackDto | null;
  /** Avanza el reloj cuando true. Si false, queda estático en currentTimeMs. */
  playing: boolean;
  /** Multiplicador de velocidad (1, 5, 20, 100). */
  speed: number;
  /** Tiempo actual de reproducción en ms epoch. Lo controla el padre (slider). */
  currentTimeMs: number;
  /** Lo llama el hook cuando el tiempo avanza por sí solo (modo playing). */
  onAdvance: (newTimeMs: number) => void;
}

export interface ReplayStream {
  tagIds: string[];
  getInterpolated: (tagId: string) => InterpolatedPosition | null;
  getLast: (tagId: string) => RealtimePosition | null;
  /** Eventos de proximidad activos en currentTime (operario dentro de zona). */
  activeProximityEvents: PlaybackProximityEvent[];
  /** SOS activos en currentTime (entre triggeredAt y resolvedAt|now). */
  activeSosEvents: PlaybackSosEvent[];
  /** Bandera para que la UI pueda mostrar "esperando datos" si está vacío. */
  hasAnyPosition: boolean;
  /**
   * Ref viva del reloj de reproducción. Se actualiza desde el rAF del hook
   * inmediatamente (sin pasar por React state). Útil para componentes como
   * la ReplayBar que necesitan refrescar visualmente a 60 fps sin esperar
   * a que React reconcile el árbol completo del visor.
   */
  currentTimeMsRef: MutableRefObject<number>;
}

/**
 * Devuelve `null` si no hay playback cargado. Si lo hay, expone la API que el
 * visor consume, interpolando linealmente entre las dos muestras temporales
 * más cercanas al instante `currentTimeMs`.
 */
export function useReplayStream(options: ReplayStreamOptions): ReplayStream {
  const { playback, playing, speed, currentTimeMs, onAdvance } = options;

  const toMs = useMemo(() => (playback ? Date.parse(playback.to) : 0), [playback]);

  // Índice del próximo punto a buscar por tag — optimización para que el
  // O(n) de búsqueda binaria no se ejecute en cada frame.
  const cursorBySerialRef = useRef<Map<string, number>>(new Map());

  // Si cambia el playback, reseteamos cursores.
  useEffect(() => {
    cursorBySerialRef.current.clear();
  }, [playback]);

  // Avance del reloj cuando playing. Usamos rAF para fluidez (60 fps).
  // El padre actualiza currentTimeMs vía onAdvance — así el slider y los
  // visores siempre ven el mismo valor. Como el effect del rAF se monta una
  // sola vez (no en cada cambio de currentTimeMs), el callback `tick` no
  // puede leer currentTimeMs del scope directamente: se quedaría estancado
  // en el valor inicial (closure stale). Usamos refs sincronizadas para
  // que el tick siempre lea los valores actuales sin re-montarse.
  const rafRef = useRef<number | null>(null);
  const lastTickRef = useRef<number>(0);
  const currentTimeMsRef = useRef<number>(currentTimeMs);
  const speedRef = useRef<number>(speed);
  useEffect(() => { speedRef.current = speed; }, [speed]);

  // Sincronización ref ↔ state CON CUIDADO. Si playing=true, la fuente de
  // verdad es la REF (la actualiza el rAF en cada frame inmediatamente).
  // Sincronizar desde el state (que va retrasado) durante playing causaría
  // que la ref retroceda y el reloj diera saltos hacia atrás progresivos.
  // Solo sincronizamos desde state cuando:
  //   - no estamos reproduciendo (el usuario manda con seek / pause)
  //   - el valor del state es muy distinto al de la ref (seek desde el slider)
  useEffect(() => {
    if (!playing) {
      currentTimeMsRef.current = currentTimeMs;
      return;
    }
    // Si la diferencia es grande (>2s a 1x equivale, escalado por speed),
    // asumimos seek intencional y aceptamos el valor. Eso permite que el
    // restart desde el final reposicione bien.
    const diff = Math.abs(currentTimeMsRef.current - currentTimeMs);
    if (diff > 2000 * Math.max(1, speedRef.current)) {
      currentTimeMsRef.current = currentTimeMs;
    }
  }, [currentTimeMs, playing]);

  useEffect(() => {
    if (!playing || !playback) {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      lastTickRef.current = 0;
      return;
    }
    const tick = (now: number) => {
      if (lastTickRef.current === 0) {
        // Primer tick tras el play: solo inicializamos la referencia
        // temporal y no avanzamos nada — esperamos al próximo frame
        // para tener un dt real.
        lastTickRef.current = now;
        rafRef.current = requestAnimationFrame(tick);
        return;
      }
      const dtMs = now - lastTickRef.current;
      lastTickRef.current = now;
      // Avanza la ref INMEDIATAMENTE — la fuente de verdad del reloj de
      // reproducción es esta ref, no el state. React puede ir varios frames
      // por detrás cuando speed es alto; el visor (que lee de la ref vía
      // getInterpolated) siempre ve el último valor.
      let next = currentTimeMsRef.current + dtMs * speedRef.current;
      if (next >= toMs) next = toMs;
      currentTimeMsRef.current = next;
      // onAdvance actualiza el state del padre para que el slider y los
      // eventos activos reflejen el avance. Si el valor coincide con el
      // anterior, React skipea el re-render.
      onAdvance(next);
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      lastTickRef.current = 0;
    };
  }, [playing, playback, toMs, onAdvance]);

  // Re-render cuando cambia el set de tags (no en cada frame).
  const [tagIdsState, setTagIdsState] = useState<string[]>(() =>
    playback ? playback.workers.map((w) => w.tagSerial) : [],
  );
  useEffect(() => {
    setTagIdsState(playback ? playback.workers.map((w) => w.tagSerial) : []);
  }, [playback]);

  // Tick interno usado para recalcular los eventos activos (proximity + SOS)
  // a una frecuencia regular durante la reproducción. NO podemos depender
  // de currentTimeMs del state: en escenas pesadas React puede coalescer
  // los setState del rAF y dejar el state varias décimas atrás. Eso hace
  // que un SOS marcado como activo se quede pegado aunque su resolvedAt ya
  // haya pasado en el reloj real. Este tick lee la ref viva.
  const [eventsTick, setEventsTick] = useState(0);
  useEffect(() => {
    if (!playing) return;
    const id = window.setInterval(() => setEventsTick((n) => n + 1), 250);
    return () => window.clearInterval(id);
  }, [playing]);

  // Mapa serial → worker para lookups O(1).
  const workerBySerial = useMemo(() => {
    const m = new Map<string, (typeof playback)['workers'][number]>();
    if (playback) {
      for (const w of playback.workers) m.set(w.tagSerial, w);
    }
    return m;
  }, [playback]);

  /**
   * Encuentra la posición interpolada de un tag en `currentTimeMs`.
   * Si el tiempo está fuera del rango de muestras del tag, devuelve la
   * primera o la última muestra (no extrapolamos).
   *
   * Importante: lee {@link currentTimeMsRef} (no el state cerrado por la
   * closure). Así esta función es estable entre renders y el visor 3D, que
   * la invoca cada frame desde su propio rAF, siempre ve el `target` más
   * reciente sin depender de cuándo React acaba de reconciliar.
   */
  const getInterpolated = useCallback((tagId: string): InterpolatedPosition | null => {
    if (!playback) return null;
    const w = workerBySerial.get(tagId);
    if (!w || w.positions.length === 0) return null;
    const positions = w.positions;
    const target = currentTimeMsRef.current;

    // Acelerador: empezamos desde el último cursor conocido. Avanzamos
    // mientras el siguiente punto ts <= target.
    let cursor = cursorBySerialRef.current.get(tagId) ?? 0;
    // Si el slider fue para atrás, reposicionamos.
    if (cursor > 0 && Date.parse(positions[cursor].ts) > target) {
      cursor = 0;
    }
    while (
      cursor + 1 < positions.length &&
      Date.parse(positions[cursor + 1].ts) <= target
    ) {
      cursor++;
    }
    cursorBySerialRef.current.set(tagId, cursor);

    // Caso degenerado: solo una muestra disponible.
    if (cursor === positions.length - 1) {
      const p = positions[cursor];
      return { tagId, x: p.x, y: p.y, z: p.z, quality: 'GOOD' };
    }
    const a = positions[cursor];
    const b = positions[cursor + 1];
    const aMs = Date.parse(a.ts);
    const bMs = Date.parse(b.ts);
    if (target <= aMs) {
      return { tagId, x: a.x, y: a.y, z: a.z, quality: 'GOOD' };
    }
    const t = Math.max(0, Math.min(1, (target - aMs) / Math.max(1, bMs - aMs)));
    return {
      tagId,
      x: a.x + (b.x - a.x) * t,
      y: a.y + (b.y - a.y) * t,
      z: a.z + (b.z - a.z) * t,
      // Si el gap entre muestras es > 5x la resolución, marcamos DEGRADED:
      // probablemente había pérdida de señal en ese tramo.
      quality: bMs - aMs > (playback.resolutionSeconds * 1000 * 5)
        ? ('DEGRADED' as Quality)
        : ('GOOD' as Quality),
    };
  }, [playback, workerBySerial]);

  const getLast = useCallback((tagId: string): RealtimePosition | null => {
    const interp = getInterpolated(tagId);
    if (!interp) return null;
    return {
      tagId,
      x: interp.x,
      y: interp.y,
      z: interp.z,
      quality: interp.quality,
      ts: new Date(currentTimeMsRef.current).toISOString(),
    };
  }, [getInterpolated]);

  // Eventos activos en el instante actual del replay. La fuente de verdad
  // del reloj es la ref (currentTimeMsRef). Las deps del memo son:
  //   - playing=true  → eventsTick (avance regular, ignora el state stale
  //                     que pueda commitar React con valores antiguos).
  //   - playing=false → currentTimeMs (seek manual recalcula al instante).
  // Mezclar ambas en cualquier orden permite valores retrocedidos del state
  // que mantienen un evento "activo" pasados unos segundos del rango real.
  const memoKey = playing ? eventsTick : currentTimeMs;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const activeProximityEvents = useMemo(() => {
    if (!playback) return [];
    const target = currentTimeMsRef.current;
    return playback.proximityEvents.filter((e) => {
      const enter = Date.parse(e.enteredAt);
      const exit = e.exitedAt ? Date.parse(e.exitedAt) : toMs;
      return enter <= target && target <= exit;
    });
  }, [playback, memoKey, toMs]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const activeSosEvents = useMemo(() => {
    if (!playback) return [];
    const target = currentTimeMsRef.current;
    return playback.sosEvents.filter((s) => {
      const trig = Date.parse(s.triggeredAt);
      const resolved = s.resolvedAt ? Date.parse(s.resolvedAt) : toMs;
      return trig <= target && target <= resolved;
    });
  }, [playback, memoKey, toMs]);

  return {
    tagIds: tagIdsState,
    getInterpolated,
    getLast,
    activeProximityEvents,
    activeSosEvents,
    hasAnyPosition: !!playback && playback.workers.some((w) => w.positions.length > 0),
    currentTimeMsRef,
  };
}

// (fromMs reservado para validaciones futuras; lo dejamos exportado por
// claridad si en otra parte se necesita comparar contra el inicio del rango.)
export function rangeStart(p: PlaybackDto | null): number {
  return p ? Date.parse(p.from) : 0;
}
export function rangeEnd(p: PlaybackDto | null): number {
  return p ? Date.parse(p.to) : 0;
}
