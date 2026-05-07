import { useEffect, useState } from 'react';
import { alertsStream } from '../services/alertsStream';
import type { ProximityEvent } from '../types/zones';

/**
 * Suscribe el componente al singleton {@link alertsStream}. Devuelve los
 * eventos abiertos, el histórico, el contador de no-ACK y el flag de
 * conexión WebSocket. El componente se re-renderiza cuando alertsStream
 * notifica cambios.
 */
export function useAlertsStream(plantId: string) {
  const [, force] = useState(0);

  useEffect(() => {
    alertsStream.setPlant(plantId);
    const unsub = alertsStream.subscribeChanges(() => force((n) => n + 1));
    return () => { unsub(); };
  }, [plantId]);

  const open: ProximityEvent[] = alertsStream.getOpen();
  const history: ProximityEvent[] = alertsStream.getHistory();
  const unread = alertsStream.getUnreadCount();
  const connected = alertsStream.isConnected();

  return { open, history, unread, connected, ack: alertsStream.ack.bind(alertsStream) };
}
