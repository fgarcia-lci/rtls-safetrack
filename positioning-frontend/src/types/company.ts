import type { CompanyType } from './worker';

export interface Company {
  id: number;
  name: string;
  type: CompanyType;
  /** Contacto general de la empresa (centralita). */
  phone: string;
  email: string;
  /** Manager personal (opcional, puede ser null). */
  managerPersonId: number | null;
  managerName: string | null;
  managerPhone: string | null;
  managerEmail: string | null;
  managerNotes: string | null;
  isActive: boolean;
}

export interface CompanyUpsertPayload {
  name: string;
  type: CompanyType;
  phone: string;
  email: string;
  managerPersonId?: number | null;
  managerNotes?: string | null;
  isActive?: boolean;
}
