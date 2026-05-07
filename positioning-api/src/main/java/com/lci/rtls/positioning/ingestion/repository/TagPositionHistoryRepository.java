package com.lci.rtls.positioning.ingestion.repository;

import com.lci.rtls.positioning.ingestion.document.TagPositionHistory;
import org.springframework.data.mongodb.repository.MongoRepository;

public interface TagPositionHistoryRepository extends MongoRepository<TagPositionHistory, String> {
}
