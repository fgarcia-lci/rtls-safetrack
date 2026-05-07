package com.lci.rtls.positioning.worker;

/**
 * Tipo de relación del worker con la empresa cliente.
 * Mapea al ENUM de la columna {@code pos_workers.company_type}.
 */
public enum CompanyType {
    /** Empleado propio del cliente. */
    INTERNAL,
    /** Trabajador de empresa subcontratada. */
    CONTRACTOR,
    /** Visita puntual (inspector, comercial, técnico externo). */
    VISITOR
}
