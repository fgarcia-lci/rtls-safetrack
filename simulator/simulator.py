"""
RTLS Safetrack — Simulator MQTT

Emula tags UWB moviéndose por una planta industrial. Publica posiciones, status
y heartbeats al broker MQTT en el namespace `sim/v1/...`.

Ver docs/03_MQTT_FORMAT.md (raíz del proyecto) para el detalle del formato.
"""

from __future__ import annotations

import argparse
import json
import logging
import math
import os
import random
import re
import signal
import sys
import time
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional

import paho.mqtt.client as mqtt
import yaml

# -----------------------------------------------------------------------------
# Configuración: carga YAML + sustitución de ${VAR:-default} con env vars
# -----------------------------------------------------------------------------

ENV_VAR_RE = re.compile(r"\$\{([A-Z_][A-Z0-9_]*)(?::-([^}]*))?\}")


def _resolve_env_vars(value: Any) -> Any:
    """Sustituye recursivamente ${VAR} o ${VAR:-default} en cualquier string del YAML."""
    if isinstance(value, str):
        def _repl(m: re.Match[str]) -> str:
            var_name = m.group(1)
            default = m.group(2) or ""
            return os.environ.get(var_name, default)
        return ENV_VAR_RE.sub(_repl, value)
    if isinstance(value, dict):
        return {k: _resolve_env_vars(v) for k, v in value.items()}
    if isinstance(value, list):
        return [_resolve_env_vars(v) for v in value]
    return value


def load_config(path: Path) -> dict[str, Any]:
    with path.open("r", encoding="utf-8") as f:
        raw = yaml.safe_load(f)
    return _resolve_env_vars(raw)


# -----------------------------------------------------------------------------
# Modelo del tag — estado en memoria
# -----------------------------------------------------------------------------

@dataclass
class Tag:
    id: str
    name: str
    waypoints: list[tuple[float, float]]
    speed: float                          # m/s
    pause_at_waypoint_seconds: float
    z: float
    battery_pct: float
    seq: int = 0
    current_idx: int = 0                  # índice del waypoint hacia el que se mueve
    pause_remaining: float = 0.0          # segundos restantes de pausa en waypoint
    x: float = field(init=False)
    y: float = field(init=False)
    last_position_publish: float = 0.0
    last_status_publish: float = 0.0
    state: str = "ACTIVE"

    def __post_init__(self) -> None:
        self.x, self.y = self.waypoints[0]
        # Empezar moviéndose hacia el waypoint siguiente (si solo hay uno, queda quieto)
        self.current_idx = 1 % len(self.waypoints)

    def step(self, dt: float) -> None:
        """Avanza dt segundos hacia el waypoint actual. Si llega, pausa y pasa al siguiente."""
        if self.pause_remaining > 0:
            self.pause_remaining -= dt
            return

        if len(self.waypoints) < 2:
            return  # tag estático

        target_x, target_y = self.waypoints[self.current_idx]
        dx, dy = target_x - self.x, target_y - self.y
        dist = math.hypot(dx, dy)

        if dist < 0.05:
            # Llegado al waypoint: pausar y avanzar al siguiente
            self.x, self.y = target_x, target_y
            self.pause_remaining = self.pause_at_waypoint_seconds
            self.current_idx = (self.current_idx + 1) % len(self.waypoints)
            return

        step_dist = min(self.speed * dt, dist)
        self.x += step_dist * dx / dist
        self.y += step_dist * dy / dist


# -----------------------------------------------------------------------------
# Simulator — orquesta tags + cliente MQTT
# -----------------------------------------------------------------------------

class Simulator:

    def __init__(self, config: dict[str, Any], tags_filter: Optional[set[str]] = None) -> None:
        self.plant_id: str = os.environ.get("SIMULATOR_PLANT_ID") or config["plant_id"]
        self.tick_seconds = float(config["simulation"]["tick_ms"]) / 1000.0
        self.jitter_m = float(config["simulation"]["jitter_m"])
        self.default_z = float(config["simulation"]["default_z"])
        self.battery_drop_per_hour = float(config["simulation"]["battery_drop_per_hour_pct"])

        self.position_period = 1.0 / float(config["publish"]["position_hz"])
        self.status_period = float(config["publish"]["status_seconds"])
        self.heartbeat_period = float(config["publish"]["heartbeat_seconds"])

        self.tags: list[Tag] = []
        for entry in config["tags"]:
            if tags_filter is not None and entry["id"] not in tags_filter:
                continue
            self.tags.append(Tag(
                id=entry["id"],
                name=entry["name"],
                waypoints=[tuple(p) for p in entry["waypoints"]],
                speed=float(entry["speed"]),
                pause_at_waypoint_seconds=float(entry.get("pause_at_waypoint_seconds", 0)),
                z=float(entry.get("z", self.default_z)),
                battery_pct=float(entry.get("battery_start", 100)),
            ))

        if not self.tags:
            raise RuntimeError("No hay tags activos en la configuración")

        self.broker_cfg = config["broker"]
        client_id = f"{self.broker_cfg.get('client_id_prefix', 'rtls-simulator')}-{uuid.uuid4().hex[:8]}"
        self.client = mqtt.Client(
            mqtt.CallbackAPIVersion.VERSION2,
            client_id=client_id,
            protocol=mqtt.MQTTv5,
        )
        if self.broker_cfg.get("username"):
            self.client.username_pw_set(
                self.broker_cfg["username"],
                self.broker_cfg.get("password") or None,
            )
        self.client.on_connect = self._on_connect
        self.client.on_disconnect = self._on_disconnect

        self.start_ts = time.monotonic()
        self.last_heartbeat_publish = 0.0
        self.gateway_id = f"sim-{client_id[-8:]}"
        self.running = False

    # ---- MQTT callbacks ----

    def _on_connect(self, client, userdata, flags, reason_code, properties):
        if reason_code == 0:
            log.info(
                "Connected to MQTT %s:%s as %s with %d tags",
                self.broker_cfg["host"], self.broker_cfg["port"],
                self.client._client_id.decode() if isinstance(self.client._client_id, bytes) else self.client._client_id,
                len(self.tags),
            )
        else:
            log.error("Connection failed: reason_code=%s", reason_code)

    def _on_disconnect(self, client, userdata, disconnect_flags, reason_code, properties):
        log.warning("Disconnected from MQTT (reason=%s) — paho intentará reconectar", reason_code)

    # ---- Connection ----

    def connect(self) -> None:
        host = self.broker_cfg["host"]
        port = int(self.broker_cfg["port"])
        log.info("Connecting to MQTT %s:%s ...", host, port)
        self.client.connect(host, port, keepalive=60)
        self.client.loop_start()

    def disconnect(self) -> None:
        try:
            self.client.loop_stop()
            self.client.disconnect()
        except Exception as e:
            log.warning("Error on disconnect: %s", e)

    # ---- Publishing ----

    def _topic(self, suffix: str) -> str:
        return f"sim/v1/plant/{self.plant_id}/{suffix}"

    def _now_iso(self) -> str:
        return datetime.now(tz=timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")

    def _publish_position(self, tag: Tag) -> None:
        tag.seq += 1
        # Jitter gaussiano: ±jitter_m a ~3 sigma
        jx = random.gauss(0, self.jitter_m / 3.0)
        jy = random.gauss(0, self.jitter_m / 3.0)
        payload = {
            "tag_id": tag.id,
            "plant_id": self.plant_id,
            "ts": self._now_iso(),
            "pos": {
                "x": round(tag.x + jx, 3),
                "y": round(tag.y + jy, 3),
                "z": round(tag.z, 3),
            },
            "accuracy_m": round(self.jitter_m, 3),
            "anchors_used": 4,
            "quality": "GOOD" if tag.battery_pct > 15 else "DEGRADED",
            "source": "simulated",
            "seq": tag.seq,
        }
        topic = self._topic(f"tag/{tag.id}/position")
        self.client.publish(topic, json.dumps(payload), qos=0, retain=False)
        log.info(
            "publish position tag=%s plant=%s pos=(%.2f,%.2f,%.2f) seq=%d",
            tag.id, self.plant_id, payload["pos"]["x"], payload["pos"]["y"], payload["pos"]["z"], tag.seq,
        )

    def _publish_status(self, tag: Tag) -> None:
        if tag.battery_pct < 15:
            tag.state = "LOW_BATTERY"
        payload = {
            "tag_id": tag.id,
            "plant_id": self.plant_id,
            "ts": self._now_iso(),
            "battery_pct": int(round(tag.battery_pct)),
            "rssi_dbm": -55 - random.randint(0, 25),
            "firmware": "sim-1.0.0",
            "state": tag.state,
        }
        topic = self._topic(f"tag/{tag.id}/status")
        self.client.publish(topic, json.dumps(payload), qos=1, retain=True)
        log.info("publish status tag=%s battery=%d state=%s", tag.id, payload["battery_pct"], tag.state)

    def _publish_heartbeat(self, throughput_msg_per_sec: float) -> None:
        payload = {
            "gateway_id": self.gateway_id,
            "plant_id": self.plant_id,
            "ts": self._now_iso(),
            "tags_active": len(self.tags),
            "throughput_msg_per_sec": round(throughput_msg_per_sec, 2),
            "uptime_sec": int(time.monotonic() - self.start_ts),
        }
        topic = self._topic("system/heartbeat")
        self.client.publish(topic, json.dumps(payload), qos=1, retain=True)
        log.debug("publish heartbeat throughput=%.2f msg/s", throughput_msg_per_sec)

    # ---- Main loop ----

    def run(self) -> None:
        self.running = True
        last_tick = time.monotonic()
        msgs_since_last_hb = 0

        while self.running:
            now = time.monotonic()
            dt = now - last_tick
            last_tick = now

            # Avance físico de cada tag
            for tag in self.tags:
                tag.step(dt)
                # Batería bajando por tiempo simulado
                tag.battery_pct = max(0.0, tag.battery_pct - self.battery_drop_per_hour * dt / 3600.0)

                # Publicación de position si toca
                if now - tag.last_position_publish >= self.position_period:
                    self._publish_position(tag)
                    tag.last_position_publish = now
                    msgs_since_last_hb += 1

                # Publicación de status si toca (o cambio de estado)
                if now - tag.last_status_publish >= self.status_period:
                    self._publish_status(tag)
                    tag.last_status_publish = now
                    msgs_since_last_hb += 1

            # Heartbeat
            if now - self.last_heartbeat_publish >= self.heartbeat_period:
                throughput = msgs_since_last_hb / max(self.heartbeat_period, 0.001)
                self._publish_heartbeat(throughput)
                self.last_heartbeat_publish = now
                msgs_since_last_hb = 0

            # Esperar hasta el próximo tick
            elapsed = time.monotonic() - now
            sleep_for = max(0.0, self.tick_seconds - elapsed)
            time.sleep(sleep_for)

    def stop(self) -> None:
        self.running = False


# -----------------------------------------------------------------------------
# Logging
# -----------------------------------------------------------------------------

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)-5s %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
log = logging.getLogger("simulator")


# -----------------------------------------------------------------------------
# CLI
# -----------------------------------------------------------------------------

def main() -> int:
    parser = argparse.ArgumentParser(description="RTLS Safetrack simulator")
    parser.add_argument("--config", default="tags.yaml", help="Ruta al YAML de configuración")
    parser.add_argument("--mode", choices=["normal", "demo"], default="normal",
                        help="normal = trayectorias en bucle. demo = guion para Fase 5 (TODO)")
    parser.add_argument("--tags-only", default=None,
                        help="Sólo simular los tag_ids indicados (separados por coma)")
    args = parser.parse_args()

    config_path = Path(args.config)
    if not config_path.is_absolute():
        config_path = Path(__file__).parent / config_path
    if not config_path.exists():
        log.error("Config no encontrada: %s", config_path)
        return 1

    config = load_config(config_path)

    tags_filter = None
    if args.tags_only:
        tags_filter = set(s.strip() for s in args.tags_only.split(",") if s.strip())
        log.info("Filtro de tags activado: %s", tags_filter)

    if args.mode == "demo":
        log.warning("--mode demo aún no implementado (vendrá en Fase 5). Ejecutando modo normal.")

    sim = Simulator(config, tags_filter=tags_filter)
    sim.connect()

    def _handle_signal(signum, frame):
        log.info("Signal %d recibida, parando simulador...", signum)
        sim.stop()

    signal.signal(signal.SIGINT, _handle_signal)
    signal.signal(signal.SIGTERM, _handle_signal)

    try:
        sim.run()
    finally:
        sim.disconnect()
        log.info("Simulador parado")

    return 0


if __name__ == "__main__":
    sys.exit(main())
