import { api } from './api';
import type { EventComment, EventDetail, EventType } from '../types/eventDetail';

export const eventDetailService = {
  async get(type: EventType, id: number): Promise<EventDetail> {
    const { data } = await api.get<EventDetail>(`/v1/events/${type}/${id}`);
    return data;
  },
  async addComment(type: EventType, id: number, text: string): Promise<EventComment> {
    const { data } = await api.post<EventComment>(
      `/v1/events/${type}/${id}/comments`,
      { commentText: text },
    );
    return data;
  },
};
