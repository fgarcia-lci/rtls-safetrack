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

    public static Specification<Worker> withFilters(String search, CompanyType companyType, Boolean isActive) {
        return (root, query, cb) -> {
            List<Predicate> predicates = new ArrayList<>();

            // El endpoint /v1/workers solo devuelve trabajadores reales — las
            // personas que sólo son supervisor o manager se acceden vía
            // /v1/persons (admin) o /v1/supervisors. Esto evita que la lista
            // de "trabajadores en planta" se contamine con roles auxiliares.
            predicates.add(cb.isTrue(root.get("workerInPlant")));

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
