package com.lci.rtls.positioning.search;

/**
 * Resultado tipado de la búsqueda global. El frontend agrupa visualmente
 * por {@code type} (Operarios / Tags / Zonas) en el autocomplete.
 *
 * @param type        WORKER | TAG | ZONE
 * @param id          ID interno (Long).
 * @param label       Línea principal (nombre del operario, serial, nombre de zona).
 * @param sublabel    Línea secundaria (empleado/empresa, worker asignado, tipo de zona).
 * @param identifier  Identificador externo útil para navegar — serial del tag,
 *                    employeeCode del worker, code de la zona.
 */
public record SearchResultDto(
        String type,
        Long id,
        String label,
        String sublabel,
        String identifier
) {}
