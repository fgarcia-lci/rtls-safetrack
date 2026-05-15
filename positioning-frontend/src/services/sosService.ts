// Cliente REST del módulo SOS.
import { api } from './api';
import type { SosEventDto } from '../types/sos';

export const sosService = {
  async listActive(plantId: string): Promise<SosEventDto[]> {
    const r = await api.get<SosEventDto[]>('/v1/sos/active', { params: { plantId } });
    return r.data;
  },

  async history(plantId: string): Promise<SosEventDto[]> {
    const r = await api.get<SosEventDto[]>('/v1/sos/history', { params: { plantId } });
    return r.data;
  },

  /** Dispara un SOS "manual" desde la UI admin — para demos sin hardware. */
  async simulate(tagSerial: string): Promise<SosEventDto> {
    const r = await api.post<SosEventDto>('/v1/sos/simulate', null, { params: { tagSerial } });
    return r.data;
  },

  async ack(id: number): Promise<SosEventDto> {
    const r = await api.post<SosEventDto>(`/v1/sos/${id}/ack`);
    return r.data;
  },

  async sendHelp(id: number, notes?: string): Promise<SosEventDto> {
    const r = await api.post<SosEventDto>(`/v1/sos/${id}/help-sent`, { notes: notes ?? '' });
    return r.data;
  },

  async resolve(id: number, notes?: string): Promise<SosEventDto> {
    const r = await api.post<SosEventDto>(`/v1/sos/${id}/resolve`, { notes: notes ?? '' });
    return r.data;
  },

  async cancel(id: number, reason?: string): Promise<SosEventDto> {
    const r = await api.post<SosEventDto>(`/v1/sos/${id}/cancel`, { notes: reason ?? 'Falso positivo' });
    return r.data;
  },
};
