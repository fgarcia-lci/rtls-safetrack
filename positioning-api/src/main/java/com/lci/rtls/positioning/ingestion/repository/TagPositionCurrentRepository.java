package com.lci.rtls.positioning.ingestion.repository;

import com.lci.rtls.positioning.ingestion.document.TagPositionCurrent;
import org.springframework.data.mongodb.repository.MongoRepository;

import java.util.List;

public interface TagPositionCurrentRepository extends MongoRepository<TagPositionCurrent, String> {

    List<TagPositionCurrent> findByPlantId(String plantId);
}
