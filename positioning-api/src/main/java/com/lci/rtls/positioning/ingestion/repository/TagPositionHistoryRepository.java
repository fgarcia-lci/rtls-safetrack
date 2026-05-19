package com.lci.rtls.positioning.ingestion.repository;

import com.lci.rtls.positioning.ingestion.document.TagPositionHistory;
import org.springframework.data.domain.Sort;
import org.springframework.data.mongodb.repository.MongoRepository;

import java.time.Instant;
import java.util.List;

public interface TagPositionHistoryRepository extends MongoRepository<TagPositionHistory, String> {

    List<TagPositionHistory> findByTagIdAndTsBetweenOrderByTsAsc(
            String tagId, Instant from, Instant to);

    /** Variante paginada — útil cuando el rango es grande. */
    List<TagPositionHistory> findByTagIdAndTsBetween(
            String tagId, Instant from, Instant to, Sort sort);
}

