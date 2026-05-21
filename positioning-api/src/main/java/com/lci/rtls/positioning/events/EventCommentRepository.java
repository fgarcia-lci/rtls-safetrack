package com.lci.rtls.positioning.events;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface EventCommentRepository extends JpaRepository<EventComment, Long> {
    List<EventComment> findByEventTypeAndEventIdOrderByCreatedAtAsc(
            EventComment.EventType eventType, Long eventId);
}
