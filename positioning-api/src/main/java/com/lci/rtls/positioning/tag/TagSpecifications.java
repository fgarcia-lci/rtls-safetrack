package com.lci.rtls.positioning.tag;

import jakarta.persistence.criteria.Predicate;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.util.StringUtils;

import java.util.ArrayList;
import java.util.List;

public final class TagSpecifications {

    private TagSpecifications() {}

    public static Specification<Tag> withFilters(String search, String plantId, TagState state, Boolean isAssigned) {
        return (root, query, cb) -> {
            List<Predicate> predicates = new ArrayList<>();

            if (StringUtils.hasText(search)) {
                String like = "%" + search.toLowerCase() + "%";
                predicates.add(cb.or(
                        cb.like(cb.lower(root.get("serial")), like),
                        cb.like(cb.lower(root.get("model")), like),
                        cb.like(cb.lower(root.get("vendor")), like)
                ));
            }
            if (StringUtils.hasText(plantId)) {
                predicates.add(cb.equal(root.get("plantId"), plantId));
            }
            if (state != null) {
                predicates.add(cb.equal(root.get("state"), state));
            }
            if (isAssigned != null) {
                if (isAssigned) {
                    predicates.add(cb.isNotNull(root.get("assignedWorker")));
                } else {
                    predicates.add(cb.isNull(root.get("assignedWorker")));
                }
            }
            return predicates.isEmpty() ? cb.conjunction() : cb.and(predicates.toArray(new Predicate[0]));
        };
    }
}
