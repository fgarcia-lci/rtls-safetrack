import type { CompanyType } from './zones';

export interface ZoneRanking {
  zoneId: number;
  code: string;
  name: string;
  type: string;
  eventCount: number;
}

export interface WorkerRanking {
  workerId: number;
  employeeCode: string;
  fullName: string;
  companyName: string | null;
  companyType: CompanyType | null;
  photoUrl: string | null;
  eventCount: number;
}

export interface CompanyPresence {
  companyName: string;
  companyType: CompanyType;
  workersActive: number;
}

export interface DashboardSummary {
  plantId: string;
  generatedAt: string;

  workersTotal: number;
  workersActive: number;
  workersWithTag: number;

  tagsTotal: number;
  tagsAssigned: number;
  tagsLowBattery: number;

  alertsToday: number;
  alertsLast24h: number;
  alertsLast7d: number;
  avgMttrSecondsToday: number | null;

  sosActive: number;
  sosToday: number;

  topZonesToday: ZoneRanking[];
  topWorkersToday: WorkerRanking[];
  companiesPresent: CompanyPresence[];
}
