import { useEffect, useState } from 'react';
import { sosStream } from '../services/sosStream';
import type { SosNotification } from '../types/sos';

/**
 * Suscribe el componente al singleton {@link sosStream}. Devuelve los SOS
 * activos en la planta indicada.
 */
export function useSosStream(plantId: string) {
  const [, force] = useState(0);

  useEffect(() => {
    sosStream.setPlant(plantId);
    const unsub = sosStream.subscribeChanges(() => force((n) => n + 1));
    return () => { unsub(); };
  }, [plantId]);

  const active: SosNotification[] = sosStream.getActive();
  return { active, count: active.length };
}
