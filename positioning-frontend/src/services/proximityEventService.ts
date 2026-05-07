import { api } from './api';
import type { ProximityEvent } from '../types/zones';

export const proximityEventService = {
  /** Lista eventos de una planta. Si {@code open=true} solo los abiertos. */
  async list(plantId: string, open?: boolean): Promise<ProximityEvent[]> {
    const params: Record<string, string | boolean> = { plantId };
    if (open !== undefined) params.open = open;
    const { data } = await api.get<ProximityEvent[]>('/v1/proximity-events', { params });
    return data;
  },

  /** ACK de un evento — pone acknowledgedAt + acknowledgedBy. Idempotente. */
  async ack(id: number): Promise<ProximityEvent> {
    const { data } = await api.post<ProximityEvent>(`/v1/proximity-events/${id}/ack`);
    return data;
  },
};
