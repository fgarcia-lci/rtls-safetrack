import { api } from './api';
import type { PlaybackDto } from '../types/playback';

export const playbackService = {
  /** Trae el snapshot batch del reproductor para [from, to]. Cap backend: 24h. */
  async getPlayback(
    plantId: string,
    from: string,
    to: string,
    resolutionSeconds?: number,
  ): Promise<PlaybackDto> {
    const params: Record<string, string | number> = { plantId, from, to };
    if (resolutionSeconds != null) params.resolutionSeconds = resolutionSeconds;
    const { data } = await api.get<PlaybackDto>('/v1/playback', { params });
    return data;
  },
};
