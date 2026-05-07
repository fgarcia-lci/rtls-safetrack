# 03. Modelo de datos interno y formato del simulador

## Cambio importante respecto a versiones anteriores

Versiones anteriores de este documento describían un **"contrato MQTT v1 propio"** que el hardware del cliente debía cumplir, con un gateway intermedio para traducir.

**Ya no es así.** La arquitectura actual establece que:

- **El broker MQTT es la frontera**: el hardware publica en SU formato y SUS topics. Nosotros nos adaptamos.
- **Nada nuestro vive antes del broker.**
- La estabilidad la damos en nuestro código mediante un **modelo de datos interno** (`PositionEvent`, `TagStatus`, `HapticCommand`) y un **adapter por proveedor** dentro del `positioning-api` que traduce el payload de cada fabricante a ese modelo interno.

Este documento describe, por tanto, dos cosas distintas:

1. **El modelo interno** — los DTOs que circulan por nuestro código. Estables. Cualquier cambio incompatible requiere migración.
2. **El formato del simulador** — el que usa el `SimulatorAdapter` durante la PoC. No vinculante para el HW real; cuando llegue, escribiremos un nuevo adapter para su formato.

## 1. Modelo interno (DTOs en código)

Estructuras Java en `com.lci.rtls.positioning.mqtt.model`. Son lo que toda la lógica posterior (zonas, alertas, persistencia, WebSocket) ve y manipula.

### `PositionEvent`

Resultado de adapter.parse() de un mensaje de posición.

| Campo | Tipo | Obligatorio | Descripción |
|-------|------|-------------|-------------|
| `tagId` | string | sí | Identificador único del tag. |
| `plantId` | string | sí | Planta donde ocurre la lectura. |
| `ts` | Instant | sí | Timestamp de la lectura, precisión ms. |
| `position` | `Position3D {x, y, z}` | sí | Coordenadas en metros, sistema del modelo IFC/XKT (transformación aplicada por el adapter si hace falta). |
| `accuracyM` | double | recomendado | Radio de incertidumbre estimado en metros. |
| `quality` | enum | sí | `GOOD`, `DEGRADED`, `BAD`. |
| `source` | enum | sí | `UWB`, `BLE`, `WIFI`, `GPS`, `SIMULATED`. |
| `seq` | long | opcional | Contador monótono por tag. |
| `vendorMeta` | Map<String,Object> | opcional | Datos crudos del proveedor (anchors usados, RSSI...) por si hace falta debug. |

### `TagStatus`

| Campo | Tipo | Obligatorio |
|-------|------|-------------|
| `tagId` | string | sí |
| `plantId` | string | sí |
| `ts` | Instant | sí |
| `batteryPct` | int (0-100) | sí |
| `rssiDbm` | int | opcional |
| `firmware` | string | opcional |
| `state` | enum (`ACTIVE`, `IDLE`, `LOW_BATTERY`, `LOST`) | sí |

### `HapticCommand` (servidor → tag)

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `cmdId` | UUID | Idempotencia. |
| `tagId` | string | A quién va dirigido. |
| `type` | enum | `HAPTIC`, `SOUND`, `LED`, `PING`, `ASSIGN`. |
| `pattern` | string | `INFO`, `WARNING`, `DANGER`, `CHIRP`, `ALARM`, `GREEN`, `YELLOW`, `RED_BLINK`. |
| `durationMs` | int | Duración del efecto. |
| `reason` | string | Causa lógica (ej. `zone_proximity`). |
| `zoneId` | string | Si la causa es una zona. |
| `issuedAt` | Instant | Cuándo se generó. |
| `issuedBy` | string | Quién lo generó (`safety_engine`, usuario...). |

El adapter del proveedor se encarga de **serializar** este DTO al payload/topic concreto que su hardware espera.

### Reglas de negocio aplicadas tras el parse

Independientemente del proveedor, una vez tenemos un `PositionEvent`:

- Si `quality == BAD` → no actualiza `tag_positions_current`; opcionalmente se guarda en histórico marcado para análisis.
- Si `accuracyM > 5` → log warning, avatar pintado en gris con halo difuso.
- Si `ts` desfasado más de 30 s respecto al servidor → descarta (asume reloj mal sincronizado).
- Si `seq` retrocede más de 100 posiciones → asume reset del tag, reinicia contador.

### Validaciones en ingestión

El `PositionIngestionService` valida en orden:

1. **Bean Validation** (JSR-380) sobre el DTO: campos obligatorios, rangos, enums.
2. **Semántica**:
   - `plantId` existe en `plants` → si no, log warning + descarta.
   - `tagId` existe en `pos_tags` → si no, auto-crear con `state=UNKNOWN` y log info (útil en debug).
   - `ts` dentro de [-30 s, +5 s] → si no, descarta.
3. **Coordenadas** dentro del bbox conocido de la planta (si está definido) → si no, alerta "posición fuera de planta".

## 2. Formato del simulador (PoC)

Lo que el simulador publica al broker y lo que el `SimulatorAdapter` sabe consumir. **No vinculante** para el HW real.

### Topics del simulador

| Topic | Dirección | QoS | Retained | Frecuencia |
|-------|-----------|-----|----------|------------|
| `sim/v1/plant/{plantId}/tag/{tagId}/position` | sim → broker | 0 | No | ~1 Hz por tag |
| `sim/v1/plant/{plantId}/tag/{tagId}/status` | sim → broker | 1 | Sí | 30 s o on-change |
| `sim/v1/plant/{plantId}/tag/{tagId}/command` | broker → sim | 1 | No | on-demand |
| `sim/v1/plant/{plantId}/system/heartbeat` | sim → broker | 1 | Sí | 10 s |

> Prefijo `sim/` deja claro que es el namespace del simulador. El HW real podrá usar el namespace que quiera; cada adapter se suscribe al suyo.

### Payload `position` (simulador)

```json
{
  "tag_id": "E8:9F:6D:12:34:56",
  "plant_id": "SAFI_1",
  "ts": "2026-04-21T22:15:30.123Z",
  "pos": { "x": 12.34, "y": 56.78, "z": 1.20 },
  "accuracy_m": 0.15,
  "anchors_used": 4,
  "quality": "GOOD",
  "source": "simulated",
  "seq": 18472
}
```

### Payload `status` (simulador)

```json
{
  "tag_id": "E8:9F:6D:12:34:56",
  "plant_id": "SAFI_1",
  "ts": "2026-04-21T22:15:30.123Z",
  "battery_pct": 78,
  "rssi_dbm": -65,
  "firmware": "sim-1.0.0",
  "state": "ACTIVE"
}
```

### Payload `command` (broker → simulador)

```json
{
  "cmd_id": "uuid-v4",
  "type": "HAPTIC",
  "pattern": "WARNING",
  "duration_ms": 2000,
  "reason": "zone_proximity",
  "zone_id": "zone_ccm_3",
  "issued_at": "2026-04-21T22:15:30.123Z",
  "issued_by": "safety_engine"
}
```

El simulador "actúa" sobre el comando (log + estado en memoria) y nada más.

### Payload `heartbeat`

```json
{
  "gateway_id": "sim-01",
  "plant_id": "SAFI_1",
  "ts": "2026-04-21T22:15:30.123Z",
  "tags_active": 23,
  "throughput_msg_per_sec": 25.3,
  "uptime_sec": 345600
}
```

### QoS por tipo de mensaje

- `position`: QoS 0 (fire-and-forget, perder frames es OK a 1 Hz).
- `status`: QoS 1 + retained (el estado debe recuperarse al reconectar).
- `command`: QoS 1 + no retained + `cmd_id` UUID para idempotencia.
- `heartbeat`: QoS 1 + retained.

> Cada proveedor real elegirá sus propios QoS. Estas son las decisiones del simulador.

## 3. Cuando llegue el HW real

1. Documentar el formato del proveedor en `docs/vendor_<vendor>_format.md`.
2. Implementar `<Vendor>Adapter` en `com.lci.rtls.positioning.mqtt.adapter`.
3. Registrar el adapter en config (qué topic-prefix le toca).
4. **Cero cambios** en zonas, alertas, persistencia o frontend — todo trabaja sobre el modelo interno.

Si el HW real necesita transformación de coordenadas (UWB → IFC), se aplica dentro del adapter usando `pos_plant_settings.positioning_transform_matrix`.

## 4. Testing

- Smoke tests con `mosquitto_pub`/`mosquitto_sub` → publicar payloads de ejemplo y verificar que el flujo completo responde.
- Unit tests del `SimulatorAdapter` y futuros adapters con muestras reales del proveedor.
- Tests de integración del `MqttSubscriberService` con Testcontainers (Mosquitto embebido).
- Modo `--lint` del simulador: valida sus propios payloads contra JSON Schema (a definir en Fase 1).
