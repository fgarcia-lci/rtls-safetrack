import type { CompanyType } from './worker';
import type { ZoneType, TagStateValue } from './workerHistory';

export type EventType = 'PROXIMITY' | 'SOS';

export interface EventComment {
  id: number;
  authorUsername: string;
  authorDisplay: string | null;
  commentText: string;
  createdAt: string;
}

export interface EventDetail {
  eventType: EventType;
  eventId: number;
  startAt: string;
  endAt: string | null;
  durationSec: number | null;
  plantId: string;

  // Proximity-specific
  zoneId: number | null;
  zoneCode: string | null;
  zoneName: string | null;
  zoneType: ZoneType | null;
  severity: number | null;
  authorized: boolean | null;

  // SOS-specific
  sosStatus: string | null;

  // Lifecycle
  ackedAt: string | null;
  ackedBy: string | null;
  helpSentAt: string | null;
  helpSentBy: string | null;
  helpNotes: string | null;
  resolvedAt: string | null;
  resolvedBy: string | null;
  resolutionNotes: string | null;
  cancelledAt: string | null;
  cancelledBy: string | null;
  cancelReason: string | null;

  // Worker
  workerId: number | null;
  workerEmployeeCode: string | null;
  workerFullName: string | null;
  workerCompanyName: string | null;
  workerCompanyType: CompanyType | null;
  workerPhotoUrl: string | null;

  // Tag
  tagId: number | null;
  tagSerial: string | null;
  tagModel: string | null;
  tagBatteryPct: number | null;
  tagState: TagStateValue | null;
  tagLastSeenAt: string | null;

  comments: EventComment[];
}
