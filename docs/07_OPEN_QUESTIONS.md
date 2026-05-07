# 07. Preguntas abiertas

Inventario vivo de preguntas pendientes. Cada una con prioridad, contexto y fecha estimada de respuesta.

**Leyenda**: 🔴 bloquea algo · 🟡 importante pero se puede trabajar en paralelo · 🟢 informativo.

## Para la reunión de esta noche (2026-04-21)

### 🟡 1. Tecnología exacta del hardware

- **Pregunta**: ¿Es UWB confirmado? ¿Qué chip (DW1000/DW3000)? ¿Qué marca/placa concreta de tags y anchors?
- **Por qué**: afecta al formato MQTT y al volumen de datos esperado.
- **Estado**: asumimos UWB + ESP32-DW3000. Si cambia, revisamos `05_HARDWARE_ASSUMPTIONS.md`.
- **Impacto si no se responde**: ninguno en PoC inicial (trabajamos con simulador).

### 🟡 2. Algoritmo de posicionamiento (TWR vs TDoA)

- **Pregunta**: ¿Ya tienen decidido si será ranging punto-a-punto (TWR) o diferencia de tiempos (TDoA)?
- **Por qué**: TDoA escala mejor; TWR es más simple DIY.
- **Impacto si no se responde**: ninguno en PoC.

### 🔴 3. Sample del payload MQTT que emitirá el hardware

- **Pregunta**: ¿Podéis pasarme un ejemplo JSON (o binario) de un mensaje real del sistema cuando esté listo?
- **Por qué**: es lo que aterriza en el broker (la frontera). Lo necesitamos para escribir el `<Vendor>Adapter` que lo traducirá al modelo interno (`PositionEvent`) dentro del `positioning-api`.
- **Impacto si no se responde**: retraso cuando llegue el hardware. No bloquea PoC.

### 🔴 4. Coordenadas de anchors y sistema de referencia

- **Pregunta**: ¿Los anchors estarán instalados con coordenadas conocidas en el sistema del modelo 3D (IFC/XKT) o tendrán su propio origen?
- **Por qué**: si es lo segundo, necesitamos calibrar una matriz 4x4 de transformación (aplicada dentro del adapter).
- **Estado**: asumimos matriz identidad en PoC (simulador publica directamente en coords IFC). Preparamos campo `pos_plant_settings.positioning_transform_matrix` para cuando haga falta.

### 🟡 5. Refresh rate

- **Pregunta**: ¿A qué frecuencia emite cada tag? (1 Hz, 5 Hz, 10 Hz)
- **Por qué**: afecta al volumen MongoDB y a la suavidad de la animación.
- **Estado**: asumimos 1 Hz. Si llega a 10 Hz, ajustamos TTL y muestreo.

### 🟡 6. Precisión real esperada en planta

- **Pregunta**: La precisión prometida por el fabricante es ¿en laboratorio o en planta industrial con metal y ruido?
- **Por qué**: en planta real, UWB cae de "10 cm" a "30-80 cm". Diseñamos los buffers de zonas con eso en mente.

### 🔴 7. Tag ↔ Worker binding

- **Pregunta**: ¿Cada trabajador tendrá un tag personal o usarán un pool compartido con asignación al entrar al turno (kiosko)?
- **Por qué**: afecta a UX y arquitectura del módulo de binding.
- **Estado**: para PoC usamos asignación manual por admin. Si nos dicen "pool con kiosko", añadimos kiosko en fase post-PoC.

### 🟢 8. ¿Tienen ya prototipo funcionando?

- **Pregunta**: ¿Hay hardware funcionando hoy aunque sea en laboratorio? ¿Cuándo lo tendremos en nuestra planta para integrar?
- **Estado**: Paco estima ">1 mes" para tener algo real.

### 🟡 9. Outdoor en el futuro

- **Pregunta**: ¿Necesitarán cubrir zonas exteriores (patios, aparcamientos)? ¿Cuándo?
- **Estado**: fuera de PoC. Si se mete, alternativa GPS vía adapter.

### 🟢 10. Parada de máquinas

- **Pregunta**: ¿Esperan que este sistema pare máquinas por proximidad sin capa safety certificada?
- **Por qué**: CRÍTICO legal y técnicamente. Un sistema de trazabilidad no es seguridad funcional (ISO 13849 / IEC 62061).
- **Estado**: Paco ya lo ha aclarado → "nos olvidamos para PoC, solo alertas + vibración". Dejamos apuntado para cuando se plantee.

### 🔴 11. Servidor on-premise para el stack

- **Pregunta**: ¿El servidor donde corrirá todo (broker + api + frontend + DBs) lo aporta el cliente o lo aportamos nosotros? ¿Specs mínimas? ¿Estará disponible antes del scaffolding?
- **Por qué**: el sistema completo vive ahí. Sin servidor no hay despliegue.
- **Estado**: pendiente. Preferiblemente Linux para Docker. Stack cómodo con 4 CPU / 8-16 GB RAM / 100 GB disco SSD (dimensionado PoC).

### 🔴 12. Visibilidad de red: HW ↔ broker

- **Pregunta**: ¿El hardware (tags, anchors, concentrador) puede alcanzar el broker MQTT en LAN industrial sin saltos raros? ¿VLAN, firewall, credenciales?
- **Por qué**: si la red se complica, añade días al arranque. Además afecta a políticas ACL del broker.
- **Estado**: asumimos LAN industrial plana con el broker accesible desde los puntos publicadores. Autenticación user/pass en PoC; certificados en prod.

### 🟡 13. Capacidades del tag: haptic / LED / buzzer

- **Pregunta**: ¿Los tags tienen vibrador, LED, buzzer? ¿Se les pueden enviar comandos MQTT para activarlos?
- **Por qué**: el canal `HAPTIC_MQTT` depende de esto. Si los tags son mudos, eliminamos el canal y dejamos solo alertas in-app / email.
- **Estado**: asumimos vibrador + LED. Confirmar.

### 🟡 14. SMTP para canal email

- **Pregunta**: ¿Qué servidor SMTP usamos para enviar alertas por email? ¿Uno del cliente, relay externo, servicio transaccional (SendGrid, etc.)?
- **Por qué**: el canal EMAIL del `NotificationDispatcher` lo necesita configurado.
- **Estado**: sin decidir. PoC puede usar cualquier relay (incluso Gmail con contraseña de aplicación para demos internas).

### 🟢 15. Infraestructura OT existente

- **Pregunta**: ¿Tienen ya broker MQTT previo? ¿SCADA, AVEVA, historiadores con los que haya que coordinar? ¿Políticas de seguridad OT (segmentación, zonas IEC 62443)?
- **Por qué**: nos ayuda a no pisar sistemas existentes y encajar el broker en su red.

## Preguntas internas / decisiones nuestras

### 🟡 16. MongoDB y MySQL: ¿compartidas con DT o instancias propias?

- **Pregunta**: ¿Usamos las mismas instancias MySQL (puerto 3307) y MongoDB (puerto 27016) que el DT (con BDs separadas `dt_safetrack` y `dt_safetrack_metrics`), o arrancamos instancias dedicadas?
- **Decisión provisional**: **compartidas** para ahorrar recursos en dev. En producción se separarían por IEC 62443.
- **Pendiente**: confirmar en Fase 0.

### 🟡 17. Broker MQTT: Mosquitto o EMQX

- **Pregunta**: para PoC, ¿Mosquitto 2 o EMQX 5?
- **Decisión provisional**: **Mosquitto**. Ligero, conocido. Migrar a EMQX es 1 día si hace falta.

### 🟡 18. ¿Frontend separado o SPA monolítica con módulos?

- **Pregunta**: para PoC nuestra, ¿un único frontend React, o múltiples SPAs (una para admin, otra para monitor)?
- **Decisión provisional**: **único frontend**, con rutas protegidas por rol (`/admin`, `/monitor`, `/events`).

### 🟢 19. Nombre del repo/proyecto

- **Pregunta**: ¿"rtls-safetrack" o "safetrack" o "rts" como nombre de carpeta raíz?
- **Decisión**: `rtls-safetrack` (resuelto por Paco).

### 🟢 20. Idioma de los códigos de zona

- **Pregunta**: en `pos_safety_zones.code`, ¿prefijos en español (Z_PELIGRO_01) o inglés (Z_DANGER_01)?
- **Decisión provisional**: inglés (coherente con el código). Nombres (para UI) en idioma del usuario.

### 🟢 21. ¿Avatar 3D con foto del worker o simplificado?

- **Pregunta**: ¿xeokit annotation con foto+nombre del worker o solo esfera de color?
- **Decisión provisional**: PoC simplificado (esfera + tooltip con nombre al hover). Prod: annotation con avatar.

### 🟢 22. Permisos por planta en workers

- **Pregunta**: ¿un worker puede estar asignado a varias plantas simultáneamente?
- **Decisión provisional**: en PoC, no — cada tag está ligado a una planta. Si hace falta, creamos `pos_worker_plant_assignments`.

### 🟡 23. Política de retención de posiciones (GDPR)

- **Pregunta**: ¿cuántos días guardamos el histórico raw? ¿Y los agregados?
- **Decisión provisional**:
  - `tag_positions_5min`: 48h (TTL Mongo).
  - `tag_positions_hourly`: 7 días.
  - `tag_positions_daily`: 30 días máximo (configurable por planta, default 7).
- **Pendiente**: validar con abogados del cliente antes de producción.

## Respondidas (archivo)

- ✅ **Safety**: solo alertas + vibración, nada de parar máquinas en PoC (Paco, 2026-04-21).
- ✅ **Escala PoC**: 1 planta, 20-30 trabajadores (Paco, 2026-04-21).
- ✅ **Latencia**: objetivo 1 segundo (Paco, 2026-04-21).
- ✅ **Alcance**: proyecto paralelo al DT, stack clonado, integración futura (Paco, 2026-04-21).
- ✅ **XKT actual**: usar `prueba_paco3.xkt` existente, limitado (4 máquinas) (Paco, 2026-04-21).
- ✅ **Auth-server**: se comparte con el DT, no duplicar (Paco, 2026-04-21).
- ✅ **DB**: duplicar (Paco, 2026-04-21).
- ✅ **Arquitectura MQTT**: el broker es la frontera; el cliente publica en su formato. Modelo interno propio (DTOs) + adapter por proveedor dentro del `positioning-api` (sin gateway pre-broker). (Paco, 2026-04-21).
- ✅ **Broker MQTT**: alojado por nosotros en servidor on-premise de la fábrica (Mosquitto en Docker, LAN industrial). (Paco, 2026-04-21).
- ✅ **Refresh frontend**: WebSocket STOMP con batching 200-300 ms en servidor + interpolación lineal en cliente a 60 fps. (Paco, 2026-04-21).
- ✅ **Plant ID piloto**: `TSP3` (Paco, post-reunión 2026-04-21).
- ✅ **Modelo 3D**: arrancamos con `prueba_paco3.xkt` existente. La aplicación tiene que permitir cambio fácil de XKT (patrón `pos_plant_views`, como en el DT). Paco está intentando exportar uno mejor; puede llegar antes de las pruebas. (Paco, post-reunión 2026-04-21).
- ✅ **Zonas peligrosas de ejemplo**: validados ejemplos genéricos tipo "torno", "CCM-3", "cinta transportadora" para guion de demo. (Paco, post-reunión 2026-04-21).
- ✅ **Workflow de notificación por zona**: configurable por zona. Default = solo trabajador (háptica). Opcionalmente supervisor directo, equipo de seguridad, todos los managers. Implica `pos_zone_notification_policies` + `pos_workers.supervisor_user_id`. (Paco, post-reunión 2026-04-21).
- ✅ **Roles**: reutilizamos roles existentes del DT en PoC: `ROLE_ADMIN` (admin total), `ROLE_OPERATOR` (seguridad / supervisor — ACK, ver realtime), `ROLE_USER` (dashboard básico). Cuando se integre al DT en Q3 2026, se crean `ROLE_SAFETRACK_*` con permisos granulares siguiendo el patrón de EC. Ver `ROLES_MAPPING.md`. (Paco, post-reunión 2026-04-21).
- ✅ **Tipología de workers**: nosotros definimos los campos. INTERNAL/CONTRACTOR/VISITOR + empresa, código empleado, tag id. (Paco, post-reunión 2026-04-21).
- ✅ **Naturaleza de la PoC**: PoC para DEMO de venta — no hay proyecto aprobado. Si la demo no convence, perdemos el proyecto. Prioridad pivota a impacto visual y look&feel del DT. Integración futura con DT como anzuelo comercial. (Paco, post-reunión 2026-04-21).
