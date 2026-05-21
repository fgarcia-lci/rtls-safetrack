import { api } from './api';
import type { FloorplanUpsertPayload, PlantView } from '../pages/Live/types';

export interface PlantViewCalibration {
  defaultYOffset?: number | null;
  defaultAvatarHeightM?: number | null;
  /** Whole defaultCamera JSON string ({"eye":[..],"look":[..],"up":[..]}). */
  defaultCamera?: string | null;
}

export const plantViewService = {
  async listForPlant(plantId: string): Promise<PlantView[]> {
    const { data } = await api.get<PlantView[]>('/v1/plant-views', { params: { plantId } });
    return data;
  },
  /** Admin only — includes inactive views (for the management UI). */
  async listAllForPlant(plantId: string): Promise<PlantView[]> {
    const { data } = await api.get<PlantView[]>('/v1/plant-views/admin', { params: { plantId } });
    return data;
  },
  /** Admin-only. 403 si el usuario no tiene rol ADMIN. */
  async updateCalibration(plantViewId: number, body: PlantViewCalibration): Promise<PlantView> {
    const { data } = await api.put<PlantView>(`/v1/plant-views/${plantViewId}/calibration`, body);
    return data;
  },
  async createFloorplan(payload: FloorplanUpsertPayload): Promise<PlantView> {
    const { data } = await api.post<PlantView>('/v1/plant-views/floorplan', payload);
    return data;
  },
  async updateFloorplan(id: number, payload: FloorplanUpsertPayload): Promise<PlantView> {
    const { data } = await api.put<PlantView>(`/v1/plant-views/${id}/floorplan`, payload);
    return data;
  },
  async deletePlantView(id: number): Promise<void> {
    await api.delete(`/v1/plant-views/${id}`);
  },
  /** Returns the URL to fetch the SVG asset for a FLOORPLAN_2D view. */
  assetUrl(id: number): string {
    return `/api/v1/plant-views/${id}/asset`;
  },
};
