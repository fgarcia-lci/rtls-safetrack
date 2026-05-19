export type CompanyType = 'INTERNAL' | 'CONTRACTOR' | 'VISITOR';

export interface Worker {
  id: number;
  employeeCode: string;
  fullName: string;
  phone?: string | null;
  email?: string | null;
  companyName: string;
  companyType: CompanyType;
  roleInPlant?: string | null;
  linkedUserId?: string | null;
  supervisorUserId?: string | null;
  hireDate?: string | null;
  photoUrl?: string | null;
  isActive: boolean;
  notes?: string | null;
  createdAt: string;
  updatedAt: string;
  createdBy?: string | null;
  updatedBy?: string | null;
  // V13 — roles unificados + supervisor + PRL
  isWorkerInPlant?: boolean;
  isSupervisor?: boolean;
  isCompanyManager?: boolean;
  supervisorId?: number | null;
  supervisorName?: string | null;
  backupSupervisorId?: number | null;
  backupSupervisorName?: string | null;
  companyId?: number | null;
  lastPrlTrainingDate?: string | null;
  prlValidMonths?: number;
  supervisorNotes?: string | null;
}

export interface WorkerCreatePayload {
  employeeCode: string;
  fullName: string;
  phone?: string | null;
  email?: string | null;
  companyName: string;
  companyType: CompanyType;
  roleInPlant?: string | null;
  linkedUserId?: string | null;
  supervisorUserId?: string | null;
  hireDate?: string | null;
  photoUrl?: string | null;
  notes?: string | null;
}

export interface WorkerUpdatePayload {
  fullName: string;
  phone?: string | null;
  email?: string | null;
  companyName: string;
  companyType: CompanyType;
  roleInPlant?: string | null;
  linkedUserId?: string | null;
  supervisorUserId?: string | null;
  hireDate?: string | null;
  photoUrl?: string | null;
  isActive: boolean;
  notes?: string | null;
}

export interface PageResponse<T> {
  content: T[];
  totalElements: number;
  totalPages: number;
  size: number;
  number: number;
  first: boolean;
  last: boolean;
  numberOfElements: number;
  empty: boolean;
}
