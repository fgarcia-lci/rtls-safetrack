import { api } from './api';
import type { Worker } from '../types/worker';

/**
 * Lectura de personas marcadas como supervisor (o supervisor+manager si se
 * activa la flag) para poblar dropdowns en el frontend. NO hace CRUD —
 * supervisores se crean/editan vía el WorkerDialog estándar marcando el flag
 * isSupervisor en la persona correspondiente.
 */
export const supervisorService = {
  async list(includeManagers = false): Promise<Worker[]> {
    const { data } = await api.get<Worker[]>('/v1/supervisors', {
      params: { includeManagers },
    });
    return data;
  },
};
