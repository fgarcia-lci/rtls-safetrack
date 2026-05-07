import { api } from './api';
import type { PageResponse } from '../types/worker';
import type { Tag, TagCreatePayload, TagStateValue, TagUpdatePayload } from '../types/tag';

export interface TagListParams {
  search?: string;
  plantId?: string;
  state?: TagStateValue;
  isAssigned?: boolean;
  page?: number;
  size?: number;
  sort?: string;
}

export const tagService = {
  async list(params: TagListParams = {}): Promise<PageResponse<Tag>> {
    const { data } = await api.get<PageResponse<Tag>>('/v1/tags', { params });
    return data;
  },
  async getBySerial(serial: string): Promise<Tag> {
    const { data } = await api.get<Tag>('/v1/tags/by-serial', { params: { serial } });
    return data;
  },
  async create(payload: TagCreatePayload): Promise<Tag> {
    const { data } = await api.post<Tag>('/v1/tags', payload);
    return data;
  },
  async update(id: number, payload: TagUpdatePayload): Promise<Tag> {
    const { data } = await api.put<Tag>(`/v1/tags/${id}`, payload);
    return data;
  },
  async decommission(id: number): Promise<void> {
    await api.delete(`/v1/tags/${id}`);
  },
  async assign(id: number, workerId: number): Promise<Tag> {
    const { data } = await api.post<Tag>(`/v1/tags/${id}/assign`, { workerId });
    return data;
  },
  async unassign(id: number): Promise<Tag> {
    const { data } = await api.post<Tag>(`/v1/tags/${id}/unassign`, {});
    return data;
  },
};
