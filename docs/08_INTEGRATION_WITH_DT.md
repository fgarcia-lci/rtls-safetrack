# 08. Plan futuro de integración con el Digital Twin

Este documento describe **cómo** y **cuándo** RTLS Safetrack se mergea al Digital Twin. No se ejecuta hasta que la PoC esté validada.

## Cuándo hacer la integración

Criterios para decidir que es momento de integrar:

1. ✅ PoC funcional (criterios de aceptación en `06_POC_PLAN.md`).
2. ✅ Hardware real disponible y emitiendo (al menos un piloto en 1 planta).
3. ✅ Cliente ha validado el sistema y hay decisión de producción.
4. ✅ Estabilidad de schema: al menos 2 semanas sin cambios breaking en tablas.
5. ✅ Disponibilidad para dedicar 2 semanas sin nuevos features (ventana de integración).

Estimación: **Q3 2026** probable.

## Cómo se hace la integración

### Backend

**1. Mover paquetes Java**

```
rtls-safetrack/positioning-api/src/main/java/com/lci/rts/positioning/
  → digital-twin-backend/digital-twin-api/src/main/java/com/lci/dtapi/positioning/
```

Renombrar imports (`com.lci.rtls.positioning.*` → `com.lci.dtapi.positioning.*`).

**2. Consolidar dependencias en `pom.xml`**

Añadir al `digital-twin-api/pom.xml`:
- `org.eclipse.paho:org.eclipse.paho.client.mqttv3` (o `paho.mqttv5`)
- Cualquier lib que Safetrack use y el DT no tenga.

**3. Fusionar migraciones Flyway**

Las V1-Vn de Safetrack se renumeran como V70+ (continuando la serie del DT). Al arrancar el api integrado contra una BD `dt_lci` limpia, aplica todas las migraciones.

Para BDs existentes (entornos ya corriendo DT): crear V70 "positioning_migrations_marker" que registra en `flyway_schema_history` las V1-Vn de Safetrack si ya se aplicaron.

**Renombrar tablas**: mantener prefijo `pos_`. No hay colisiones con tablas del DT.

**4. Configuración Spring**

- `application.yml` del DT gana propiedades `app.mqtt.*`, `app.positioning.*`.
- `@ComponentScan` del DT recoge automáticamente el nuevo paquete.
- SecurityConfig añade permisos `MODULE_POSITIONING_ACCESS`, `SAFETY_MANAGE`, `POSITIONING_ADMIN`.

**5. Endpoints**

- Endpoints `/v1/workers`, `/v1/tags`, `/v1/zones`, `/v1/positions`, `/v1/proximity-events` se quedan bajo el mismo `/api/v1/` del DT.
- No hay colisión (ningún endpoint del DT empieza así).

**6. WebSocket**

- Topic `/topic/positions/{plantId}` → añadido al mismo broker STOMP del DT.
- Topic `/topic/alerts/{plantId}` → si el DT ya tiene uno similar, decidir: ¿unificar o mantener separado? Recomendado **unificar** (`/user/queue/alerts` del DT con un tipo más).

**7. Notification Dispatcher**

- El dispatcher del DT gana un canal nuevo `HAPTIC_MQTT`.
- Las `AlertDefinition` del DT ganan un tipo nuevo `PROXIMITY_ALERT`.

### Frontend

**1. Mover código**

```
rtls-safetrack/positioning-frontend/src/pages/*
  → digital-twin-frontend/src/modules/positioning/pages/*
rtls-safetrack/positioning-frontend/src/components/*
  → digital-twin-frontend/src/modules/positioning/components/*
```

**2. Consolidar Redux store**

Añadir slices a `digital-twin-frontend/src/store/index.ts`:
- `positionsSlice`
- `workersSlice` (si no existe, el DT no tiene workers como tal)
- `safetyZonesSlice`
- `proximityAlertsSlice`

**3. Routing**

En `src/App.tsx` del DT añadir:

```tsx
<Route path="/positioning/*" element={
  <ModuleRoute permission="MODULE_POSITIONING_ACCESS">
    <PositioningModule />
  </ModuleRoute>
} />
```

Dentro del módulo:
- `/positioning` → Dashboard
- `/positioning/live` → Vista 2D+3D realtime
- `/positioning/workers` → CRUD workers
- `/positioning/tags` → CRUD tags
- `/positioning/zones` → CRUD + editor zonas
- `/positioning/events` → Histórico

**4. Menú principal del DT**

Añadir entrada "Safetrack" en AppBar del DT con icono y submenú.

**5. i18n**

Fusionar traducciones de Safetrack (`positioning.*`) en los JSON del DT.

### Infraestructura

**1. docker-compose**

Añadir al `dt-infra/docker-compose.yml` del DT:
- Servicio `mosquitto` (broker MQTT).
- Servicio `positioning-simulator` (opcional, para dev / demos).

> Nota: ya **no** hay un servicio `positioning-gateway` separado. La traducción del payload del proveedor al modelo interno vive como adapter dentro del `positioning-api` (ver `02_ARCHITECTURE.md`).

**2. Nginx**

- El gateway nginx del DT ya hace reverse proxy a la API. No cambia (mismo /api/v1).
- WebSocket: ya está configurado en nginx del DT para STOMP.

**3. MySQL / MongoDB**

Decisión: **unificar a las mismas instancias del DT**.

- MySQL: tablas `pos_*` en la BD `dt_lci` (mismo schema).
- MongoDB: colecciones de Safetrack en la misma BD `dt_metrics` o BD separada `dt_metrics` + `dt_positioning`.

Ventaja de BDs unificadas: queries cross-domain (ej. "muéstrame el histórico de producción de una máquina junto con las veces que un worker entró en su zona peligrosa") son triviales.

### Auth

No cambia nada: ya usamos el mismo auth-server. Solo:
- Retirar el cliente OAuth2 `rtls-safetrack-web` (o reutilizar para el módulo).
- Añadir permisos nuevos (`MODULE_POSITIONING_ACCESS`, `SAFETY_MANAGE`, `POSITIONING_ADMIN`) vía migración Flyway.

## Puntos de contacto con módulos existentes

**Electrical Consumers**: las zonas de peligro pueden enlazarse a consumidores eléctricos (tabla `ec_consumers` del DT).
- Añadir `pos_safety_zones.related_ec_consumer_id` (FK a `ec_consumers`).
- Use case: "zona de peligro alrededor del CCM-3 cuando el motor M-123 está en mantenimiento programado".

**Alertas**: fusionar `ProximityEvent` con el sistema de alertas del DT.
- Crear nuevo `AlertNotificationType` con código `PROXIMITY_ALERT`.
- Las alertas de proximidad aparecen en el mismo NotificationCenter del DT.
- Reglas escalación y quiet hours del DT funcionan de forma transparente.

**Work Orders**: auto-crear una work order cuando hay un incidente de proximidad grave.
- Configurable por `pos_safety_zones.action_on_entry`.

**Device Catalog**: enlace `pos_safety_zones.related_device_id` → `device_catalog.id`.
- Use case: "al hacer click en un device del 3D del DT, ver si tiene una zona de peligro asociada".

## Timeline de integración (post-PoC)

| Semana | Tarea |
|--------|-------|
| 1 | Preparación: consolidar dependencias, renombrar paquetes en branch feature/positioning-merge. |
| 1 | Migraciones Flyway renumeradas, probadas contra BD limpia y contra BD existente del DT. |
| 2 | Merge backend: compilar, pasar tests. |
| 2 | Merge frontend: integración rutas, menú, store. |
| 2 | Docker-compose unificado, arranque end-to-end probado. |
| 2 | Smoke tests completos. |
| Post | Retirar repo/carpeta `rtls-safetrack` (o mantener como read-only histórico). |

## Riesgos de la integración

| Riesgo | Mitigación |
|--------|------------|
| Conflictos de migración en entornos prod del DT | Probar primero en entorno staging con copia de BD prod. |
| Librerías Paho conflictan con algo del DT | Aislamos detrás de interfaces, fácil de swappear si hay conflicto. |
| WebSocket topics colisionan | Prefijo `positioning/` para todos los topics nuestros. |
| Performance del DT degrada por ingestión MQTT | MQTT subscriber desacoplado del request path, workers separados; monitorizar JVM. |
| Cliente OAuth2 duplicado | Fácil: borrar el viejo `rtls-safetrack-web` y usar el del DT con permisos extendidos. |

## Rollback

Si la integración falla, se puede:
1. Revertir branch de integración.
2. Relanzar `rtls-safetrack` como proyecto separado desde último estado estable.
3. Los datos MongoDB/MySQL de Safetrack están en BDs separadas (pre-integración), no se pierden.

Por eso la decisión de **no compartir BD en PoC** es crítica para poder hacer rollback limpio.
