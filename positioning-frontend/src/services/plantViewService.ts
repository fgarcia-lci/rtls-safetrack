import { api } from './api';
import type { PlantView } from '../pages/Live/types';

export const plantViewService = {
  async listForPlant(plantId: string): Promise<PlantView[]> {
    const { data } = await api.get<PlantView[]>('/v1/plant-views', { params: { plantId } });
    return data;
  },
};
