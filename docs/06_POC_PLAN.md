# 06. Plan de PoC

Objetivo: demo interna funcionando en 4-5 semanas. Hardware real NO es prerrequisito — usamos simulador.

## Contexto: PoC para venta, no PoC técnica

Tras reunión 2026-04-21, queda confirmado que:
- **No hay proyecto aprobado**. La PoC se enseña al cliente para conseguir presupuesto.
- El criterio de éxito es **"impresionar lo bastante para cerrar"**, no "cubrir todos los edge cases".

### Pivote de prioridades

| ⬆ Sube | ⬇ Baja |
|---|---|
| Visor 3D con avatares interpolados, suaves, identificables | Tests unitarios exhaustivos |
| Alertas visuales llamativas (pulso rojo en avatar, flash en zona) | Validaciones de edge cases improbables |
| Dashboard con KPIs grandes, tarjetas vistosas | Optimizaciones prematuras |
| **Modo demo guionizado** del simulador (un trabajador entra en zona crítica, todo el pipeline se dispara en cadena) | Arquitectura defensiva (retries exhaustivos, etc.) |
| Look & feel idéntico al DT (AppBar, colores, tipografía, espaciados) | Múltiples adapters (solo `SimulatorAdapter` en PoC) |
| Carga configurable de XKT (como en DT) desde Fase 0 | Política GDPR detallada más allá de TTL básico |
| Vídeo de demo de 2-3 min con narración | README técnico exhaustivo |

### Qué es el "modo demo guionizado"

Un flag del simulador (`--mode demo`) que, en vez de generar trayectorias aleatorias, ejecuta un guion predefinido para la presentación:

```
T+0s:  10 trabajadores deambulando en sus zonas habituales (todo verde).
T+15s: Worker 7 ("Juan") empieza a acercarse al CCM-3 (zona DANGER).
T+18s: Worker 7 entra en buffer de aproximación → avatar amarillo + halo.
T+22s: Worker 7 entra en zona DANGER → avatar rojo pulsante,
       zona se ilumina en rojo, alerta toast en panel,
       "vibración" mostrada en UI (icono junto al avatar),
       email simulado al supervisor (mock).
T+27s: Worker 7 sale → evento se cierra, badge "1 incidente hoy".
```

Esto convierte la demo de "mira, los puntitos se mueven" a "mira, todo el sistema reacciona en cadena cuando ocurre algo".

---

## Fase 0 — Scaffolding (2-3 días)

**Objetivo**: el proyecto arranca, autenticación funciona, frontend muestra AppBar con look&feel del DT.

### Entregables

- [ ] Estructura de carpetas del proyecto (backend + frontend + simulador + infra).
- [ ] `positioning-api` Spring Boot arrancando, endpoint `/api/v1/health` responde 200.
- [ ] `positioning-frontend` React arrancando, login OAuth2 funciona contra auth-server del DT.
- [ ] Cliente OAuth2 `rtls-safetrack-web` registrado en la tabla del DT.
- [ ] `docker-compose.yml` con: broker MQTT, positioning-api, positioning-frontend.
- [ ] Conexión a MySQL (`dt_safetrack`) y MongoDB (`dt_safetrack_metrics`) verificada.
- [ ] Flyway migration V1 con esquema base de tablas.
- [ ] README arranque: `./start.ps1` y ves login.
- [ ] MainLayout con AppBar, PlantSelector vacío, UserMenu, LanguageSelector.

### Stack clonado en esta fase

- Copiar literal del frontend DT: `AuthContext`, `oauth2.ts`, `websocket.ts`, `theme`, `i18n`, componentes Layout/UserMenu/LanguageSelector/ProtectedRoute/PlantSelector.
- Copiar del backend DT: `SecurityConfig`, `WebSocketConfig`, `JwtHandshakeInterceptor`.

## Fase 1 — Ingestión MQTT + simulador (3-4 días)

**Objetivo**: posiciones fluyen del simulador al api y se almacenan.

### Entregables

- [ ] Simulador Python (`simulator/`): publica 10 tags moviéndose en trayectorias predefinidas (pasillos, movimiento aleatorio acotado), 1 Hz, en el formato del simulador (`sim/v1/...`, ver `03_MQTT_FORMAT.md`).
- [ ] `positioning-api`:
  - [ ] `MqttSubscriberService` con Eclipse Paho conectado al broker.
  - [ ] DTO `PositionMessage` + Bean Validation.
  - [ ] `PositionIngestionService`: upsert `tag_positions_current` + insert `tag_positions_5min`.
  - [ ] TTL index en `tag_positions_5min` (48h).
  - [ ] REST `GET /api/v1/positions/current?plantId=X` que devuelve todas las posiciones actuales.
  - [ ] REST `GET /api/v1/positions/history/{tagId}?from=...&to=...`.
- [ ] Logging estructurado (una entrada por mensaje recibido con tag_id, latencia).
- [ ] Smoke test: `mosquitto_pub` publica una posición, REST devuelve esa posición.

## Fase 2 — CRUD básico (3-4 días)

**Objetivo**: admin puede dar de alta workers, tags, asignar uno a otro.

### Entregables

- [ ] Entidades JPA: `Worker`, `Tag`, `PlantView`.
- [ ] Repositorios Spring Data.
- [ ] Services con lógica (asignación de tag a worker, desasignación, validaciones).
- [ ] REST `/api/v1/workers` (GET list + filtros, POST create, PUT update, DELETE soft).
- [ ] REST `/api/v1/tags` (idem + endpoint `POST /tags/{id}/assign` con worker_id).
- [ ] Frontend:
  - [ ] Página `/workers` con tabla + diálogo de creación/edición.
  - [ ] Página `/tags` con tabla + asignación inline.
  - [ ] Importar workers desde CSV (opcional).

## Fase 3 — Visor 3D con avatares tiempo real (1 semana)

**Objetivo**: ver a los 10 tags del simulador moviéndose sobre el modelo XKT actual.

### Entregables

- [ ] Componente `PositioningViewer3D.tsx` basado en `XeoKitViewer.tsx` del DT.
- [ ] Carga del XKT existente (`/models/prueba_paco3.xkt`).
- [ ] WebSocket suscripción `/topic/positions/{plantId}`.
- [ ] Por cada tag activo, una annotation xeokit (sprite 2D con círculo colorizado + nombre).
- [ ] Interpolación lineal entre frames (para que los avatares se muevan suave a pesar de la tasa 1Hz).
- [ ] Click en avatar → panel lateral con datos del worker + últimas 5 min de posición.
- [ ] Colores por estado: verde (OK), amarillo (DEGRADED), rojo (en zona crítica, cuando esté la fase 4), gris (LOST).
- [ ] Vista 2D paralela: SVG/Canvas top-down (plano de planta simplificado + avatares como puntos).
- [ ] Toggle entre vistas 2D y 3D en la misma página.
- [ ] Permite cambiar entre PlantViews registradas en `pos_plant_views`.

## Fase 4 — Zonas + motor proximidad (1 semana)

**Objetivo**: zonas peligrosas definidas, detección por proximidad CON COLOR ESCALADO según distancia, alerta al panel.

### Entregables

- [ ] Entidades `SafetyZone`, `ZonePermission`, `ZoneSchedule`, `ProximityEvent`.
- [ ] REST `/api/v1/zones` CRUD.
- [ ] Editor de zonas 3D interactivo en frontend:
  - [ ] Tres tipos de primitiva: **CUBO** (box AABB), **CILINDRO** (radio + altura), **POLÍGONO** (click-a-click top-down). Backend almacena todo como `polygon_2d + zMin/zMax`; el `shape_type` se guarda como metadata para que el editor recree el manipulador correcto al editar.
  - [ ] **Gizmos 3D** (xeokit `TransformControl`): mover, rotar y escalar la zona en cualquiera de los 3 ejes directamente sobre el visor 3D del modelo cargado.
  - [ ] Form lateral: nombre, tipo (DANGER/RESTRICTED/WARNING/SAFE), severity, color, `approach_radius_m`, roles permitidos, política de notificación.
  - [ ] **Asociación a modelo**: cada zona pertenece al modelo (PlantView) sobre el que se creó. Soporta plantas con múltiples XKT por zonas (Fase 5) — cada XKT puede tener sus propias zonas distintas.
  - [ ] CRUD contra `/v1/zones`. Migración Flyway que añade `shape_type` enum a `pos_safety_zones`.
- [ ] **Sincronización 2D↔3D**: las zonas creadas/editadas se ven simultáneamente en el visor 3D y en el `PositioningViewer2D` (proyección top-down). Color escalado por proximidad funciona igual en ambos.
- [ ] **Modal de detalle de zona** (al clickar la zona en 2D o 3D):
  - [ ] Cabecera: nombre + código + chip de tipo + severity + color de identificación.
  - [ ] **Operarios actualmente dentro**: lista de cards con nombre, código de empleado, tag serial, tiempo dentro (en directo), botón "Seguir" (#50) y "Detalle worker".
  - [ ] **Datos de la zona**: descripción, dimensiones (área 2D, alturas zMin/zMax), `approach_radius_m`, máquina asociada (`related_device_id`), roles autorizados.
  - [ ] **Política de notificaciones** (resumen de `pos_zone_notification_policies`).
  - [ ] **Histórico reciente**: últimas N entradas/salidas a esta zona (de `pos_proximity_events`), con worker, tiempo dentro, ACK status.
  - [ ] Botón "Editar" → abre el editor 3D de zonas (#40) con la zona seleccionada.
  - [ ] **Placeholder para futuras integraciones**: hueco para feed de cámara (post-PoC) y estado máquina del DT (post-PoC) — ya con la maquetación reservada.
- [ ] `ZoneEngineService` en backend:
  - [ ] `@Scheduled(fixedDelay=500)` lee posiciones actuales, evalúa intersección/distancia al polígono.
  - [ ] Máquina de estados (tag, zone): `OUTSIDE → APPROACHING → INSIDE → LEFT`.
  - [ ] Cálculo de **`proximity_factor` ∈ [0..1]** (1 = dentro, 0 = fuera del radio de aproximación, lineal entre ambos).
  - [ ] Push del proximity_factor por WebSocket junto con la posición → frontend interpola color del avatar y la zona.
  - [ ] Al entrar (`INSIDE`): crea `ProximityEvent` (abierto), dispara `NotificationDispatcher`.
  - [ ] Al salir: cierra el evento (`exited_at = now`).
- [ ] `ProximityNotificationDispatcher` con canales:
  - [ ] `IN_APP`: publica a `/topic/alerts/{plantId}` vía WebSocket.
  - [ ] `EMAIL`: encola (patrón DT, quizá reutilizar el del DT si integramos).
  - [ ] `HAPTIC_MQTT`: el `MqttCommandPublisher` invoca `adapter.serialize(HapticCommand, tag)` y publica al broker en el topic/payload que el proveedor del tag espera (en PoC: `sim/v1/plant/.../tag/.../command`).
- [ ] **Color escalado en el visor 3D**:
  - [ ] La zona se pinta con interpolación verde→ámbar→rojo según el máximo `proximity_factor` de los operarios cerca.
  - [ ] El muñeco recibe un halo/anillo coloreado por su quality + proximity (rojo pulsante si dentro de zona DANGER).
- [ ] Panel de alertas en frontend: drawer lateral con alertas activas, botón ACK.

## Fase 5 — Multi-XKT por capas (3-4 días)

**Objetivo**: una planta puede llevar varios XKT (estructura, paredes, maquinaria, eléctricos…) y el usuario los enciende/apaga independientemente.

### Entregables

- [ ] Entidad `PlantViewLayer` ya existe con `code`, `name`, `assetUrl`, `defaultVisible` — verificar y extender si hace falta (orden, icono, `disciplina` enum).
- [ ] Cargar **N XKT por planta**, cada uno como una capa.
- [ ] `LayersPanel` (ya existe) ampliado a tree o lista con toggles, agrupado por disciplina.
- [ ] Botón mostrar/ocultar **personas** (afecta a todos los avatares + sus labels).
- [ ] Cuando Paco exporte desde Revit por zona/disciplina, los hooks ya están listos: solo añadir filas a `pos_plant_view_layers` con sus `assetUrl`.
- [ ] Persistir el estado de visibilidad por usuario (localStorage) para que cada uno tenga su preferencia.

## Fase 6 — Vistas 2D zonificadas (4-5 días)

**Objetivo**: navegación 2D con drill-down por zona, contadores por zona, y toggle 2D/3D que conserva el contexto.

### Entregables

- [ ] **Vista 2D global** de la planta:
  - [ ] Render top-down (proyección XZ del modelo o plano dibujado) con todas las zonas pintadas.
  - [ ] **Contador de personas por zona** (badge sobre cada zona).
  - [ ] Click en una zona → drill-down.
- [ ] **Vista 2D detalle de zona**:
  - [ ] Zoom al polígono de la zona seleccionada.
  - [ ] Bolitas de los operarios DENTRO con sus labels (mismo estilo que el 3D).
  - [ ] Breadcrumb / botón "volver a planta".
- [ ] **Toggle 2D ↔ 3D contextual**: al cambiar de vista, conservar zona seleccionada y centro de cámara.
- [ ] Animación de transición visual entre 2D global → detalle → 3D para que la demo quede fluida.

## Fase 7 — Pulido y demo (3-5 días)

**Objetivo**: estado demoable al cliente / internamente.

### Entregables

- [ ] **Dashboard de seguridad** (página inicial):
  - [ ] KPI cards: workers activos ahora, alertas últimas 24h, zonas activas, tags con batería baja.
  - [ ] Mapa 2D embebido de la planta.
  - [ ] Últimos 10 eventos de proximidad.
- [ ] **Búsqueda global de personas / tags / zonas**:
  - [ ] Barra de búsqueda en el `AppBar` con autocomplete (estilo command palette).
  - [ ] Busca por nombre del operario, código de empleado, serial del tag, código de zona.
  - [ ] Resultado clickable → la cámara/vista se centra en esa entidad y se abre su panel de detalle.
  - [ ] **Indistinto en 2D y 3D**: el usuario elige en qué vista quiere localizarla (botón "Ver en 3D" / "Ver en 2D" en el resultado, o respeta la vista activa). Si hay multi-XKT por capas (Fase 5), si la entidad cae en una capa oculta, la activa automáticamente.
- [ ] **Seguimiento en vivo** (real-time camera-follow, NO histórico):
  - [ ] Desde el panel de un operario o desde el resultado de búsqueda, botón "Seguir".
  - [ ] **Funciona tanto en visor 3D como en visor 2D** — el usuario elige qué vista quiere que persiga al operario, y al alternar 2D↔3D el seguimiento se mantiene.
  - [ ] **3D**: cámara anclada al muñequito a distancia/ángulo fijo (cada frame del tick recoloca `viewer.camera.eye` + `look` para que el operario quede centrado).
  - [ ] **2D**: el SVG/canvas top-down hace pan automático para mantener al operario centrado.
  - [ ] **Trazo de recorrido reciente**: polyline detrás del operario con sus últimos N segundos (configurable, default 30 s) — visible en ambas vistas.
  - [ ] Toggle off / botón cerrar para liberar la cámara.
- [ ] **Histórico de posiciones / heatmap** (post-mortem, NO en vivo):
  - [ ] Para un operario y rango de fecha, dibuja **heatmap de densidad** (zonas más transitadas) + **polyline del recorrido completo** + lista de entradas a zonas en el rango.
  - [ ] Disponible en 2D y 3D (mismo dataset, dos representaciones).
  - [ ] Reutiliza `tag_positions_history` (ya existe en MongoDB con TTL 48h, configurable).
  - [ ] Export del recorrido a CSV / GeoJSON.
- [ ] **Histórico de eventos** (`/events`): tabla con filtros (worker, zona, rango fecha), export CSV.
- [ ] **Configuración**: settings por planta (retención GDPR, transformación coords).
- [ ] **Textos i18n** completos en español e inglés.
- [ ] **README** con instrucciones de arranque y demo.
- [ ] **Grabación de demo** en vídeo (2-3 min).
- [ ] **Presentación al cliente** (slides con capturas).

## Fuera de PoC pero próximo (post-Fase 7)

Ideas que Paco quiere desarrollar tras la PoC inicial — alta prioridad cuando la PoC convierta en proyecto.

### Cámaras de seguridad integradas

Cuando un operario entra en `APPROACHING`/`INSIDE` de una zona crítica, abrir un panel emergente con el feed de la cámara correspondiente.

- **Recomendación de hardware**: cámaras IP **Hikvision**, **Axis** o **Dahua** con soporte **ONVIF Profile S** (streaming) y **Profile T** (PTZ). Estándar de facto en industria, drivers maduros, integración via WebRTC/HLS.
- **Domos PTZ con presets** para que una cámara cubra varias zonas críticas mediante posiciones predefinidas (cambio de preset al detectar entrada).
- **Cámaras fijas** para zonas individuales muy críticas que requieran observación constante.
- **Arquitectura propuesta**: `positioning-api` → integra con servidor RTSP → reenvía a frontend via WebRTC (o usa servicios tipo go2rtc / mediamtx como gateway).
- **Modelo de datos**: nueva tabla `pos_cameras` (id, plant_id, name, rtsp_url, ptz_capable, presets[]) y `pos_zone_cameras` (zone_id, camera_id, preset_index).

### IA privada local (LLM en Docker) — Asistente de la planta

Asistente conversacional integrado en la app que responda preguntas de negocio sobre los datos. **100 % privado**: el modelo corre en el propio docker stack — los datos de operarios y posicionamiento NUNCA salen de la infraestructura del cliente.

- **Casos de uso**:
  - "¿Cuántas veces entró Juan García en el molino esta semana?"
  - "¿Quién fue el último que estuvo en el CCM-3?"
  - "Dame un reporte de tiempo de exposición a zonas DANGER del mes."
  - "¿Cuántos operarios hay ahora mismo en zona de granulación?"
  - "Lista los workers que aún no tienen tag asignado."
  - "¿Hay alguna alerta abierta sin acknowledge?"

- **Stack propuesto**:
  - **Ollama** en Docker con modelo local (Llama 3.x 8B / Mistral / Phi-3 según RAM disponible). CPU-only acceptable para PoC; GPU opcional para producción.
  - **Servicio `ai-service`** (Python FastAPI o Java) que: (a) recibe la pregunta del usuario, (b) usa el LLM con **function calling / tool use** para invocar tools tipados (`query_workers`, `query_proximity_events`, `query_positions_history`, `count_workers_in_zone`, etc.), (c) los tools llaman al `positioning-api` REST internamente, (d) el LLM redacta la respuesta en lenguaje natural.
  - **Frontend**: widget tipo chat lateral en la app, accesible desde cualquier vista.

- **Por qué es vendible**: el cliente nunca ha tenido un sistema RTLS donde simplemente PREGUNTAR en español resuelva análisis que normalmente requieren un BI o un técnico. Diferenciador fuerte vs. competencia que solo da dashboards rígidos.

- **Riesgos / consideraciones**:
  - RAM: un Llama 3 8B Q4 necesita ~6-8 GB. El servidor del cliente debe poder asumirlo.
  - Latencia: respuestas en CPU pueden tardar 5-30 s. Aceptable para análisis, no para chat fluido.
  - Privacidad GDPR: cero llamadas a APIs externas. Reforzar este punto en la venta.
  - Hallucination: limitar a tools tipados (no SQL libre del LLM) para evitar respuestas inventadas.

### Integración con Digital Twin para estado de máquinas

El severity de una zona se eleva si la máquina dentro está en marcha. Si está parada y hay un operario presente, modo "mantenimiento" con severity reducido.

- Subscribirse al MQTT/REST del DT (la integración entre DT y RTLS está prevista — ver `08_INTEGRATION_WITH_DT.md`).
- `severity_efectivo = base * factor_máquina_ON` (ej: 1.5x si máquina ON).
- Detección "modo mantenimiento": máquina parada > N segundos + operario dentro → asumir mantenimiento → bajar severity (notificación informativa, no alarma).
- Modelo de datos: nueva tabla `pos_zone_machines` (zone_id, dt_machine_id) que mapea zonas a equipos del DT.

### Otros pendientes (orden no prioritario)

- Integración con hardware real (escribir un nuevo `<Vendor>Adapter` en `positioning-api/mqtt/adapter/`).
- Calibración matriz de transformación UWB → IFC.
- Agregación `tag_positions_hourly` y `daily` (schedulers).
- Módulo de kiosko de binding tag↔worker.
- App móvil (notificación push al manager cuando alguien de su equipo entra en zona crítica).
- Integración general con el Digital Twin (ver `08_INTEGRATION_WITH_DT.md`).
- GPS outdoor.
- Dashboards avanzados (trends, ergonomía, tiempo de exposición a ruido/calor).

## Cronograma estimado

| Semana | Fase |
|--------|------|
| Semana 1 | Fase 0 (scaffolding) + inicio Fase 1 |
| Semana 2 | Fin Fase 1 + Fase 2 |
| Semana 3 | Fase 3 (visor 3D) |
| Semana 4 | Fase 4 (zonas + motor proximidad + color escalado) |
| Semana 5 | Fase 5 (multi-XKT por capas) |
| Semana 6 | Fase 6 (vistas 2D zonificadas) |
| Semana 7 | Fase 7 (pulido + demo) |

Margen: +1 semana para imprevistos (incluido hardware real llegando antes y teniendo que escribir el adapter del proveedor).

## Criterios de aceptación de la PoC

Para considerar la PoC validada:

1. ✅ Simulador publica 20 tags, todos visibles en tiempo real en el visor 3D.
2. ✅ Admin crea worker, tag, asigna uno a otro, define zona peligrosa.
3. ✅ Tag entra en zona peligrosa → alerta aparece en panel < 2 s.
4. ✅ Tag sale de zona → evento se cierra, duración correcta.
5. ✅ Histórico de eventos consultable con filtros.
6. ✅ Retención GDPR: posiciones mayores a N días se borran automáticamente (TTL).
7. ✅ Login/logout OAuth2 funciona (compartido con DT).
8. ✅ Se levanta todo con un `docker compose up`.
