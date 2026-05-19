package com.lci.rtls.positioning.notification;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

import java.time.Instant;

public interface NotificationLogRepository extends JpaRepository<NotificationLog, Long> {

    Page<NotificationLog> findByRecipientIdOrderByTsDesc(Long personId, Pageable pageable);

    Page<NotificationLog> findByPlantIdAndTsAfterOrderByTsDesc(String plantId, Instant since, Pageable pageable);
}
