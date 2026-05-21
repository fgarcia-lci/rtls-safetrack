import type { CompanyType } from './worker';
import type { ZoneType } from './workerHistory';

export interface PlaybackPositionPoint {
  ts: string;
  x: number;
  y: number;
  z: number;
}

export interface PlaybackWorker {
  workerId: number;
  employeeCode: string;
  fullName: string;
  companyName: string | null;
  companyType: CompanyType | null;
  photoUrl: string | null;
  tagSerial: string;
  positions: PlaybackPositionPoint[];
}

export interface PlaybackProximityEvent {
  id: number;
  workerId: number;
  zoneId: number;
  zoneCode: string | null;
  zoneName: string | null;
  zoneType: ZoneType | null;
  severity: number | null;
  enteredAt: string;
  exitedAt: string | null;
  durationSec: number | null;
}

export interface PlaybackSosEvent {
  id: number;
  workerId: number;
  triggeredAt: string;
  resolvedAt: string | null;
  status: string;
}

export interface PlaybackDto {
  plantId: string;
  from: string;
  to: string;
  resolutionSeconds: number;
  workers: PlaybackWorker[];
  proximityEvents: PlaybackProximityEvent[];
  sosEvents: PlaybackSosEvent[];
}
