import { useEffect, useState } from 'react';
import { positionsStream } from '../services/positionsStream';

/**
 * Hook que conecta una vista (visor 3D, vista 2D, panel...) al singleton
 * `positionsStream` para una planta concreta.
 *
 * - Llama internamente a `setPlant(plantId)` (idempotente si la planta no cambió).
 * - Devuelve la lista de `tagIds` conocidos y un getter `getInterpolated()` que
 *   los visores invocan cada frame para obtener la posición animada.
 * - El componente se re-renderiza cuando aparece un tag nuevo o se quita uno
 *   (no por cada batch recibido — para no saturar el render loop).
 */
export function usePositionsStream(plantId: string) {
  const [tagIds, setTagIds] = useState<string[]>(() => positionsStream.getTagIds());

  useEffect(() => {
    let mounted = true;
    positionsStream.setPlant(plantId).then(() => {
      if (mounted) setTagIds(positionsStream.getTagIds());
    });
    const unsub = positionsStream.subscribeChanges(() => {
      if (mounted) setTagIds(positionsStream.getTagIds());
    });
    return () => {
      mounted = false;
      unsub();
    };
  }, [plantId]);

  return {
    tagIds,
    getInterpolated: (tagId: string) => positionsStream.getInterpolated(tagId),
    getLast: (tagId: string) => positionsStream.getLast(tagId),
  };
}
