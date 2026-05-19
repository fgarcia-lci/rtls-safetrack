package com.lci.rtls.positioning.tag;

import com.lci.rtls.positioning.worker.Worker;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EntityListeners;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;
import org.springframework.data.annotation.CreatedDate;
import org.springframework.data.annotation.LastModifiedDate;
import org.springframework.data.jpa.domain.support.AuditingEntityListener;

import java.time.Instant;

/**
 * Dispositivo físico de localización (tag UWB). Mapea {@code pos_tags}.
 *
 * <p>Un tag puede estar sin asignar (pool) o asignado a un {@link Worker}.
 * Si se reasigna, {@code assignedAt} se actualiza con el nuevo timestamp.
 */
@Entity
@Table(name = "pos_tags")
@EntityListeners(AuditingEntityListener.class)
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class Tag {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /** Identificador único del dispositivo (MAC, UUID, código del fabricante). */
    @Column(nullable = false, unique = true, length = 100)
    private String serial;

    @Column(length = 100)
    private String model;

    @Column(length = 100)
    private String vendor;

    @Column(length = 50)
    private String firmwareVersion;

    /** Último porcentaje de batería conocido (0-100). Lo actualiza el flujo MQTT. */
    private Integer batteryLastPct;

    /** Última vez que el tag publicó algo (position o status). Lo actualiza el flujo MQTT. */
    private Instant lastSeenAt;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private TagState state;

    /**
     * Persona a la que está asignado el tag. La columna se renombró a
     * {@code assigned_person_id} en V13 (la tabla {@code pos_workers} pasó a
     * {@code pos_persons}). El nombre de campo Java {@code assignedWorker} se
     * mantiene para no romper los ~140 sitios que lo referencian.
     */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "assigned_person_id")
    private Worker assignedWorker;

    private Instant assignedAt;

    /** Planta donde está desplegado el tag. Soft FK a {@code plants.id} del DT. */
    @Column(nullable = false, length = 50)
    private String plantId;

    @Column(columnDefinition = "TEXT")
    private String notes;

    @CreatedDate
    @Column(updatable = false)
    private Instant createdAt;

    @LastModifiedDate
    private Instant updatedAt;
}
