package com.lci.rtls.positioning.events.dto;

import com.lci.rtls.positioning.events.EventComment;

import java.time.Instant;

public record EventCommentDto(
        Long id,
        String authorUsername,
        String authorDisplay,
        String commentText,
        Instant createdAt
) {
    public static EventCommentDto from(EventComment c) {
        return new EventCommentDto(
                c.getId(),
                c.getAuthorUsername(),
                c.getAuthorDisplay(),
                c.getCommentText(),
                c.getCreatedAt()
        );
    }
}
