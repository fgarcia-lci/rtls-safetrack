// Tipos del backend /v1/workers/{id}/history y /risk-score. Espejo de los
// records Java en WorkerHistoryDto / RiskScoreDto. Mantener en sync.

export type ZoneType = 'DANGER' | 'RESTRICTED' | 'WARNING' | 'SAFE' | 'INFO';

export interface PositionPoint {
  ts: string;
  x: number;
  y: number;
  z: number;
}

export interface HistoryProximityEvent {
  id: number;
  zoneId: number;
  zoneCode: string | null;
  zoneName: string | null;
  zoneType: ZoneType | null;
  severity: number | null;
  enteredAt: string;
  exitedAt: string | null;
  durationSec: number | null;
  acknowledged: boolean;
}

export interface HistorySosEvent {
  id: number;
  triggeredAt: string;
  resolvedAt: string | null;
  status: string;
}

export interface TimeInZone {
  zoneId: number;
  zoneCode: string | null;
  zoneName: string | null;
  zoneType: ZoneType | null;
  secondsInside: number;
  entries: number;
}

export interface EventCounts {
  dangerEntries: number;
  restrictedEntries: number;
  warningEntries: number;
  otherEntries: number;
  sosCount: number;
  totalDurationDangerSec: number;
}

export interface WorkerHistory {
  workerId: number;
  from: string;
  to: string;
  positions: PositionPoint[];
  proximityEvents: HistoryProximityEvent[];
  sosEvents: HistorySosEvent[];
  timeInZones: TimeInZone[];
  counts: EventCounts;
}

export type RiskLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export interface RiskBreakdown {
  dangerEntries: number;
  restrictedEntries: number;
  warningEntries: number;
  sosCount: number;
  minutesInsideDanger: number;
  recidivismFactor: number;
  dangerPoints: number;
  restrictedPoints: number;
  warningPoints: number;
  sosPoints: number;
  dangerTimePoints: number;
}

export interface RiskTopZone {
  zoneId: number;
  zoneCode: string | null;
  zoneName: string | null;
  entries: number;
}

export interface RiskScore {
  workerId: number;
  from: string;
  to: string;
  raw: number;
  normalized: number;
  level: RiskLevel;
  breakdown: RiskBreakdown;
  topZones: RiskTopZone[];
}
