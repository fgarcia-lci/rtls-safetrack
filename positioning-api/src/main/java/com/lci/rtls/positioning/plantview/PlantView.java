package com.lci.rtls.positioning.plantview;

import jakarta.persistence.Basic;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Lob;
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

    /**
     * Inline SVG content for {@link Type#FLOORPLAN_2D} views. Stored as text
     * so we don't need a shared volume — the asset is served via
     * {@code GET /v1/plant-views/{id}/asset}. Null for MODEL_3D rows.
     *
     * <p>Lazy-loaded: list endpoints don't pay the payload cost; only the
     * dedicated asset endpoint touches it.
     */
    @Lob
    @Basic(fetch = FetchType.LAZY)
    @Column(name = "svg_content", columnDefinition = "LONGTEXT")
    private String svgContent;

    /** World bbox in meters where the SVG sits (same coordinate frame as the XKT). */
    @Column(name = "world_bbox_min_x")
    private Double worldBboxMinX;
    @Column(name = "world_bbox_min_y")
    private Double worldBboxMinY;
    @Column(name = "world_bbox_max_x")
    private Double worldBboxMaxX;
    @Column(name = "world_bbox_max_y")
    private Double worldBboxMaxY;

    /**
     * CAD exports are Y-up; the browser SVG Y axis grows downward. When
     * true, the viewer applies a vertical flip so the floorplan matches the
     * world frame (the default for LibreCAD/Inkscape exports from Revit).
     */
    @Column(name = "svg_flip_y", nullable = false)
    private boolean svgFlipY;

    @Column(columnDefinition = "JSON")
    private String bbox;

    @Column(columnDefinition = "JSON")
    private String defaultCamera;

    /** Default vertical offset (m) applied to the model. ADMIN-editable
     *  calibration so the floor matches Z=0. NULL = no offset. */
    @Column(name = "default_y_offset")
    private Double defaultYOffset;

    /** Default avatar height (m) used by the 3D viewer. ADMIN-editable. */
    @Column(name = "default_avatar_height_m")
    private Double defaultAvatarHeightM;

    @Column(name = "display_order")
    private Integer displayOrder;

    @Column(length = 500)
    private String thumbnailUrl;

    @Column(nullable = false)
    private boolean isActive;
}
