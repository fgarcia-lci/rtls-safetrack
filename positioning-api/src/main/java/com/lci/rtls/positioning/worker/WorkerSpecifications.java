package com.lci.rtls.positioning.worker;

import jakarta.persistence.criteria.Predicate;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.util.StringUtils;

import java.util.ArrayList;
import java.util.List;

/**
 * Filtros dinámicos sobre {@link Worker} para el listado paginado.
 */
public final class WorkerSpecifications {

    private WorkerSpecifications() {}

    /**
     * Filtro por rol. WORKER (default histórico) limita a personas en planta,
     * SUPERVISOR/MANAGER muestran sólo esos roles, ALL incluye a todos los
     * registros sin filtrar por rol (útil cuando un supervisor o manager
     * no es trabajador y necesita editarse desde la UI).
     */
    public enum RoleFilter { WORKER, SUPERVISOR, MANAGER, ALL }

    public static Specification<Worker> withFilters(String search,
                                                    CompanyType companyType,
                                                    Boolean isActive,
                                                    RoleFilter roleFilter) {
        return (root, query, cb) -> {
            List<Predicate> predicates = new ArrayList<>();

            // Por defecto (roleFilter == null o WORKER) seguimos devolviendo
            // sólo trabajadores en planta, para no romper integraciones que
            // ya esperan ese comportamiento. La UI puede pedir otros valores
            // para gestionar supervisores y managers desde la misma página.
            RoleFilter effective = roleFilter != null ? roleFilter : RoleFilter.WORKER;
            switch (effective) {
                case WORKER -> predicates.add(cb.isTrue(root.get("workerInPlant")));
                case SUPERVISOR -> predicates.add(cb.isTrue(root.get("supervisor")));
                case MANAGER -> predicates.add(cb.isTrue(root.get("companyManager")));
                case ALL -> { /* sin filtro de rol */ }
            }

            if (StringUtils.hasText(search)) {
                String like = "%" + search.toLowerCase() + "%";
                predicates.add(cb.or(
                        cb.like(cb.lower(root.get("fullName")), like),
                        cb.like(cb.lower(root.get("employeeCode")), like),
                        cb.like(cb.lower(root.get("companyName")), like)
                ));
            }
            if (companyType != null) {
                predicates.add(cb.equal(root.get("companyType"), companyType));
            }
            if (isActive != null) {
                predicates.add(cb.equal(root.get("isActive"), isActive));
            }

            return cb.and(predicates.toArray(new Predicate[0]));
        };
    }
}
