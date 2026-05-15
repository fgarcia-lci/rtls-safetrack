import type { CompanyType } from './zones';

export type SosStatus = 'REQUESTED' | 'ACKED' | 'HELP_SENT' | 'RESOLVED' | 'CANCELLED';

/** Push WebSocket que llega a /topic/sos/{plantId} cuando se dispara/cambia un SOS. */
export interface SosNotification {
  eventId: number;
  triggeredAt: string;
  status: SosStatus;

  tagSerial?: string | null;
  workerId?: number | null;
  workerName?: string | null;
  workerCode?: string | null;
  workerPhotoUrl?: string | null;
  workerCompanyName?: string | null;
  workerCompanyType?: CompanyType | null;
  workerRoleInPlant?: string | null;
  workerPhone?: string | null;

  posX?: number | null;
  posY?: number | null;
  posZ?: number | null;
  zonesAtTrigger?: number[] | null;
  nearbyWorkerIds?: number[] | null;

  batteryPct?: number | null;
  rssiDbm?: number | null;
}

/** Vista REST de un evento SOS para listados / acciones. */
export interface SosEventDto {
  id: number;
  workerId?: number | null;
  tagId: number;
  plantId: string;
  triggeredAt: string;
  status: SosStatus;
  ackedAt?: string | null;
  ackedBy?: string | null;
  helpSentAt?: string | null;
  helpSentBy?: string | null;
  helpNotes?: string | null;
  resolvedAt?: string | null;
  resolvedBy?: string | null;
  resolutionNotes?: string | null;
  cancelledAt?: string | null;
  cancelledBy?: string | null;
  cancelReason?: string | null;
}
