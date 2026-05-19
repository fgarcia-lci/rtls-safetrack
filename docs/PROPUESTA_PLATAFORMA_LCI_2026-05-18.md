# Plataforma RTLS Safetrack — Propuesta software LCi

**Documento técnico-funcional · Versión 1.0 · 18/05/2026 · LCi**

> *Documento que describe el alcance, las funcionalidades y la arquitectura de la plataforma software desarrollada por LCi como parte del proyecto RTLS industrial promovido por David Vidal. Este documento complementa el informe ejecutivo del proyecto centrándose en la capa software.*

---

## 1. Resumen ejecutivo

La plataforma RTLS Safetrack desarrollada por LCi es un sistema completo de localización en tiempo real para seguridad de trabajadores en planta industrial. Su rol dentro del proyecto general es la **capa software**: ingestar las posiciones que envía el hardware UWB, evaluarlas contra un mapa de zonas configurable, generar alertas, visualizarlo todo sobre un modelo BIM 3D y dar trazabilidad auditable de cualquier incidente.

El alcance inicial encargado a LCi era una visualización 3D de posiciones. A medida que el proyecto ha evolucionado, la plataforma se ha ampliado para cubrir un sistema operativo completo de seguridad: motor de zonas, workflow SOS, dashboard de KPIs, ficha auditable de cada trabajador, gestión de personas y empresas, integración con módulos de IA y arquitectura abierta para cualquier proveedor de hardware UWB.

Hoy, mayo 2026, el prototipo está funcional con un simulador que reemplaza al hardware real y permite demostrar el sistema completo end-to-end.

---

## 2. Qué hace y qué NO hace la plataforma

| Sí hace                                                          | NO hace                                                          |
|------------------------------------------------------------------|------------------------------------------------------------------|
| Ingesta de posiciones vía MQTT y procesamiento en tiempo real    | Hardware UWB (lo aporta el proveedor de tags y anchors)          |
| Motor de zonas y proximidad con cinco tipos configurables        | Parada automática de máquinas (no es safety certificado)         |
| Visor 3D BIM (xeokit) + visor 2D top-down                        | Sustituir scanners láser, cortinas ópticas o safety PLC          |
| Workflow SOS y alertas multicanal                                | Certificación ISO 13849 / IEC 62061                              |
| Auditoría de incidentes y cumplimiento GDPR básico               | Outdoor / GPS                                                    |
| Integración con módulos externos (IA en tag, Digital Twin)       | Procesamiento de IA en el tag (responsabilidad de Fatine)        |
| App web responsive para supervisores, admin y seguridad          | App móvil nativa (planificada como evolución futura)             |

> **Importante**: el sistema es complemento de la capa safety certificada, no la sustituye.

---

## 3. Funcionalidades operativas a fecha de hoy

A continuación, las funcionalidades **ya construidas y operativas** en el prototipo actual, agrupadas por área:

### 3.1 Ingesta y procesamiento
- Ingesta de posiciones vía MQTT con adapter por proveedor (en PoC, un `SimulatorAdapter` que emula al hardware real).
- Motor de zonas con máquina de estados fuera / aproximándose / dentro y factor de proximidad continuo.
- Cinco tipos de zona configurables: peligrosa, restringida, aviso, segura, informativa, con severidad 1–5.
- Persistencia híbrida: MySQL para datos relacionales (trabajadores, zonas, eventos), MongoDB para serie temporal de posiciones con **retención configurable** (por defecto 7 días, ajustable).

### 3.2 Editor de zonas
- Editor 3D interactivo en el navegador con primitivas cubo, cilindro y polígono.
- Manipuladores ("gizmos") para mover, rotar y escalar zonas directamente sobre el modelo.
- "Snap al suelo" del modelo BIM con margen automático.
- Modal de detalle de zona al hacer click sobre cualquier visor (2D o 3D).
- Color escalado por severidad y proximidad, visible tanto en 3D como en 2D.

### 3.3 Alertas, SOS y notificaciones
- Workflow SOS completo: pendiente → confirmado por el vigilante → ayuda en camino → resuelto, con auditoría de todo el ciclo.
- Sirena visual centrada con audio para SOS y alertas críticas.
- Notificación multicanal: in-app (WebSocket), email (preparado, pendiente del SMTP del cliente), vibración háptica al tag vía MQTT.
- Política de notificación configurable por zona: a quién avisar (operario, supervisor primario, supervisor de respaldo, manager de la empresa, equipo de seguridad, dirección).
- Notificaciones nativas del navegador con foto del operario y contexto.
- Drawer lateral con tabs (no leídas, alertas, avisos, todas) ordenable por recencia o severidad.
- Banner de toasts auto-dismiss para alertas no críticas.

### 3.4 Visualización
- Visor 3D xeokit BIM Viewer sobre modelo XKT con cubo de navegación, árbol jerárquico del modelo y búsqueda global de elementos.
- Visor 2D top-down sincronizado con la misma información de zonas y operarios.
- Camera-follow del operario seleccionado, con trazo del recorrido.
- Doble click sobre un operario → zoom a su posición; click → ficha resumida en panel lateral.
- Cache local del modelo BIM en el navegador (IndexedDB) para arranques en milisegundos tras la primera carga.
- Pildora identificativa flotante sobre cada operario con foto, nombre, empresa y código.
- Halo coloreado por proximidad y badge "ojo" cuando un operario está siendo seguido.
- Indicador visual de calidad del posicionamiento (verde / amarillo / rojo).

### 3.5 Gestión de personas y empresas
- Modelo de personas unificado: cada persona puede ser trabajador en planta, supervisor o manager de empresa (o varios roles a la vez).
- Datos obligatorios de teléfono y email para escalado de alertas.
- Gestión de empresas (internas LCi / contratistas / visitantes) con contacto manager.
- Asignación de tags a operarios.
- Fecha del último curso PRL con alerta de caducidad automática.
- Soporte de supervisor primario + supervisor de respaldo por operario.

### 3.6 Ficha completa del trabajador
- Página `/workers/:id` con sidebar de identidad + cuatro pestañas: Resumen, Histórico, Perfil de riesgo, Incidentes.
- Histórico configurable con date picker y slider de rango horario.
- Mapa 2D top-down con la ruta del recorrido del día (gradiente temporal) y marcadores rojos en eventos críticos.
- Tabla de tiempo en cada zona con barra de proporción.
- Score de riesgo compuesto (0–10) calculado con entradas en zonas, SOS, tiempo en zonas peligrosas y factor de reincidencia, normalizado contra el percentil 90 de la planta.
- Top zonas conflictivas para ese operario.
- Log auditable de incidentes (proximidad + SOS) con duración y estado.

### 3.7 Dashboard de seguridad
- Indicadores en vivo: operarios en planta, alertas del día, SOS activos, MTTR (tiempo medio hasta ACK), tags con batería baja, tags asignados, empresas presentes, operarios sin tag.
- Top zonas conflictivas del día.
- Top operarios con más incidencias.
- Listado de empresas con personal en planta en ese momento.

### 3.8 Plataforma técnica
- Autenticación corporativa OAuth2 con PKCE integrada con el servidor de autenticación del Digital Twin (sin duplicar identidades).
- Sesión extendida con renovación automática de token y aviso al usuario antes de la caducidad.
- Recuperación elegante tras expiración: redirige al login con mensaje claro.
- Comunicación cliente–servidor en tiempo real vía WebSocket STOMP.
- Soporte multi-planta vía `plant_id` en todas las entidades.
- Internacionalización ES / EN.
- Persistencia híbrida MySQL + MongoDB con retención configurable.
- Arquitectura abierta: el broker MQTT es la frontera, lo que permite cambiar de proveedor de hardware sin reescribir la plataforma.

---

## 4. Funcionalidades en desarrollo y planificadas

Estas funcionalidades están **diseñadas y en el plan de trabajo**, en fase de implementación o priorización inmediata para el piloto industrial:

### 4.1 Integración con el hardware real
- Adaptador MQTT del protocolo del proveedor de tags/anchors al modelo interno (sustituye al simulador actual).
- Calibración de la matriz de transformación que mapea las posiciones que reporta el sistema UWB al sistema de coordenadas del modelo BIM.
- Ajuste fino del editor de zonas sobre el modelo real de planta cuando esté disponible.
- Tests de carga con 30+ tags simultáneos publicando a 1 Hz para validar la arquitectura antes del despliegue.

### 4.2 Operativa de seguridad
- **Pantalla "sala de guardia"**: vista a pantalla completa optimizada para monitor grande de control room, con visión unificada de alertas activas, SOS, operarios y zonas.
- **Replay temporal**: scrubber para revisar la actividad de la planta en las últimas N horas; útil para investigación de incidentes y formación.
- **Detector de evacuación / head-count**: en caso de orden de evacuación, conteo en tiempo real de personas en zonas seguras vs. resto.
- **Pantalla de seguridad de entrada/salida**: alta y asignación de tag al operario al entrar; cierre y devolución de tag al salir.

### 4.3 Cumplimiento y auditoría avanzada
- **Listas blancas de permisos por zona restringida**: solo personal autorizado puede entrar sin disparar alerta.
- **Acompañamiento obligatorio para visitantes** en zonas RESTRICTED.
- **Log permanente y exportable** (CSV / PDF) de todos los accesos a zonas restringidas, para cumplimiento legal y auditorías.
- **Cooldown educativo / detección de reincidencias**: aviso preventivo al operario y al supervisor cuando un mismo operario entra repetidamente en zonas no permitidas.
- **Reportes de peligrosidad por empleado y por empresa contratista** exportables.
- **Auditoría completa de alertas/notificaciones**: a quién se avisó, por qué canal, en qué momento, con qué resultado.

### 4.4 Inteligencia artificial

**Asistente IA privado local (Ollama + chat widget)**: integración de un modelo LLM ejecutándose 100% en infraestructura del cliente (sin enviar datos a cloud externo), accesible desde la app como widget de chat. Casos de uso previstos:

- Consulta en lenguaje natural ("¿quién entró ayer en la zona del reactor?")
- Resumen automático de actividad diaria de planta
- Generación de informes PRL en lenguaje natural
- Asistencia al supervisor en interpretación de KPIs y patrones de riesgo

Diferenciador comercial frente a soluciones cerradas: **los datos nunca salen de la planta**.

**Integración con módulo de IA de Fatine en los tags**: contrato MQTT definido para recibir eventos detectados por la IA local del tag (caída, inmovilidad prolongada, postura anómala, etc.). El procesamiento pesado de IA reside en el dispositivo; la plataforma central recibe el evento, lo persiste, lo escala según la política de la zona y lo registra en la auditoría. Reparto que permite evolucionar ambos componentes (la IA y la plataforma) de forma independiente.

### 4.5 Motor de riesgo evolucionado
- **Modulación dinámica de severidad por permanencia**: una alerta sube de nivel si el operario sigue en la zona pasado X tiempo.
- **Modulación por estado de equipos** (integración con Digital Twin): si el reactor está en marcha, la severidad de su zona se eleva.
- **Modulación por rol del operario × estado de mantenimiento**: un electricista en una zona con corriente bloqueada es OK; sin bloqueo, alerta máxima.

### 4.6 Integración con Digital Twin
- **Documentos geo-localizados**: la app muestra los planos, procedimientos PRL y fichas de seguridad relevantes para la zona donde está cada operario, tirando del gestor documental del DT.
- **Severidad dinámica** según el estado operativo de los equipos en la zona (integración con `electrical-consumers` del DT).
- **Identidad y permisos** ya unificados vía auth-server compartido.

### 4.7 Hardware avanzado e infraestructura
- **Integración con cámaras ONVIF/RTSP** asociadas a zonas de riesgo: al disparar una alerta, la cámara más cercana se activa y muestra el evento en el panel del vigilante.
- **Tags en vehículos** (palas cargadoras, retroexcavadoras, bobcats): se monitoriza también su posición y se generan alertas cuando un operario se aproxima a un vehículo en movimiento.
- **Soporte de zonas anidadas / solapadas** (p. ej. zona DANGER dentro de zona RESTRICTED con políticas distintas).
- **Auto-discovery de tags**: bandeja de aprobación cuando aparece un tag nuevo en la red.
- **Asignación rotatoria de tags** (cuando hay menos tags que empleados).
- **Permisos por empresa contratista a zonas concretas**.

### 4.8 Comunicación externa
- **Notificaciones SMS y llamadas** vía gateway GSM on-premise (para que el aviso llegue incluso sin internet o app abierta).
- **App móvil de manager** (planificada como evolución).
- **Bloqueo lógico SCADA / sala de control** en escenarios donde se requiera detener un equipo desde sistema externo (estudio de viabilidad).

### 4.9 Administración
- **CRUD admin de empresas y supervisores** vía UI.
- **CRUD admin de plant-views** (modelos BIM disponibles): subida de XKT desde la propia app, pre-carga al login.

---

## 5. Arquitectura técnica

### 5.1 Principio rector

**El broker MQTT es la frontera.** Todo lo que ocurre del lado del hardware (tags, anchors, firmware) es responsabilidad del cliente o de su proveedor. La plataforma LCi empieza cuando un mensaje aterriza en el broker. Esto desacopla completamente el software del hardware y permite cambiar de proveedor con un único adapter por escribir.

### 5.2 Diagrama de alto nivel

```
═══════════ LADO HARDWARE (cliente / proveedor) ════════════════

   ┌──────────────────┐         ┌────────────────────────┐
   │  Tags UWB        │         │  Simulador Python      │
   │  + IA local      │         │  (sustituye al HW      │
   │  (Fatine)        │         │   en desarrollo/demo)  │
   └────────┬─────────┘         └───────────┬────────────┘
            │                               │
            └───────────────┬───────────────┘
                            ▼
              ┌────────────────────────────┐
              │  MQTT BROKER (Mosquitto)   │  ◄── FRONTERA
              │  on-premise en planta      │
              └─────────────┬──────────────┘
                            │
═══════════ PLATAFORMA LCi ══════════════════════════════════════

  ┌────────────────────────────────────────────────────────┐
  │  positioning-api (Spring Boot)                         │
  │  ────────────────────────────────────────────────────  │
  │  • Suscriptor MQTT + Adapter por proveedor             │
  │  • Motor de zonas (state machine + proximity)          │
  │  • Dispatcher de notificaciones multicanal             │
  │  • Workflow SOS                                        │
  │  • Score de riesgo y analítica por operario            │
  │  • API REST + WebSocket STOMP                          │
  │  • Auditoría completa                                  │
  └───┬──────────────┬─────────────────┬────────────────┬──┘
      │              │                 │                │
      ▼              ▼                 ▼                ▼
   ┌─────┐    ┌────────────┐    ┌──────────────┐  ┌──────────┐
   │MySQL│    │  MongoDB   │    │ Auth Server  │  │ ai-svc   │
   │CRUD │    │ posiciones │    │ OAuth2 (DT)  │  │ (Ollama, │
   │+ aud│    │ + histórico│    │ compartido   │  │  futuro) │
   └─────┘    └────────────┘    └──────────────┘  └──────────┘
                                       ▲
                                       │ JWT
  ┌────────────────────────────────────────────────────────┐
  │  positioning-frontend (React + Vite + xeokit)          │
  │  ────────────────────────────────────────────────────  │
  │  • Login OAuth2 PKCE                                   │
  │  • Visor 2D + 3D sincronizados                         │
  │  • Editor 3D de zonas con gizmos                       │
  │  • Workers / Tags / Empresas / Supervisores            │
  │  • Ficha de trabajador con histórico + risk score      │
  │  • Dashboard de seguridad                              │
  │  • SOS overlay + drawer + sirena                       │
  │  • Chat widget IA (futuro)                             │
  └────────────────────────────────────────────────────────┘
```

### 5.3 Componentes

| Componente               | Lenguaje / Tech                       | Rol                                                                                |
|--------------------------|----------------------------------------|------------------------------------------------------------------------------------|
| **positioning-api**      | Java 21 / Spring Boot 3.5.6           | Núcleo backend: ingesta, lógica, persistencia, REST, WebSocket                     |
| **positioning-frontend** | React 19 / Vite / TypeScript / MUI 7  | App web completa                                                                   |
| **Auth server**          | (compartido con Digital Twin)         | OAuth2 con PKCE                                                                    |
| **MQTT broker**          | Mosquitto 2 (PoC) / EMQX (prod)       | Frontera HW ↔ SW                                                                   |
| **MySQL**                | 8.x                                   | Datos relacionales: personas, tags, zonas, eventos, auditoría                      |
| **MongoDB**              | 7.x                                   | Serie temporal de posiciones con TTL configurable                                  |
| **Simulador**            | Python 3.11 + paho-mqtt               | Emula 10–30 tags moviéndose por waypoints (herramienta de desarrollo y demo)       |
| **ai-service** (futuro)  | Ollama + modelo LLM local             | Asistente IA privado on-premise                                                    |

### 5.4 Stack tecnológico justificado

| Capa                | Tecnología                              | Por qué                                                  |
|---------------------|-----------------------------------------|----------------------------------------------------------|
| Backend             | Java 21 + Spring Boot 3.5.6             | Mismo stack que el Digital Twin → integración futura     |
| Cliente MQTT        | Eclipse Paho 5.x                        | Estándar, maduro, libre                                  |
| BD relacional       | MySQL 8                                 | Mismo servidor que el DT                                 |
| BD time-series      | MongoDB 7                               | TTL automático ideal para retención GDPR                 |
| Real-time           | WebSocket STOMP + SockJS                | Mismo patrón que el DT, robusto y conocido               |
| Frontend            | React 19 + Vite 7 + MUI 7               | Mismo stack que el DT                                    |
| Visor 3D            | xeokit-sdk 2.6                          | Modelos BIM industriales grandes con buen rendimiento    |
| Auth                | OAuth2 PKCE (auth-server del DT)        | Identidad centralizada                                   |
| Broker              | Mosquitto 2 (PoC) / EMQX (prod)         | Ligero para PoC, migrable a EMQX si escala               |
| Simulador           | Python 3.11 + paho-mqtt                 | Rápido de escribir, fácil de mantener                    |
| IA local (futuro)   | Ollama + modelo open (Llama 3 o sim.)   | Privacidad total, sin cloud, on-premise                  |
| Despliegue          | Docker + docker-compose                 | Un solo `docker compose up` arranca todo                 |

### 5.5 Infraestructura de despliegue

Todo se levanta con **un único `docker compose up`** en el servidor on-premise de la fábrica:

```
docker-compose.yml (RTLS Safetrack)
├── mosquitto              :1883        broker MQTT (entrada del HW)
├── positioning-api        :8090        Spring Boot
├── positioning-frontend   :5180        Nginx con la SPA React
├── mysql                  :3306        schema dt_safetrack
├── mongodb                :27017       db dt_safetrack_metrics
├── ai-service             :11434       (futuro) Ollama
└── (auth-server del DT)   :9000        external_link al stack del DT
```

**Red y seguridad**:
- Broker en LAN industrial, no expuesto a internet.
- Autenticación user/pass en `mosquitto.conf` para PoC; certificados en producción.
- ACLs por topic cuando madure el modelo de permisos.
- IA local sin tráfico saliente: los datos nunca salen de la planta.

### 5.6 Modelo de datos (resumen)

**MySQL — `dt_safetrack`** (prefijo `pos_`):

| Tabla                              | Contenido                                                              |
|------------------------------------|------------------------------------------------------------------------|
| `pos_persons`                      | Trabajadores, supervisores y managers (modelo unificado con flags)     |
| `pos_companies`                    | Empresas internas, contratistas, visitantes                            |
| `pos_tags`                         | Tags físicos + estado + asignación a persona                           |
| `pos_safety_zones`                 | Zonas con tipo, severidad, polígono, rango vertical                    |
| `pos_zone_notification_policies`   | Política de notificación por zona                                      |
| `pos_zone_permissions`             | Roles permitidos por zona                                              |
| `pos_zone_schedules`               | Horarios de activación                                                 |
| `pos_proximity_events`             | Histórico de entradas / salidas en zonas                               |
| `pos_sos_events`                   | Histórico de SOS / botones de pánico                                   |
| `pos_notification_log`             | Auditoría de cada notificación enviada                                 |
| `pos_plant_views`                  | Modelos BIM y vistas disponibles por planta                            |
| `pos_user_view_pref`               | Preferencias visuales por usuario                                      |
| `pos_audit_log`                    | Auditoría GDPR (accesos, exportaciones, etc.)                          |

**MongoDB — `dt_safetrack_metrics`**:

| Colección                  | Contenido                                                       |
|---------------------------|-----------------------------------------------------------------|
| `tag_positions_current`   | Última posición conocida de cada tag (upsert continuo)          |
| `tag_positions_history`   | Histórico de posiciones a 1 Hz (TTL configurable, default 7d)   |

### 5.7 Tiempo real

Mecanismo: **WebSocket STOMP** sobre SockJS, mismo patrón que el Digital Twin. Sin polling, sin SSE, sin MQTT en el navegador.

**Flujo**:
1. Frontend → `GET /api/v1/positions/current?plantId=…` → snapshot inicial inmediato.
2. Frontend → conecta STOMP a `ws://.../api/ws` con JWT.
3. Frontend → suscribe a `/topic/positions/{plantId}`, `/topic/alerts/{plantId}`, `/topic/sos/{plantId}`, `/topic/proximity/{plantId}`.
4. Backend acumula cambios y emite batch cada 200–300 ms.
5. Frontend interpola entre puntos para movimiento fluido a 60 fps.

**Latencia objetivo end-to-end (tag → app del vigilante): < 1 s.**

### 5.8 Seguridad y cumplimiento

- **Autenticación**: OAuth2 con PKCE, identidades centralizadas en el auth-server del DT.
- **Autorización**: roles ADMIN / OPERATOR / USER con permisos por endpoint.
- **GDPR**: retención configurable (default 7d) sobre el histórico de posiciones, auditoría de accesos a datos personales, exportación de informe individual a petición.
- **Datos nunca salen de la planta**: persistencia on-premise, IA local (cuando se incorpore), broker en LAN industrial.
- **Auditoría**: cada notificación, ACK, acceso a zona restringida y exportación queda registrada.

---

## 6. Posicionamiento frente a soluciones comerciales

Frente a productos RTLS comerciales (Sewio, Pozyx, Inpixon y similares), la plataforma LCi ofrece tres ventajas estratégicas:

1. **Control total del software y de los datos.** Todo el procesamiento ocurre en infraestructura del cliente. Las localizaciones de los trabajadores no viajan a clouds externas. La eventual IA del asistente también es 100% local.

2. **Independencia de proveedor de hardware.** La capa adaptadora permite integrar cualquier hardware UWB compatible sin reescribir la plataforma. Esto evita el típico *lock-in* de las soluciones comerciales y abre la puerta a optimizar el coste del hardware sin perder la inversión software.

3. **Integrable con el Digital Twin existente.** Comparte servidor de autenticación, convenciones técnicas y patrón de notificaciones. La fusión de ambos sistemas (mantenimiento + seguridad de personas) en una única plataforma de planta es posible a medio plazo y supone un activo estratégico para LCi.

---

## 7. Estado del prototipo y siguientes hitos

### Estado a 18/05/2026

- Prototipo software **completamente funcional** con simulador.
- Cubre todas las funcionalidades de las secciones **3.1 a 3.8** de este documento.
- Documentación técnica y comercial al día.
- Material de demo en vivo preparado.

### Siguientes hitos hasta cierre del piloto

1. **Integración con HW real** cuando esté disponible: adapter MQTT, calibración de coordenadas y site survey.
2. **Pantalla de sala de guardia** y **replay temporal** (alto valor comercial).
3. **Cumplimiento** completo de zonas RESTRICTED (permisos + exportación auditable).
4. **Integración con la IA de Fatine** vía contrato MQTT.
5. **Asistente IA local** (Ollama) integrado en la app.
6. **Tests de carga** con 30+ tags reales para validar rendimiento.
7. **Iteración de UX** con feedback del piloto.

---

## 8. Glosario rápido

- **RTLS**: Real-Time Location System.
- **UWB**: Ultra-Wide Band, tecnología de radio usada para localización indoor con precisión centimétrica.
- **BIM**: Building Information Modeling, modelo 3D enriquecido de la planta.
- **XKT**: formato binario optimizado de xeokit para servir modelos BIM grandes en el navegador.
- **MQTT**: protocolo ligero de mensajería publicación/suscripción ampliamente usado en IoT industrial.
- **STOMP**: protocolo de mensajería sobre WebSocket que usamos para refrescar la app en tiempo real.
- **Tag**: dispositivo portátil que lleva cada trabajador y que reporta su posición.
- **Anchor**: dispositivo fijo en la planta que sirve de referencia para triangular los tags.
- **PRL**: Prevención de Riesgos Laborales.
- **MTTR**: Mean Time To Resolve, tiempo medio hasta confirmar/cerrar una alerta.

---

*Nota: las capturas de pantalla incluidas en presentaciones complementarias corresponden a la versión actual del prototipo funcional y se incluyen con carácter ilustrativo. La interfaz definitiva podrá variar tras los ajustes derivados del piloto industrial y la validación con los responsables de planta.*
