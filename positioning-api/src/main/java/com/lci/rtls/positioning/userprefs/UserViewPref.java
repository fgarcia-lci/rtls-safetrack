package com.lci.rtls.positioning.userprefs;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;
import org.springframework.data.annotation.CreatedDate;
import org.springframework.data.annotation.LastModifiedDate;
import org.springframework.data.jpa.domain.support.AuditingEntityListener;

import jakarta.persistence.EntityListeners;
import java.time.Instant;

/**
 * Per-user UI preferences for a given plant-view. Stored as a JSON blob in
 * {@code prefs_json} so the frontend can evolve without DB migrations. The
 * backend only persists, it does not interpret the content.
 *
 * <p>Identity = JWT subject ({@code Authentication.getName()}).
 */
@Entity
@Table(name = "pos_user_view_pref")
@EntityListeners(AuditingEntityListener.class)
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class UserViewPref {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, length = 150)
    private String username;

    @Column(name = "plant_view_id", nullable = false)
    private Long plantViewId;

    @Column(name = "prefs_json", nullable = false, columnDefinition = "JSON")
    private String prefsJson;

    @CreatedDate
    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @LastModifiedDate
    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;
}
