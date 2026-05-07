package com.lci.rtls.positioning.zone;

import jakarta.persistence.EmbeddedId;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/**
 * Relación zona ↔ rol que puede entrar. Mapea {@code pos_zone_permissions}.
 *
 * <p>Si un trabajador sin ningún rol permitido entra en la zona, el
 * {@code ProximityEvent} resultante se marca {@code authorized = false} y la
 * severidad se eleva.
 *
 * <p>PK compuesta {@code (zone_id, role_code)} vía {@link ZonePermissionId}.
 */
@Entity
@Table(name = "pos_zone_permissions")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class ZonePermission {

    @EmbeddedId
    private ZonePermissionId id;
}
