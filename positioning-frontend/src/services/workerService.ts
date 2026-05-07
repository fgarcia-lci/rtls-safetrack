import { api } from './api';
import type {
  CompanyType,
  PageResponse,
  Worker,
  WorkerCreatePayload,
  WorkerUpdatePayload,
} from '../types/worker';

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
};
