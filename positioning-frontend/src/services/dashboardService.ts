import { api } from './api';
import type { DashboardSummary } from '../types/dashboard';

export const dashboardService = {
  async getSummary(plantId: string): Promise<DashboardSummary> {
    const r = await api.get<DashboardSummary>('/v1/dashboard/summary', { params: { plantId } });
    return r.data;
  },
};
