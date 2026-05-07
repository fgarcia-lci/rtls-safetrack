package com.lci.rtls.positioning.tag;

/**
 * Estado operativo del tag físico. Mapea al ENUM de {@code pos_tags.state}.
 */
public enum TagState {
    ACTIVE,
    IDLE,
    LOW_BATTERY,
    LOST,
    UNKNOWN,
    DECOMMISSIONED
}
