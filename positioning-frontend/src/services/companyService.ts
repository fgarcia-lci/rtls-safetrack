import { api } from './api';
import type { Company, CompanyUpsertPayload } from '../types/company';
import type { Worker } from '../types/worker';

export const companyService = {
  async list(isActive?: boolean): Promise<Company[]> {
    const params = isActive !== undefined ? { isActive } : {};
    const { data } = await api.get<Company[]>('/v1/companies', { params });
    return data;
  },

  async getById(id: number): Promise<Company> {
    const { data } = await api.get<Company>(`/v1/companies/${id}`);
    return data;
  },

  async listWorkers(id: number): Promise<Worker[]> {
    const { data } = await api.get<Worker[]>(`/v1/companies/${id}/workers`);
    return data;
  },

  async create(payload: CompanyUpsertPayload): Promise<Company> {
    const { data } = await api.post<Company>('/v1/companies', payload);
    return data;
  },

  async update(id: number, payload: CompanyUpsertPayload): Promise<Company> {
    const { data } = await api.put<Company>(`/v1/companies/${id}`, payload);
    return data;
  },

  async softDelete(id: number): Promise<void> {
    await api.delete(`/v1/companies/${id}`);
  },
};
