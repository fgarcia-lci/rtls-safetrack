package com.lci.rtls.positioning.zone;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EntityListeners;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;
import org.springframework.data.annotation.CreatedBy;
import org.springframework.data.annotation.CreatedDate;
import org.springframework.data.annotation.LastModifiedDate;
import org.springframework.data.jpa.domain.support.AuditingEntityListener;

import java.math.BigDecimal;
import java.time.Instant;

/**
 * Zona de seguridad definida sobre una planta. Mapea {@code pos_safety_zones}.
 *
 * <p>La geometría es un PRISMA VERTICAL: un polígono 2D en coords mundiales del
 * modelo (XY top-down) extruido entre {@code zMin} y {@code zMax}. El motor de
 * proximidad evalúa punto-en-polígono (ray casting) + intersección de altura.
 *
 * <p>{@code polygon2d} y {@code actionOnEntry} se persisten como JSON (String);
 * el service se encarga de serializar/deserializar contra POJOs específicos.
 */
@Entity
@Table(name = "pos_safety_zones")
@EntityListeners(AuditingEntityListener.class)
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class SafetyZone {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, length = 50)
    private String plantId;

    @Column(nullable = false, length = 50)
    private String code;

    @Column(nullable = false, length = 200)
    private String name;

    @Column(columnDefinition = "TEXT")
    private String description;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private ZoneType type;

    /**
     * Tipo de primitiva con la que se creó la zona — metadata para que el
     * editor recree el manipulador correcto. La geometría canónica siempre
     * vive en {@code polygon2d + zMin/zMax}.
     */
    @Enumerated(EnumType.STRING)
    @Column(name = "shape_type", nullable = false, length = 20)
    private ShapeType shapeType;

    /** 1 = informativa, 5 = crítica. Default 3. */
    @Column(nullable = false)
    private Integer severity;

    /** Array JSON de [x, y] en orden, polígono cerrado. Coords mundiales del modelo. */
    @Column(name = "polygon_2d", nullable = false, columnDefinition = "JSON")
    private String polygon2d;

    @Column(name = "z_min", nullable = false, precision = 6, scale = 3)
    private BigDecimal zMin;

    @Column(name = "z_max", nullable = false, precision = 6, scale = 3)
    private BigDecimal zMax;

    /**
     * Distancia (metros) desde el borde del polígono a la que empieza el estado
     * {@code APPROACHING}. El motor calcula {@code proximity_factor ∈ [0..1]}
     * usando este buffer (0 al borde exterior del buffer, 1 dentro del polígono).
     */
    @Column(name = "buffer_approach_m", precision = 4, scale = 2)
    private BigDecimal bufferApproachM;

    /** FK soft a {@code device_catalog} del DT (máquina asociada a la zona). */
    @Column(length = 50)
    private String relatedDeviceId;

    @Column(nullable = false)
    private boolean isActive;

    /**
     * Borrado lógico: NULL = zona viva. Si se setea (= timestamp del
     * borrado), la zona desaparece de listados y del motor de proximidad
     * — pero queda en BD para recuperación admin.
     */
    @Column(name = "deleted_at")
    private Instant deletedAt;

    /** Color hex {@code #RRGGBB} o {@code #RRGGBBAA}. */
    @Column(length = 9)
    private String displayColor;

    /** Array JSON de acciones automáticas a disparar al entrar. */
    @Column(name = "action_on_entry", columnDefinition = "JSON")
    private String actionOnEntry;

    @CreatedDate
    @Column(updatable = false)
    private Instant createdAt;

    @LastModifiedDate
    private Instant updatedAt;

    @CreatedBy
    @Column(updatable = false, length = 36)
    private String createdBy;
}
