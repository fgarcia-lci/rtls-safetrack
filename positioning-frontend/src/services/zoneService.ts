import { api } from './api';
import type { NotificationPolicy, SafetyZone, ShapeType, ZoneType } from '../types/zones';

export interface SafetyZoneCreatePayload {
  plantId: string;
  code: string;
  name: string;
  description?: string | null;
  type: ZoneType;
  shapeType: ShapeType;
  severity: number;
  polygon2d: [number, number][];
  zMin: number;
  zMax: number;
  bufferApproachM?: number | null;
  relatedDeviceId?: string | null;
  displayColor?: string | null;
  allowedRoles?: string[];
  notificationPolicy?: NotificationPolicy;
}

export interface SafetyZoneUpdatePayload {
  name: string;
  description?: string | null;
  type: ZoneType;
  shapeType: ShapeType;
  severity: number;
  polygon2d: [number, number][];
  zMin: number;
  zMax: number;
  bufferApproachM?: number | null;
  relatedDeviceId?: string | null;
  isActive: boolean;
  displayColor?: string | null;
  allowedRoles?: string[];
  notificationPolicy?: NotificationPolicy;
}

export const zoneService = {
  /** Lista zonas de una planta. Si activeOnly=true, solo las activas. */
  async listByPlant(plantId: string, activeOnly = true): Promise<SafetyZone[]> {
    const params: Record<string, string | boolean> = { plantId };
    if (activeOnly) params.isActive = true;
    const { data } = await api.get<SafetyZone[]>('/v1/zones', { params });
    return data;
  },

  async getById(id: number): Promise<SafetyZone> {
    const { data } = await api.get<SafetyZone>(`/v1/zones/${id}`);
    return data;
  },

  async create(payload: SafetyZoneCreatePayload): Promise<SafetyZone> {
    const { data } = await api.post<SafetyZone>('/v1/zones', payload);
    return data;
  },

  async update(id: number, payload: SafetyZoneUpdatePayload): Promise<SafetyZone> {
    const { data } = await api.put<SafetyZone>(`/v1/zones/${id}`, payload);
    return data;
  },

  /** Borrado lógico — la zona desaparece de los listados (recuperable por
   *  admin desde BD). NO toggle: si quieres desactivar sin borrar, usa
   *  setActive(id, false). */
  async delete(id: number): Promise<void> {
    await api.delete(`/v1/zones/${id}`);
  },

  /** Toggle isActive de la zona — sigue en la lista pero el motor no la
   *  evalúa cuando inactive. */
  async setActive(id: number, active: boolean): Promise<SafetyZone> {
    const path = active ? `/v1/zones/${id}/activate` : `/v1/zones/${id}/deactivate`;
    const { data } = await api.post<SafetyZone>(path);
    return data;
  },
};
