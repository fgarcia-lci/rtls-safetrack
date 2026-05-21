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
  supervisorPhone?: string | null;
  supervisorEmail?: string | null;
  backupSupervisorId?: number | null;
  backupSupervisorName?: string | null;
  backupSupervisorPhone?: string | null;
  backupSupervisorEmail?: string | null;
  companyId?: number | null;
  companyCatalogName?: string | null;
  companyPhone?: string | null;
  companyEmail?: string | null;
  companyManagerId?: number | null;
  companyManagerName?: string | null;
  companyManagerPhone?: string | null;
  companyManagerEmail?: string | null;
  lastPrlTrainingDate?: string | null;
  prlValidMonths?: number;
  supervisorNotes?: string | null;
}

// Campos comunes para creación y edición — V13 introdujo flags + relaciones
// + PRL que son opcionales en ambos casos.
interface WorkerWritableFields {
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
  // V13
  isWorkerInPlant?: boolean;
  isSupervisor?: boolean;
  isCompanyManager?: boolean;
  supervisorId?: number | null;
  backupSupervisorId?: number | null;
  companyId?: number | null;
  lastPrlTrainingDate?: string | null;
  prlValidMonths?: number;
  supervisorNotes?: string | null;
}

export interface WorkerCreatePayload extends WorkerWritableFields {
  employeeCode: string;
}

export interface WorkerUpdatePayload extends WorkerWritableFields {
  isActive: boolean;
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
