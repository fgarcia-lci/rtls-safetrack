export type TagStateValue =
  | 'ACTIVE'
  | 'IDLE'
  | 'LOW_BATTERY'
  | 'LOST'
  | 'UNKNOWN'
  | 'DECOMMISSIONED';

export type CompanyType = 'INTERNAL' | 'CONTRACTOR' | 'VISITOR';

export interface Tag {
  id: number;
  serial: string;
  model?: string | null;
  vendor?: string | null;
  firmwareVersion?: string | null;
  batteryLastPct?: number | null;
  lastSeenAt?: string | null;
  state: TagStateValue;
  assignedWorkerId?: number | null;
  assignedWorkerName?: string | null;
  assignedWorkerCode?: string | null;
  assignedWorkerCompanyName?: string | null;
  assignedWorkerCompanyType?: CompanyType | null;
  assignedAt?: string | null;
  plantId: string;
  notes?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TagCreatePayload {
  serial: string;
  model?: string | null;
  vendor?: string | null;
  firmwareVersion?: string | null;
  plantId: string;
  notes?: string | null;
}

export interface TagUpdatePayload {
  model?: string | null;
  vendor?: string | null;
  firmwareVersion?: string | null;
  plantId: string;
  notes?: string | null;
}
