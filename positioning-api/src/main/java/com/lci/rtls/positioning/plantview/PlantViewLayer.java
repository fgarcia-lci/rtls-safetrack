package com.lci.rtls.positioning.plantview;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
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

import java.time.Instant;

/**
 * Capa (XKT por disciplina) de una {@link PlantView}.
 *
 * <p>Permite tener un modelo 3D enorme dividido en disciplinas (estructura,
 * instalaciones, máquinas, arquitectura...) y mostrarlas/ocultarlas en el
 * visor xeokit independientemente. Todas las layers de una misma vista
 * comparten el mismo sistema de coordenadas.
 */
@Entity
@Table(name = "pos_plant_view_layers")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class PlantViewLayer {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "plant_view_id", nullable = false)
    private PlantView plantView;

    @Column(nullable = false, length = 50)
    private String code;

    @Column(nullable = false, length = 200)
    private String name;

    @Column(nullable = false, length = 500)
    private String assetUrl;

    @Column(nullable = false)
    private boolean defaultVisible;

    @Column(name = "display_order")
    private Integer displayOrder;

    /** Color sugerido para chips/UI (#RRGGBB). Nullable. */
    @Column(length = 9)
    private String displayColor;

    @Column(nullable = false)
    private boolean isActive;

    private Instant createdAt;
    private Instant updatedAt;
}
