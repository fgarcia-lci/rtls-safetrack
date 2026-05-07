package com.lci.rtls.positioning.zone;

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

import java.time.Instant;

/**
 * Registro de una entrada/salida de un tag en una zona. Mapea
 * {@code pos_proximity_events}.
 *
 * <p>Mientras el tag está dentro, {@code exitedAt = null}. Al salir, el motor
 * ({@code ZoneEngineService}) cierra el evento. {@code durationSec} se calcula
 * en BD (columna {@code GENERATED ALWAYS AS}) — es de solo lectura desde JPA.
 *
 * <p>Tablas relacionadas se referencian por id (sin {@code @ManyToOne}) para
 * evitar fetch innecesario en el motor que corre cada 500 ms.
 */
@Entity
@Table(name = "pos_proximity_events")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class ProximityEvent {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /** FK a {@code pos_workers.id}. NULL si el tag no estaba asignado al entrar. */
    @Column(name = "worker_id")
    private Long workerId;

    @Column(name = "tag_id", nullable = false)
    private Long tagId;

    @Column(name = "zone_id", nullable = false)
    private Long zoneId;

    @Column(name = "plant_id", nullable = false, length = 50)
    private String plantId;

    @Column(name = "entered_at", nullable = false)
    private Instant enteredAt;

    /** NULL mientras el tag sigue dentro de la zona. */
    @Column(name = "exited_at")
    private Instant exitedAt;

    /** Calculada en BD. Solo lectura desde JPA. */
    @Column(name = "duration_sec", insertable = false, updatable = false)
    private Integer durationSec;

    /** JSON {@code {"x":..,"y":..,"z":..}} del punto donde entró. */
    @Column(name = "entry_point", columnDefinition = "JSON")
    private String entryPoint;

    /** JSON {@code {"x":..,"y":..,"z":..}} del punto donde salió. NULL si abierto. */
    @Column(name = "exit_point", columnDefinition = "JSON")
    private String exitPoint;

    @Column(name = "max_severity")
    private Integer maxSeverity;

    /** JSON array {@code [{"channel":..,"pattern":..,"ts":..}, ...]}. */
    @Column(name = "actions_taken", columnDefinition = "JSON")
    private String actionsTaken;

    /** ¿El worker tenía un rol permitido? Nullable si tag sin worker asignado. */
    @Column(name = "authorized")
    private Boolean authorized;

    @Column(name = "acknowledged_at")
    private Instant acknowledgedAt;

    @Column(name = "acknowledged_by", length = 36)
    private String acknowledgedBy;
}
