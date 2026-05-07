package com.lci.rtls.positioning.mqtt.adapter;

import com.lci.rtls.positioning.mqtt.model.PositionEvent;
import com.lci.rtls.positioning.mqtt.model.TagStatus;

import java.util.Optional;

/**
 * Traduce el payload crudo de un proveedor concreto al modelo interno de RTLS Safetrack.
 *
 * <p>Cada proveedor de hardware tiene su propio adapter (en PoC solo
 * {@code SimulatorAdapter}). Cuando llegue HW real, se añade un {@code <Vendor>Adapter}
 * que implementa esta interfaz y queda registrado como {@code @Component}.
 *
 * <p>El {@code MqttSubscriberService} recorre los adapters y delega en el primero
 * cuyo {@link #supports(String)} devuelve true.
 */
public interface PositionEventAdapter {

    /**
     * @return true si este adapter sabe parsear mensajes de ese topic.
     */
    boolean supports(String topic);

    /**
     * Parsea un payload de posición. Devuelve empty si el topic no es de posición
     * o si el payload no se puede parsear (en cuyo caso debe loguear el motivo).
     */
    Optional<PositionEvent> parsePosition(String topic, byte[] payload);

    /**
     * Parsea un payload de status (batería, RSSI...). Devuelve empty si no aplica.
     */
    Optional<TagStatus> parseStatus(String topic, byte[] payload);
}
