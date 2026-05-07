# RTLS Safetrack — Simulator

Simulador MQTT que emula 10 tags UWB moviéndose por una planta industrial.
Publica posiciones, status y heartbeats en el namespace `sim/v1/...` para que
el `positioning-api` los consuma vía su `SimulatorAdapter`.

## Por qué existe

El hardware real (tags + anchors UWB) no llega hasta +1 mes. El simulador permite
desarrollar y demoar todo el pipeline (ingesta → motor de zonas → alertas →
visor) sin él. Cuando llegue el HW, se sustituye este simulador por el HW real;
el resto del sistema no se entera (la frontera es el broker MQTT).

## Topics que publica

Todos bajo el prefijo `sim/v1/plant/{plantId}/`:

| Topic | QoS | Retained | Frecuencia |
|---|---|---|---|
| `sim/v1/plant/{plantId}/tag/{tagId}/position` | 0 | No | 1 Hz por tag |
| `sim/v1/plant/{plantId}/tag/{tagId}/status` | 1 | Sí | 30 s o on-change |
| `sim/v1/plant/{plantId}/system/heartbeat` | 1 | Sí | 10 s |

Ver `docs/03_MQTT_FORMAT.md` (raíz del proyecto) para el detalle de payloads.

## Arranque rápido

### Local (Python en host)

```bash
cd simulator
python -m venv .venv
.venv\Scripts\activate     # Windows
# source .venv/bin/activate # Linux/Mac
pip install -r requirements.txt
python simulator.py
```

Por defecto se conecta a `localhost:1883` (Mosquitto local).

### Verificar que publica

En otra ventana, escucha el broker:

```bash
docker exec rts-mosquitto mosquitto_sub -h localhost -t "sim/v1/#" -v
```

Deberías ver mensajes JSON cada segundo con las posiciones de los 10 tags.

## Modos

```bash
python simulator.py                  # modo normal: 10 tags moviéndose en bucle
python simulator.py --mode demo      # modo guionizado para demo de venta (Fase 5)
python simulator.py --config tags.yaml --tags-only AA:BB:CC:DD:00:01,AA:BB:CC:DD:00:07
```

## Configuración

Editar `tags.yaml`:
- `broker`: host, puerto, credenciales (los placeholders `${VAR}` se sustituyen por env vars).
- `publish`: frecuencias de publicación.
- `tags`: lista con id, nombre, waypoints, velocidad, pausas.

## Variables de entorno (sobrescriben tags.yaml)

| Variable | Default | Descripción |
|---|---|---|
| `MQTT_HOST` | `localhost` | Host del broker |
| `MQTT_PORT` | `1883` | Puerto del broker |
| `MQTT_USERNAME` | (vacío) | Usuario MQTT |
| `MQTT_PASSWORD` | (vacío) | Password MQTT |
| `SIMULATOR_PLANT_ID` | `TSP3` (de yaml) | Sobreescribe el plant_id |

## Logs

`simulator.py` imprime por stdout una línea por mensaje publicado:

```
2026-04-28 13:50:01 INFO publish position tag=AA:BB:CC:DD:00:01 plant=TSP3 pos=(12.3, 5.0, 1.2) seq=42
```

Útil para verificar que está vivo. En modo Docker, los logs van a `docker logs`.
