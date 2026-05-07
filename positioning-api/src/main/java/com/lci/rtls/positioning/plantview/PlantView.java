package com.lci.rtls.positioning.plantview;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
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

/**
 * Vista (XKT 3D o floorplan 2D) registrada para una planta. Mapea {@code pos_plant_views}.
 * El frontend usa esto para descubrir qué modelos puede cargar el usuario.
 */
@Entity
@Table(name = "pos_plant_views")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class PlantView {

    public enum Type {
        FLOORPLAN_2D,
        MODEL_3D
    }

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, length = 50)
    private String plantId;

    @Column(nullable = false, length = 50)
    private String code;

    @Column(nullable = false, length = 200)
    private String name;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private Type type;

    /** URL del asset (servido desde el frontend en /models/... o /floorplans/...). */
    @Column(nullable = false, length = 500)
    private String assetUrl;

    @Column(columnDefinition = "JSON")
    private String bbox;

    @Column(columnDefinition = "JSON")
    private String defaultCamera;

    @Column(name = "display_order")
    private Integer displayOrder;

    @Column(length = 500)
    private String thumbnailUrl;

    @Column(nullable = false)
    private boolean isActive;
}
