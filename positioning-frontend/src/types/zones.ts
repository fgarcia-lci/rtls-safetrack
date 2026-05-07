export type ZoneType = 'DANGER' | 'RESTRICTED' | 'WARNING' | 'SAFE' | 'INFO';

/** Primitiva con la que se creó/edita la zona en el editor 3D. Metadata —
 *  la geometría canónica vive siempre en polygon2d + zMin/zMax. */
export type ShapeType = 'POLYGON' | 'BOX' | 'CYLINDER';

export interface NotificationPolicy {
  notifyWorker: boolean;
  notifySupervisor: boolean;
  notifySafetyTeam: boolean;
  notifyAllManagers: boolean;
  channelInApp: boolean;
  channelEmail: boolean;
  channelHapticMqtt: boolean;
}

export interface SafetyZone {
  id: number;
  plantId: string;
  code: string;
  name: string;
  description?: string | null;
  type: ZoneType;
  shapeType: ShapeType;
  severity: number;
  /** Array de [x, y] en coords mundiales. Polígono cerrado (no se repite el primer vértice). */
  polygon2d: [number, number][];
  zMin: number;
  zMax: number;
  bufferApproachM?: number | null;
  relatedDeviceId?: string | null;
  isActive: boolean;
  displayColor?: string | null;
  allowedRoles: string[];
  notificationPolicy: NotificationPolicy;
  createdAt: string;
  updatedAt: string;
}

export type ProximityState = 'OUTSIDE' | 'APPROACHING' | 'INSIDE';

export interface ProximityFactor {
  tagId: string;
  zoneId: number;
  factor: number;
  state: ProximityState;
}

export interface ProximityBatch {
  ts: string;
  proximities: ProximityFactor[];
}

export type AlertEventKind = 'ENTER' | 'EXIT';
export type AlertState = 'OPEN' | 'CLOSED';

export interface AlertNotification {
  eventId: number;
  kind: AlertEventKind;
  state: AlertState;
  ts: string;
  tagSerial: string;
  workerName?: string | null;
  workerCode?: string | null;
  zoneId: number;
  zoneCode: string;
  zoneName: string;
  zoneType: ZoneType;
  severity: number;
  displayColor?: string | null;
  durationSec?: number | null;
}

/** Vista REST de un ProximityEvent (devuelto por /v1/proximity-events). */
export interface ProximityEvent {
  id: number;
  workerId?: number | null;
  workerName?: string | null;
  workerCode?: string | null;
  tagId: number;
  tagSerial?: string | null;
  zoneId: number;
  zoneCode?: string | null;
  zoneName?: string | null;
  zoneType?: ZoneType | null;
  zoneSeverity?: number | null;
  zoneColor?: string | null;
  plantId: string;
  enteredAt: string;
  exitedAt?: string | null;
  durationSec?: number | null;
  maxSeverity?: number | null;
  authorized?: boolean | null;
  acknowledgedAt?: string | null;
  acknowledgedBy?: string | null;
}
