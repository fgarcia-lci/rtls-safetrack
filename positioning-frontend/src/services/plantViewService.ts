import { api } from './api';
import type { PlantView } from '../pages/Live/types';

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
  /** Admin-only. 403 si el usuario no tiene rol ADMIN. */
  async updateCalibration(plantViewId: number, body: PlantViewCalibration): Promise<PlantView> {
    const { data } = await api.put<PlantView>(`/v1/plant-views/${plantViewId}/calibration`, body);
    return data;
  },
};
