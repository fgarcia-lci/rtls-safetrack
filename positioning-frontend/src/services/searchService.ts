import { api } from './api';

export type SearchResultType = 'WORKER' | 'TAG' | 'ZONE';

export interface SearchResult {
  type: SearchResultType;
  id: number;
  label: string;
  sublabel: string;
  identifier: string;
}

export const searchService = {
  async search(plantId: string, q: string): Promise<SearchResult[]> {
    if (!q || q.trim().length < 2) return [];
    const { data } = await api.get<SearchResult[]>('/v1/search', {
      params: { plantId, q },
    });
    return data;
  },
};
