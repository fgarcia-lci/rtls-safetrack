# 11. Acciones y alertas por tipo de zona

> **Propósito**: catálogo completo de acciones, alertas y notificaciones que el sistema dispara cuando un trabajador entra (o se aproxima) a cada tipo de zona. Es el corazón del valor comercial del producto: el cliente compra **"esto evita que vuelva a pasar lo del operario que metió la mano donde no debía"**.
>
> Este documento es la fuente única para:
> - Decidir qué se implementa en cada fase del PoC.
> - Saber qué se puede *enseñar* en demos aunque no esté implementado (showcase).
> - Trazar las decisiones técnicas pendientes.
>
> Cada acción lleva una etiqueta de estado (ver leyenda).

---

## Leyenda de estados

| Tag | Significado |
|---|---|
| `[IMPL]` | Implementado y desplegado |
| `[FASE-N]` | Planificado para una fase del PoC |
| `[INVESTIGAR]` | Idea que requiere estudio técnico/comercial antes de comprometernos |
| `[DECISIÓN]` | Necesitamos cerrar una decisión (con cliente, con DT, etc.) antes de implementar |
| `[SHOWCASE]` | No se implementa en PoC; se nombra en la demo como capacidad futura para vender más |
| `[DT-INTEGRACIÓN]` | Depende de capacidades del Digital Twin (acoplamiento futuro) |

---

## 1. Filosofía general

| Tipo de zona | Filosofía | Acción base esperada |
|---|---|---|
| 🟥 DANGER | Sin permiso, no se entra. Con permiso, se monitoriza al milímetro. | Alerta crítica + escalado + evidencia |
| 🟧 RESTRICTED | Control de acceso blando. Auditoría completa. | Permiso + ventana horaria + log |
| 🟨 WARNING | Riesgo presente, acceso permitido. Avisar y prevenir. | Aviso + prevención + métricas |
| 🟩 SAFE | Presencia útil para gestión, no para control. | Visibilidad + evacuación |
| 🟦 INFO | Aviso útil, no acción. | Contexto + documentación |

---

## 2. Estado actual del sistema de alertas (lo que ya existe)

| Componente | Estado |
|---|---|
| Detección entrada/salida de zona (state machine) | `[IMPL]` `ZoneEngineService` |
| Cálculo de `proximity_factor` (0..1, lejos→dentro) | `[IMPL]` |
| Persistencia de eventos `pos_proximity_events` | `[IMPL]` |
| Notificación in-app (canal IN_APP) | `[IMPL]` `ProximityNotificationDispatcher` |
| Notificación email (canal EMAIL) | `[IMPL]` |
| Notificación haptic MQTT (canal HAPTIC_MQTT, pendiente wearable real) | `[IMPL]` parcialmente — el dispatcher publica al broker, pero el wearable es asunción de hardware |
| Drawer de alertas en frontend (lista + ACK) | `[IMPL]` básico |
| Halo coloreado en muñequito por proximity | `[IMPL]` |
| Color escalado de zona en visor 3D | `[IMPL]` |

**Gap conocido (a cerrar antes de la primera demo seria)**: el `AlertsDrawer` actual es funcionalmente más pobre que el `NotificationCenter` del Digital Twin. Hay que alinearlo (ver §6.2).

---

## 3. Acciones por tipo de zona

### 3.1 🟥 DANGER

> **Ejemplos**: prensas, hornos, productos químicos, equipos eléctricos AT, robots colaborativos, líneas con energía mecánica almacenada.

#### Acciones inmediatas (al entrar)
- `[IMPL]` Alerta in-app + email a supervisor
- `[FASE-PRÓXIMA]` **Replicar el sistema de alertas del DT 1:1**
  - In-app debe aparecer como toast/dialog visible (estilo NotificationCenter del DT, no solo en el drawer)
  - **Notificación nativa de Chrome/navegador** (Notification API) cuando la app esté en background o pestaña inactiva
  - Mantener compatibilidad de modelos para integración futura sin reescribir
  - **Auditar antes**: revisar `digital-twin-frontend/src/components/Notifications/*` y replicar patrón
- `[IMPL]` Haptic MQTT al wearable (vibración + beep escalado por proximity)
- `[FASE-PRÓXIMA]` **Sirena visual/sonora full-screen** en la pantalla del vigilante:
  - Parpadeo rojo full-window
  - Sonido de sirena (loop hasta ACK)
  - El vigilante físicamente NO puede ignorarla

#### Escalado si no se atiende
- `[INVESTIGAR]` **App móvil para managers** *(probable)*: app dedicada que recibe notificaciones tipo llamada (sonido + pantalla completa) para que un mánager fuera de la sala de control reciba la alerta.
  - Restricción: solo en red interna de planta (modelo Purdue, IEC 62443).
  - Empaqueta wearable + app móvil del manager en un mismo build.
- `[INVESTIGAR]` **SMS / llamada automática externa al supervisor**: si pasa de N segundos sin ACK.
  - Riesgo: integración con telefonía pública violaría aislamiento Purdue/IEC 62443. Hay que ver si hay una pasarela on-prem (gateway GSM industrial).
  - Probabilidad: a investigar; no se compromete en PoC.

#### Capacidades futuras a mencionar en demo (no se implementan)
- `[SHOWCASE]` **Lone worker alert**: si entra solo (sin otro operario en X metros), alerta extra a brigada.
- `[SHOWCASE]` **Man-down detection**: si lleva > 2 min quieto dentro, alerta crítica (operario inconsciente). Requiere acelerómetro en el wearable.
- `[SHOWCASE]` **Evidencia automática**: snapshot del estado al disparar (posición, vecinos, último mantenimiento de la máquina, último ACK del operario) → expediente para auditoría / informe a la mutua.

#### Áreas a estudiar
- `[INVESTIGAR]` **Bloqueo lógico en sala de control / SCADA**: si alguien está dentro de DANGER, los operadores en sala ven *"🚫 NO ARRANCAR — operario en zona"*.
  - Reto: cómo inyectar la notificación en el SCADA. Opciones a explorar:
    - Notificación de sistema OS (toast Windows en el PC del SCADA)
    - Proceso paralelo en la sala que muestre alertas
    - Integración con el HMI del SCADA si lo permite (vendor-specific)
  - **No es safety-certified** (CLAUDE.md). Solo "ayuda visual", la lógica de seguridad sigue siendo del propio equipo.

#### Modulación contextual de severity (afecta a TODAS las acciones DANGER)
> Estas reglas elevan o bajan el grado de alerta según el contexto. Son lo que diferencia el producto de un simple geofencing.

- `[DT-INTEGRACIÓN]` **Estado de los equipos en la zona** (vía DT/OT-gateway):
  - Equipo en marcha → severity ALTA (riesgo real)
  - Equipo parado → severity MEDIA (riesgo latente, no inmediato)
  - Equipo en parada de mantenimiento → severity BAJA o INFO (LOTO aplicado)
- `[FASE-FUTURA]` **Tiempo de permanencia**:
  - Operario que cruza < 3-5s → "tránsito", severity BAJA, sin alerta solo log
  - Operario que entra y permanece → severity completa
  - Configurable por zona
- `[DT-INTEGRACIÓN]` **Tipo de operario × estado de mantenimiento**:
  - Operario de mantenimiento + máquina en parada-mantto + LOTO activo → no es alerta, es trabajo planificado (severity BAJA con log)
  - Operario de producción + máquina en marcha → severity ALTA
  - Operario sin permiso + cualquier estado → severity MÁXIMA
  - Requiere tener: rol del operario, parte de mantenimiento activo del equipo, estado de LOTO. Todo del DT.

#### Notificación enriquecida al receptor
> Cuando una alerta llega al manager / vigilancia / responsable, debe incluir TODA la información para decidir sin tener que abrir 5 pestañas:

- `[FASE-PRÓXIMA]` Cada notificación incluye:
  - Foto + nombre + empresa + cargo del operario
  - Tiempo dentro de la zona
  - Si está solo o no (cuántos compañeros en proximidad)
  - Estado de los equipos de la zona (en marcha / parados / mantenimiento) — vía DT
  - Última alerta del mismo operario (reincidente?)
  - Últimas N posiciones (mini-traza para entender por dónde entró)
  - Acciones rápidas: ACK / Llamar / Marcar como falsa alarma

---

### 3.2 🟧 RESTRICTED

> **Ejemplos**: sala de servidores, laboratorio, archivo confidencial, oficinas dirección, almacén con permisos.

#### Acciones base
- `[IMPL]` Alerta in-app + email + haptic
- `[DECISIÓN]` **Sistema de permisos**: ¿usamos el del DT, montamos uno propio o híbrido?
  - **Opción A** — reutilizar el `auth-server` y la jerarquía de roles del DT (ya compartimos auth-server).
  - **Opción B** — tabla propia `pos_zone_permission` (worker × zone × tipo) ortogonal a roles del DT.
  - **Opción C** (recomendada) — híbrida: rol del DT define permisos por defecto (mantenimiento, producción, externo, dirección, etc.); tabla propia para excepciones puntuales por zona.
  - **Acción**: cerrar con cliente qué nivel de granularidad necesitan antes de codificar.
- `[FASE-PRÓXIMA]` **Lista blanca por permisos**: solo workers con permiso explícito no disparan alerta. El resto = intrusión.
- `[FASE-PRÓXIMA]` **Acompañamiento obligatorio**: si un visitante sin permiso entra, debe haber un internal-acompañante en X metros, si no → alerta.

#### Auditoría y cumplimiento
- `[FASE-PRÓXIMA]` **Log permanente exportable** (CSV/PDF como informe de cumplimiento): quién, cuándo, cuánto tiempo. Endpoint en backend + UI de exportación. Útil para auditorías ISO 27001 / GDPR.
- `[INVESTIGAR]` **Ventana horaria por permiso** *(buena para demo, refinar después)*:
  - Comercial puede entrar a oficinas L-V 8-19
  - Sábado a las 22h → alerta nocturna a vigilancia
  - Configurable por zona × rol × franja horaria.
  - Apuntar para el documento de demo aunque no se implemente en PoC.

#### Notificación al "dueño" de la zona
- `[DECISIÓN]` **Notificación al "dueño" de la zona** (no al supervisor general): el responsable de IT recibe *"Juan ha entrado en sala servidores"*.
  - **Pregunta abierta**: ¿cómo definimos al dueño?
    - Opción A — un campo `owner_user_id` en `pos_safety_zone` (referencia al `linkedUserId` del DT).
    - Opción B — un rol de "responsable de zona" en el sistema de permisos (ver bloque anterior).
    - Opción C — múltiples receptores con prioridades (escalado: dueño → supervisor → vigilancia).
  - **Acción**: ligar la decisión al sistema de permisos.

---

### 3.3 🟨 WARNING

> **Ejemplos**: cruce con AGV, carga suspendida, suelo deslizante, trabajos en altura, paso bajo puente grúa.

#### Aviso al operario
- `[IMPL]` Halo amarillo en visor + haptic suave
- `[DECISIÓN]` **Aviso al operario** — depende del wearable (a definir):
  - Mínimo: vibración + mensaje en pantalla si tiene
  - Si tiene altavoz: audio pre-grabado por zona ("Cuidado, cruce de carretillas")
  - **Configurable para desactivar audio**: una ruta habitual que dispara cada 30s se vuelve cansina y los operarios desconectan
  - **Nota sobre wearable**: aún no decidido el dispositivo. Posible separación: receptor UWB independiente del operario + app móvil del operario para mensajes y avisos.

#### Métricas y formación
- `[INVESTIGAR]` **Conteo de "casi-incidentes"**: cada vez que un operario entra en proximidad sin ACK → métrica para reporte semanal.
  - Utilidad real por confirmar — explorar si genera insights accionables o si es ruido.
- `[FASE-FUTURA]` **Cooldown educativo**: si el mismo operario reincide N veces en una semana en la misma zona WARNING → recomendación automática de formación al supervisor. Bueno para venta (preventivo, no represivo).

#### Acción reactiva sobre maquinaria
- `[INVESTIGAR]` **Coordinación con AGVs / puente grúa** (vía OT-gateway del DT): el AGV puede frenar / desviar al detectar operario en su pasillo.
  - **Restricciones**: NO safety-certified — solo "ayuda" complementaria al sistema de seguridad propio del AGV.
  - **Encaje**: pertenece al saco de "paradas reactivas de maquinaria por presencia". No claro que salga adelante en este cliente. Mantener como capacidad futura para venta.

---

### 3.4 🟩 SAFE

> **Ejemplos**: comedor, vestuarios, sala de descanso, exteriores autorizados, zona de fumadores.

- `[FASE-FUTURA]` **Fichaje implícito** *(opcional)*: tiempo en comedor / descansos contabilizado automáticamente para RRHH.
  - GDPR: hay que avisar a los trabajadores y obtener consentimiento. Ver `09_GDPR_AND_SECURITY.md`.
- `[FASE-PRÓXIMA]` **Detector de evacuación / "head count" en emergencia**:
  - Dashboard en pantalla del vigilante: *"✅ 47/52 operarios en zona segura"*
  - Mapa de calor de quién falta y dónde estaba la última vez
  - **Esta es una de las bondades clave del producto** y va al documento de demo: en una emergencia real, saber cuánta gente queda dentro y dónde está puede salvar vidas.
- `[SHOWCASE]` **Punto de encuentro automático**: en alarma de evacuación, los wearables hacen LED verde + "Diríjase a comedor".
- `[FASE-FUTURA]` **Asistencia de turno**: presencia por zona = comprobación de plantilla esperada vs real. Reporte automático para producción.

---

### 3.5 🟦 INFO

> **Ejemplos**: equipos en mantenimiento, info contextual, zona con obra en curso.

- `[FASE-FUTURA]` **Toast informativo en wearable / app**: "Bomba B-04 en mantenimiento hasta jueves. Contactar Pedro García ext. 423"
- `[DT-INTEGRACIÓN]` ⭐ **Geo-tagged docs** *(diferenciador comercial fuerte)*:
  - Al entrar en una zona, el operario recibe en su móvil/tablet los documentos vinculados a los equipos de esa zona:
    - Procedimiento de operación
    - Ficha de seguridad química
    - Último parte de mantenimiento
    - Manual del fabricante
  - **Encaja con el gestor documental futuro del DT**. La zona referencia equipos → equipos referencian docs → docs aparecen contextualizados al estar cerca.
  - **Esto vende mucho**: combina trazabilidad + acceso a información en el punto de uso. Apuntalo bien en el documento de demo.
- `[FASE-FUTURA]` **Trabajo-en-curso visibility**: zona marcada como "obra en curso por Contratista X hasta 14/05" — los operarios saben que esos compañeros son externos.

---

## 4. Acciones transversales (no por tipo de zona)

### 4.1 Pantallas y dashboards
- `[FASE-PRÓXIMA]` **Pantalla de control "guardia"**: layout dedicado para vigilante.
  - Feed en vivo de alertas (ordenado por severity + tiempo)
  - Foto del operario, ubicación, tiempo dentro
  - Botones rápidos: ACK / Llamar / Marcar falsa alarma
  - Sirena visual full-screen para alertas críticas
- `[FASE-FUTURA]` **Replay temporal**: scrubber para reproducir las últimas X horas. *"Vamos a ver qué pasó a las 14:32 cuando saltó la alerta"*. Vendedor de oro en demos.
- `[FASE-FUTURA]` **Heatmap de incidentes**: zonas más conflictivas de la planta. *"Estas 3 zonas concentran el 70% de las alertas"*. Insight ejecutivo.
- `[FASE-FUTURA]` **Dashboard de KPIs**:
  - Alertas/día
  - MTTR (tiempo medio hasta ACK)
  - Reincidencias por operario
  - Top operarios con incidencias
  - Top zonas conflictivas
- `[SHOWCASE]` **Modo "presentación al cliente"**: botón que dispara una secuencia automatizada (operario simulado entra en zona → alerta → ACK → reporte). Para demo en feria o reuniones.

### 4.2 Documentación contextual ⭐ (transversal a todas las zonas)
> Sale del bloque INFO pero aplica transversalmente: cualquier zona puede vincular docs.
- `[DT-INTEGRACIÓN]` Ver §3.5. Vincular a equipos × docs vía gestor documental del DT.

### 4.3 Evacuación ⭐ (transversal)
> Sale del bloque SAFE pero es funcionalidad transversal del sistema completo.
- `[FASE-PRÓXIMA]` Ver §3.4. Saber cuánta gente queda dentro y dónde es valor de venta independiente del tipo de zona.

---

## 5. Reglas de modulación de severity (transversal)

> El sistema escala/baja la severidad según contexto. Cada regla aplica a múltiples tipos de zona.

| Regla | Aplica a | Estado | Requiere |
|---|---|---|---|
| Estado de equipos en zona (marcha/parado/mantto) | DANGER, WARNING | `[DT-INTEGRACIÓN]` | OT-gateway DT |
| Permanencia (tránsito vs estancia) | DANGER, RESTRICTED, WARNING | `[FASE-FUTURA]` | Configurable por zona |
| Rol operario × estado mantto del equipo | DANGER | `[DT-INTEGRACIÓN]` | Roles DT + partes mantto DT |
| Permisos del operario × zona | RESTRICTED | `[FASE-PRÓXIMA]` | Sistema de permisos (ver §3.2) |
| Ventana horaria | RESTRICTED | `[INVESTIGAR]` | Sistema de permisos |
| Reincidencia del operario | WARNING | `[FASE-FUTURA]` | Histórico |
| Evidencia automática (snapshot del contexto) | DANGER | `[SHOWCASE]` | Almacenamiento + DT |

---

## 6. Canales de notificación

### 6.1 Canales actuales
| Canal | Estado | Notas |
|---|---|---|
| `IN_APP` (drawer + badge) | `[IMPL]` | Funcional pero más pobre que el del DT — pendiente alinear |
| `EMAIL` | `[IMPL]` | Plantilla básica — pendiente enriquecer (foto + contexto, ver §3.1 último bullet) |
| `HAPTIC_MQTT` | `[IMPL]` parcial | Publica al broker, falta wearable real |

### 6.2 Alineación con NotificationCenter del DT
> **Tarea bloqueante para la primera demo seria**.
- `[FASE-PRÓXIMA]` **Replicar AlertsDrawer al estilo NotificationCenter del DT 1:1**:
  - Auditar `digital-twin-frontend/src/components/Notifications/*` (o donde viva)
  - Identificar diferencias funcionales (ordenación, filtros, agrupación, formato, marcadores leído/no leído, etc.)
  - Aplicar las que tengan sentido para Safetrack
  - **Mantener compatibilidad de modelos** para que la integración futura DT↔Safetrack sea drop-in
- `[FASE-PRÓXIMA]` **Notificaciones nativas del navegador (Notification API)**: cuando la app esté en background o pestaña inactiva, disparar notificación del SO. El DT lo hace; replicar el patrón.

### 6.3 Canales nuevos a evaluar
| Canal | Estado | Notas |
|---|---|---|
| **App móvil para managers** | `[INVESTIGAR]` *(probable)* | Notificaciones tipo llamada, solo en red local. Modelo Purdue/IEC 62443 amigable. |
| **SMS / llamada automática** | `[INVESTIGAR]` | Riesgo de violar aislamiento Purdue. Buscar gateway GSM on-prem. |
| **Notificación al SCADA / sala de control** | `[INVESTIGAR]` | Toast OS, proceso paralelo, integración HMI vendor-specific |
| **Sirena visual full-screen en pantalla del vigilante** | `[FASE-PRÓXIMA]` | Patrón clave para acciones críticas |

---

## 7. Jerarquía de receptores (decisión pendiente)

> ¿Quién recibe qué? Hay que cerrar antes de codificar el dispatcher v2.

- `[DECISIÓN]` **¿Reutilizamos la jerarquía supervisor/manager del DT o montamos una propia?**
  - DT ya tiene roles, jerarquías, supervisores configurados
  - Safetrack añade matices: "dueño de zona", "vigilante", "brigada de emergencia"
  - **Recomendación a confirmar**: extender la jerarquía DT con roles específicos de Safetrack (dueño_zona, vigilante, brigada). Reutilizar identidad y árbol de mando.
- Ligado a: §3.2 (permisos) y §3.2 (dueño de zona).

---

## 8. Resumen de decisiones pendientes

> Lista para revisar con cliente o internamente antes de empezar a codificar.

| # | Decisión | Bloquea |
|---|---|---|
| D1 | Sistema de permisos: DT / propio / híbrido | RESTRICTED, dueño de zona, ventana horaria |
| D2 | Definición de "dueño" de zona | Notificaciones específicas |
| D3 | Jerarquía de receptores: reutilizar DT o extender | Dispatcher v2 |
| D4 | Wearable: dispositivo concreto / app móvil del operario | Avisos al operario, audio configurable |
| D5 | App móvil para managers: alcance y plataforma | Notificaciones de escalado |
| D6 | Notificaciones a sala de control / SCADA | Bloqueo lógico |
| D7 | Gateway GSM on-prem para SMS/llamadas | Escalado externo |
| D8 | Modelo de equipos en zona vía DT | Modulación de severity |

---

## 9. Roadmap de implementación sugerido

> Orden propuesto. Cada bloque agrupa items que se pueden hacer juntos sin dependencias cruzadas mayores.

### Bloque A — Cerrar la base de alertas (próximo, tras Fase 4)
1. Replicar NotificationCenter del DT en Safetrack (UI + API Notification + ordenación/filtros)
2. Sirena visual full-screen para alertas críticas
3. Notificaciones enriquecidas con contexto completo (foto, tiempo, vecinos, equipos)

### Bloque B — Permisos y RESTRICTED
4. Cerrar D1 (sistema de permisos) y D2 (dueño de zona)
5. Lista blanca por permisos
6. Log permanente exportable
7. Acompañamiento obligatorio

### Bloque C — Pantallas de control
8. Pantalla "guardia"
9. Detector de evacuación / head-count

### Bloque D — Inteligencia y métricas
10. Modulación de severity por permanencia
11. Modulación de severity por estado de equipos (requiere DT-integración)
12. Cooldown educativo / reincidencias
13. Heatmap + Dashboard KPIs

### Bloque E — Funcionalidades para venta diferencial
14. Geo-tagged docs (depende de gestor documental DT)
15. Replay temporal
16. App móvil de manager (decisión D5 cerrada)

### Bloque F — Showcase only (no implementar, mencionar en demo)
- Lone worker
- Man-down
- Evidencia automática
- Punto de encuentro
- Coordinación con AGVs
- Bloqueo lógico SCADA
- SMS/llamadas externas
- Modo presentación

---

## 10. Capacidades para nombrar en demo (showcase)

> Lista limpia para usar en la guía de demo y materiales comerciales. Son capacidades **planificadas como evolución del producto**, no implementadas en PoC.

- 🛡️ **Lone worker alert**: detección de operarios solos en zonas peligrosas
- 🆘 **Man-down detection**: alerta automática si un operario queda inconsciente
- 📂 **Evidencia automática**: expediente completo del incidente para mutua/auditoría
- 🗺️ **Coordinación con AGVs/puentes grúa**: frenado/desvío automático ante presencia humana
- 📱 **App móvil de manager**: notificaciones tipo llamada en red local de planta
- ⏰ **Ventanas horarias inteligentes**: roles con permisos por franja horaria
- 🟢 **Punto de encuentro automático**: guiado de operarios en evacuación
- 🎬 **Replay temporal**: reproducción del estado de la planta en cualquier instante pasado
- 🔥 **Heatmap de incidentes**: identificación de zonas conflictivas
- 📊 **Dashboard de KPIs**: MTTR, reincidencias, tendencias
- 📑 **Geo-tagged docs**: documentación contextual por zona/equipo
- 🚨 **Bloqueo lógico en SCADA**: aviso "no arrancar" a sala de control
- 🎤 **Modo presentación**: secuencia automatizada para demos comerciales
