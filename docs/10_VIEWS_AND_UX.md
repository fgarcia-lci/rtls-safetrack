# 10. Vistas, navegación y UX

Este documento captura cómo se explora el sistema desde el frontend. Es la guía de UI/UX de la PoC.

## Estructura de páginas

```
RTLS Safetrack frontend
├─ /login                      (público) OAuth2 login
├─ /callback                   (público) OAuth2 callback
│
├─ /                           (auth) → redirect a /dashboard
│
├─ /dashboard                  (auth) Panel principal de seguridad
│
├─ /live                       (auth) Vista en vivo
│   ├─ /live/2d                  └ Plano 2D general
│   └─ /live/3d                  └ Visor 3D general
│   └─ /live/view/:viewId        └ Vista específica (2D o 3D, según tipo)
│
├─ /events                     (auth) Histórico de eventos de proximidad
│   └─ /events/:eventId           └ Detalle de evento
│
├─ /workers                    (SAFETY_ADMIN) Gestión trabajadores
│   └─ /workers/:workerId        └ Detalle + histórico de posiciones
│
├─ /tags                       (SAFETY_ADMIN) Gestión de tags
│
├─ /zones                      (SAFETY_ADMIN) Gestión de zonas de seguridad
│   ├─ /zones/new                └ Crear nueva (editor polígono)
│   └─ /zones/:zoneId            └ Editar existente
│
├─ /settings                   (auth según sección)
│   ├─ /settings/plants          └ Config por planta (retención, vistas)
│   ├─ /settings/views           └ Gestión de vistas 2D/3D por planta
│   └─ /settings/users           └ Preferencias de usuario
│
└─ /audit                      (AUDITOR) Log de auditoría
```

## Dashboard (`/dashboard`)

Página de aterrizaje para roles SAFETY_MANAGER/PLANT_MANAGER.

### Layout (desktop)

```
┌─────────────────────────────────────────────────────────────┐
│ AppBar: RTLS Safetrack | PlantSelector ▼ | 🔔 Alertas | 👤   │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐           │
│  │ KPI:    │ │ KPI:    │ │ KPI:    │ │ KPI:    │           │
│  │ Active  │ │ Alerts  │ │ Zones   │ │ Low Bat │           │
│  │ workers │ │ last 24h│ │ active  │ │ tags    │           │
│  │   23    │ │    7    │ │   12    │ │    2    │           │
│  └─────────┘ └─────────┘ └─────────┘ └─────────┘           │
│                                                             │
│  ┌───────────────────────────────┐ ┌───────────────────┐   │
│  │ Plano 2D mini (top-down)      │ │ Últimos eventos   │   │
│  │ avatares en tiempo real       │ │ (tabla lista)     │   │
│  │ click → /live/2d              │ │ 1 Juan → CCM_3    │   │
│  │                               │ │ 2 Ana → Restring  │   │
│  │                               │ │ 3 Pedro → ...     │   │
│  └───────────────────────────────┘ └───────────────────┘   │
│                                                             │
│  ┌───────────────────────────────────────────────────────┐ │
│  │ Gráfica 24h: alertas por hora (barras)                │ │
│  └───────────────────────────────────────────────────────┘ │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### Datos que muestra

- 4 KPI cards (configurables por rol).
- Mini-mapa 2D con posiciones actuales (refresh 1 Hz vía WebSocket).
- Lista de últimos 10 eventos (WebSocket append).
- Gráfica histórica 24h.

## Vista en vivo 2D (`/live/2d`)

### Layout

```
┌─────────────────────────────────────────────────────────────┐
│ AppBar                                                      │
├─────────────────────────────────────────────────────────────┤
│ [2D] [3D] [Volver a dashboard]   View: General ▼  ⚙️        │
├──┬──────────────────────────────────────────────────┬───────┤
│  │                                                  │ Panel │
│L │          Canvas 2D (plano SVG)                   │ dere- │
│i │          • avatares como círculos                │ cho   │
│s │          • zonas peligrosas como polígonos       │       │
│t │            translúcidos con color                │ -Filt-│
│a │          • hover → nombre worker + tooltip       │  ros  │
│  │          • click → abre detalle en panel dcho    │ -Work-│
│w │                                                  │ er    │
│o │                                                  │  sel  │
│r │                                                  │ -Ale- │
│k │                                                  │ rts   │
│e │                                                  │ act.  │
│r │                                                  │       │
│s │                                                  │       │
│  │                                                  │       │
└──┴──────────────────────────────────────────────────┴───────┘
```

### Interacciones

- **Zoom y pan** del canvas (mouse wheel + drag).
- **Click en avatar**: panel derecho muestra worker + últimas 5 min + botón "seguir" que centra el canvas en él.
- **Click en zona**: panel derecho muestra zona (tipo, severity, workers dentro ahora, últimos entrantes).
- **Filtros** lado izquierdo: buscar worker, filtrar por empresa, por rol, ocultar zonas de bajo nivel.
- **Refresh automático**: WebSocket push.
- **Follow mode**: marcar avatares que nos interesen → cámara los sigue.

### Tecnología

- SVG con D3.js o Canvas 2D con Konva.js. Probablemente **SVG + React**: más declarativo, suficiente perf para 30-50 avatares.
- Animación: CSS transitions de `transform` entre posiciones (interpolación).

## Vista en vivo 3D (`/live/3d`)

### Layout

Similar al 2D pero con xeokit:

```
┌─────────────────────────────────────────────────────────────┐
│ AppBar                                                      │
├─────────────────────────────────────────────────────────────┤
│ [2D] [3D]   View: General ▼  ⚙️                             │
├──┬──────────────────────────────────────────────────┬───────┤
│  │                                                  │ Panel │
│  │          XeoKit 3D viewer                        │ dere- │
│  │          • modelo XKT (prueba_paco3)             │ cho   │
│  │          • avatares como anotaciones 2D          │       │
│  │            posicionadas en XYZ                   │       │
│  │          • zonas como meshes semitransparentes   │       │
│  │          • NavCube arriba-derecha                │       │
│  │                                                  │       │
│  │                                                  │       │
└──┴──────────────────────────────────────────────────┴───────┘
```

### Pintado de avatares

Opción A (PoC): xeokit **Annotation** — sprite 2D siempre mirando a cámara, con círculo de color + nombre.

```tsx
viewer.metaScene.createMetaObject({ ... });
const annotation = new Annotation(viewer.scene, {
  id: `avatar-${tagId}`,
  worldPos: [pos.x, pos.y, pos.z + 1.8],  // a la altura de la cabeza
  occludable: true,
  markerShown: true,
  labelShown: true,
  markerHTML: `<div class="marker-${statusColor}"></div>`,
  labelHTML: `<div class="label">${workerName}</div>`
});
```

Opción B (futuro): geometría 3D real (cilindro o GLB de persona), con orientación si la tenemos.

### Pintado de zonas

Crear `SceneModel` sintético con meshes translúcidos:

```tsx
const zoneMesh = sceneModel.createMesh({
  id: `zone-${zoneId}`,
  primitive: "triangles",
  positions: extrudedPolygonVerts,  // polygon_2d extruido en Z
  indices: tris,
  color: hexToRgb(zone.display_color),
  opacity: 0.3
});
```

### Controles cámara

- Rotación/zoom/pan estándar xeokit.
- Botones predefinidos: "vista superior", "vista norte", "seguir worker X".

## Vistas específicas (`/live/view/:viewId`)

El admin define vistas (en `pos_plant_views`), cada una con su modelo asociado.

Use case: "planta demasiado grande → cargar solo XKT del CCM principal", "solo planchar el taller A en 2D".

Implementación: misma página `/live` pero carga el `asset_url` y `default_camera` de la vista seleccionada.

## Editor de zonas (`/zones/new`, `/zones/:zoneId`)

### Flujo de creación

1. Elegir vista sobre la que dibujar (plano 2D top-down recomendado).
2. Click a click para definir vértices del polígono (polyline).
3. Doble click para cerrar el polígono.
4. Panel derecho rellena datos: nombre, tipo, severity, z_min, z_max, color, roles permitidos, horario.
5. Preview en tiempo real: el polígono aparece dibujado con el color elegido.
6. Guardar → va a `pos_safety_zones`.

### Edición

- Arrastrar vértices para moverlos.
- Botones +/- para añadir/quitar vértices.
- Botón "duplicar" para crear zona similar.

### Importar

Para PoC no, pero a futuro: importar polígonos desde DXF, KML, o IFC (IfcSpace).

## Gestión de workers (`/workers`)

### Tabla principal

Columnas: foto, nombre, employee_code, empresa, tipo (INTERNAL/CONTRACTOR/VISITOR), rol en planta, tag asignado, estado (activo/inactivo), última vez visto.

Filtros: empresa, tipo, activo/inactivo, con/sin tag.

Acciones inline: editar, asignar tag, desactivar.

### Detalle (`/workers/:workerId`)

- Datos del worker + foto.
- Tag actual asignado (si hay).
- Heatmap de posiciones últimos 7 días (reutiliza polygon del mapa).
- Histórico de eventos de proximidad.
- Estadísticas: horas en planta, zonas más visitadas.

## Gestión de tags (`/tags`)

### Tabla

Columnas: serial, modelo, batería, último visto, estado, worker asignado.

Alertas visuales: batería <15% en amarillo, <5% en rojo, LOST en gris.

Acciones: asignar worker, revocar asignación, marcar como descomisionado, enviar PING (comando MQTT).

## Histórico de eventos (`/events`)

### Tabla con filtros

Filtros: rango fecha, worker, zona, severity, autorizado sí/no, acknowledged sí/no.

Columnas: fecha/hora entrada, worker, zona, duración, severity, acciones disparadas, ACK por.

Acciones: ver detalle, exportar CSV del resultado filtrado.

### Detalle de evento (`/events/:eventId`)

- Timeline: entrada → acciones disparadas (con timestamps y canal) → salida → ACK.
- Minimapa con punto de entrada y salida.
- Vídeo si hay cámaras integradas (fuera PoC).
- Botón "acknowledge" si está pendiente.

## Panel de alertas (drawer lateral)

Icono de campana en AppBar con badge de cuenta. Click → drawer derecho con:

- Pestañas: "Activas" (no ACK), "Todas".
- Ordenación: más reciente, más crítica.
- Cada alerta: severity, worker, zona, hace cuánto tiempo, botón ACK, botón "Ver en mapa".
- WebSocket push: nuevas alertas aparecen arriba con animación + sonido opcional.

## Reutilización de componentes del DT

Clonados literal:

- `MainLayout` / AppBar / NotificationCenter pattern.
- `PlantSelector` (se alimenta de endpoint `/v1/plants/accessible` del DT o de uno nuestro).
- `UserMenu`, `LanguageSelector`.
- `ProtectedRoute`, `ModuleRoute`.

## Dispositivos soportados

- **Desktop / laptop** (target principal): Chrome/Edge/Firefox modernos. 1920×1080 mínimo recomendado.
- **Tablet** (operadores en campo): 1024×768 mínimo. Adaptar AppBar compacta, drawer modal.
- **Móvil**: no PoC. En prod: app separada o adaptativa solo para panel de seguridad minimal.

## Accesibilidad

- Contraste colores alertas WCAG AA.
- Keyboard navigation (todo accesible sin ratón).
- Lectores de pantalla: aria-labels en avatares ("Juan Pérez en zona CCM-3").
- Colores NO es la única diferencia: iconos + texto en alertas.

## Performance targets PoC

- Vista 2D con 30 avatares: 60 fps sostenidos.
- Vista 3D con 30 avatares + modelo XKT: 30 fps sostenidos.
- Latencia WebSocket posición → pantalla: <500ms.
- Tiempo de carga inicial página: <3s.
