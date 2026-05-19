import { api } from './api';
import type {
  CompanyType,
  PageResponse,
  Worker,
  WorkerCreatePayload,
  WorkerUpdatePayload,
} from '../types/worker';
import type { RiskScore, WorkerHistory } from '../types/workerHistory';

export interface WorkerListParams {
  search?: string;
  companyType?: CompanyType;
  isActive?: boolean;
  page?: number;
  size?: number;
  sort?: string;
}

export const workerService = {
  async list(params: WorkerListParams = {}): Promise<PageResponse<Worker>> {
    const { data } = await api.get<PageResponse<Worker>>('/v1/workers', { params });
    return data;
  },

  async getById(id: number): Promise<Worker> {
    const { data } = await api.get<Worker>(`/v1/workers/${id}`);
    return data;
  },

  async create(payload: WorkerCreatePayload): Promise<Worker> {
    const { data } = await api.post<Worker>('/v1/workers', payload);
    return data;
  },

  async update(id: number, payload: WorkerUpdatePayload): Promise<Worker> {
    const { data } = await api.put<Worker>(`/v1/workers/${id}`, payload);
    return data;
  },

  async softDelete(id: number): Promise<void> {
    await api.delete(`/v1/workers/${id}`);
  },

  /**
   * Histórico completo (posiciones + eventos + SOS + tiempo en zona) entre
   * dos timestamps ISO. Si rango es grande, el backend reduce las posiciones
   * — se puede forzar resolución fina con resolutionSeconds.
   */
  async getHistory(id: number, from: string, to: string, resolutionSeconds?: number): Promise<WorkerHistory> {
    const params: Record<string, string | number> = { from, to };
    if (resolutionSeconds != null) params.resolutionSeconds = resolutionSeconds;
    const { data } = await api.get<WorkerHistory>(`/v1/workers/${id}/history`, { params });
    return data;
  },

  /**
   * Risk score compuesto. Sin parámetros = últimos 30 días. Se puede acotar
   * con from/to ISO.
   */
  async getRiskScore(id: number, from?: string, to?: string): Promise<RiskScore> {
    const params: Record<string, string> = {};
    if (from) params.from = from;
    if (to) params.to = to;
    const { data } = await api.get<RiskScore>(`/v1/workers/${id}/risk-score`, { params });
    return data;
  },
};
