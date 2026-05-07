import type { TagStateValue } from './tag';

export type Quality = 'GOOD' | 'DEGRADED' | 'BAD';

export interface PositionSnapshot {
  tagId: string;
  plantId: string;
  ts: string;
  x: number;
  y: number;
  z: number;
  accuracyM?: number | null;
  quality: Quality;
  source?: string;
  seq?: number | null;
  updatedAt?: string;
}

export interface RealtimePosition {
  tagId: string;
  x: number;
  y: number;
  z: number;
  quality: Quality;
  ts: string;
}

export interface PositionsBatch {
  ts: string;
  positions: RealtimePosition[];
}

export interface InterpolatedPosition {
  tagId: string;
  x: number;
  y: number;
  z: number;
  quality: Quality;
}

export type { TagStateValue };
