# 12. Guía comercial y demo de RTLS Safetrack

> **Versión 2.0 · 18/05/2026** — Actualizado el mapa de capacidades con todo lo implementado entre 7 y 18 de mayo (SOS completo, ficha de trabajador con score de riesgo, dashboard, modal de sirenas, modelo unificado de personas, PRL caducado). Roadmap reorganizado. Guion ampliado con escena de SOS y acto dedicado a la ficha de trabajador. Mención explícita al asistente IA local.
>
> **Propósito**: documento único para vender el producto y guiar la demo en vivo. Tres partes:
>
> - **Parte 1** — material comercial (qué se vende, a quién, por qué)
> - **Parte 2** — guion de demo paso a paso (qué mostrar, en qué orden, qué decir)
> - **Parte 3** — material de soporte (checklist técnico, troubleshooting, FAQ)
>
> Complementa al `docs/11_ZONE_ACTIONS_AND_ALERTS.md` (catálogo de acciones por zona), al `docs/00_OVERVIEW.md` (visión general) y al `docs/PROPUESTA_PLATAFORMA_LCI_2026-05-18.md` (documento ejecutivo enviado a manager / dirección).

---

## Parte 1 — Material comercial

### 1.1 El problema (la historia real)

Un operario metió la mano donde no debía y tuvo un accidente grave. La planta tiene EPI, formación, señalización, procedimientos LOTO… y aun así el accidente ocurrió. **No por negligencia, por humanidad**: las personas se confían, se distraen, atajan, asumen que un compañero ha bloqueado la máquina cuando no.

La pregunta del cliente es: *"¿cómo evitamos que vuelva a pasar?"*

La respuesta tradicional es invertir en más procedimientos, más cartelería y más formación. Funciona a medias, porque el cuello de botella no es el conocimiento, es la **atención en tiempo real**.

### 1.2 Qué resuelve RTLS Safetrack

Un sistema de **localización en tiempo real de operarios** dentro de la planta industrial que:

1. **Detecta** la posición de cada trabajador continuamente (UWB / BLE / GPS según escenario)
2. **Cruza** esas posiciones con **zonas de seguridad** definidas por el cliente (peligrosas, restringidas, de aviso, seguras, informativas)
3. **Reacciona** con alertas, notificaciones y acciones diferenciadas por tipo de zona, contexto y operario
4. **Registra** todo para auditoría, mejora continua y respaldo legal

No reemplaza la seguridad funcional certificada (ISO 13849, IEC 62061). **Complementa**: añade una capa de monitorización + alerta + trazabilidad que la planta hoy no tiene.

### 1.3 La propuesta de valor en una frase

> *"Sabemos en cada momento dónde está cada persona, lo que permite a los equipos de seguridad y monitoreo reaccionar antes de que sea tarde."*

### 1.4 Para quién (perfil de cliente)

| Perfil | Por qué le interesa |
|---|---|
| **Director de planta / COO** | Reducción de incidentes, KPIs medibles, evidencia ante mutua/inspección |
| **Responsable de PRL / Seguridad** | Trazabilidad, cumplimiento, herramienta para identificar zonas problemáticas |
| **Responsable de IT/OT** | Integración limpia con sistemas existentes (DT, SCADA, ERP), Purdue/IEC 62443 friendly |
| **Comité de empresa / RRHH** | Punto sensible: hay que vender la trazabilidad como protección, no como vigilancia (ver §1.7) |

### 1.5 Diferenciadores frente a competencia

La mayoría de productos RTLS del mercado son **geofencing puro**: "el operario está dentro de la zona, salta una alerta". Eso ya existe.

**Safetrack añade dimensiones que un geofencing puro no tiene**:

1. **Acciones diferenciadas por tipo de zona** (catálogo completo en `docs/11`):
   - DANGER: sirena visual + sonora + escalado
   - RESTRICTED: control de acceso por permisos + log de auditoría
   - WARNING: aviso preventivo + métricas de reincidencia
   - SAFE: head-count en evacuación, fichaje implícito
   - INFO: documentación contextual al operario

2. **Modulación de severity por contexto** (no todas las entradas valen lo mismo):
   - Tránsito (<5s) vs estancia
   - Equipo en marcha vs parado vs LOTO activo
   - Operario de mantenimiento vs producción
   - Reincidente vs primera vez

3. **Notificaciones enriquecidas** — el receptor ve foto del operario, empresa, rol, tiempo dentro, vecinos cercanos, equipos en zona, en una sola pantalla. Sin abrir cinco pestañas.

4. **Multi-canal coordinado**:
   - In-app drawer (estilo NotificationCenter)
   - Banner toast top-right
   - Sirena modal centrada con audio para alertas críticas y SOS
   - Notificación nativa del SO cuando la pestaña está en background
   - Email
   - Haptic MQTT al wearable
   - *Próximamente*: app móvil de manager, SMS/llamadas vía gateway GSM, integración SCADA

5. **Sinergia con Digital Twin** (cuando el cliente ya tiene DT o lo va a tener):
   - Reutiliza identidad y jerarquía del DT
   - Cruza zonas con equipos reales y su estado de operación
   - Documentación contextual via gestor documental del DT
   - Replay temporal coordinado con sensores OT

6. **Foco comercial** — no es un producto técnico vendido a ingenieros, es una **herramienta de gestión de seguridad** vendida a directivos. La UX está pensada para vigilante / supervisor / dirección, no para programador.

### 1.6 Mapa de capacidades

#### Implementadas (PoC en vivo, demo-ables hoy)

**Visualización**
- Visor 3D de la planta con operarios en tiempo real (xeokit BIM Viewer)
- Visor 2D top-down sincronizado con la misma información
- Cubo de navegación 3D + árbol jerárquico del modelo + búsqueda de elementos
- Pildoras identificativas sobre cada operario con foto, nombre y empresa
- Halo coloreado por proximidad sobre cada operario
- Camera-follow del operario seleccionado con trazo del recorrido
- Doble click sobre operario → zoom a su posición
- Badge "ojo" sobre la pildora cuando un operario está siendo seguido

**Zonas y motor de seguridad**
- Editor visual de zonas (cubo / cilindro / polígono) sobre el modelo 3D, con gizmos para mover, rotar y escalar
- Snap al suelo del modelo BIM con margen automático
- Cinco tipos de zona configurables (DANGER / RESTRICTED / WARNING / SAFE / INFO) con severidad 1–5
- Motor de zonas con máquina de estados (fuera / aproximándose / dentro) y factor de proximidad continuo
- Modal de detalle de zona al hacer click sobre cualquier visor (2D o 3D)

**Alertas y SOS**
- AlertsDrawer con 4 tabs (No leídas / Alertas / Avisos / Todas), ordenación y badges
- AlertBanner flotante con toasts auto-dismiss
- Sirena modal centrada con audio para alertas críticas (DANGER) y para SOS
- Workflow SOS completo: botón de pánico → pendiente → confirmado por vigilante → ayuda en camino → operario a salvo, con auditoría completa
- SosDrawer lateral con SOS activos y acciones rápidas
- Política de notificación configurable por zona (operario, supervisor primario, supervisor de respaldo, manager de la empresa, equipo de seguridad)
- Notificaciones enriquecidas con foto del operario y contexto
- Notificaciones nativas del SO cuando la pestaña está en background
- Haptic MQTT al wearable (placeholder de hardware)
- Email a supervisor (preparado, pendiente del SMTP del cliente)

**Personas y empresas**
- Modelo de personas unificado: cada persona puede ser trabajador, supervisor o manager (o varios roles a la vez), con teléfono y email obligatorios para escalado
- Gestión de empresas (internas / contratistas / visitantes) con manager de contacto
- Asignación de tags a operarios
- Registro del último curso PRL con alerta automática de caducidad
- Soporte de supervisor primario + supervisor de respaldo por operario

**Ficha del trabajador**
- Página completa `/workers/:id` con sidebar de identidad + 4 pestañas
- Tab Resumen con KPIs de las últimas 24 h
- Tab Histórico con date picker, slider horario, ruta del día sobre canvas 2D y tabla de tiempo por zona
- Tab Perfil de riesgo con score compuesto 0–10 + chip (Bajo / Medio / Alto / Crítico) + desglose por componente y top zonas conflictivas
- Tab Incidentes con tabla auditable de las últimas alertas y SOS

**Dashboard y operativa**
- Dashboard de KPIs de seguridad: operarios en planta, alertas del día, SOS activos, MTTR, tags con batería baja, empresas presentes, operarios sin tag
- Top zonas conflictivas y top operarios con más incidencias
- Búsqueda global de operarios / tags / zonas

**Plataforma técnica**
- Autenticación OAuth2 con PKCE integrada con el auth-server del Digital Twin
- Sesión extendida con renovación automática de token y aviso pre-caducidad
- Comunicación cliente–servidor en tiempo real vía WebSocket STOMP
- Soporte multi-planta
- Internacionalización ES / EN
- Persistencia híbrida MySQL + MongoDB con **retención configurable** (default 7 días, ajustable)
- Arquitectura abierta: el broker MQTT es la frontera, lo que permite cambiar de proveedor de hardware sin reescribir la plataforma

#### Roadmap inmediato (próximos meses)
- Pantalla de control "guardia" dedicada a vigilancia (monitor grande de control room)
- Replay temporal (scrubber de las últimas N horas)
- Lista blanca de permisos y log exportable CSV/PDF (RESTRICTED)
- Acompañamiento obligatorio de visitantes en zonas RESTRICTED
- Cooldown educativo / detección de reincidencias
- Heatmap de incidentes
- Detector de evacuación / head-count
- Modulación de severity por permanencia
- CRUD admin de Companies y Supervisors desde la UI
- Pantalla de seguridad de entrada/salida (alta de operario + asignación de tag en portería)
- Histórico cruzado: ruta del operario + tag concreto que llevaba en ese momento
- Asignación rotatoria de tags (cuando hay menos tags que empleados)
- Auto-discovery de tags hardware con bandeja de aprobación

#### Roadmap medio plazo (depende del cliente y del DT)
- **Asistente IA privado local** (Ollama on-prem, 100% en infraestructura del cliente): consultas en lenguaje natural, resúmenes automáticos de actividad, generación de informes PRL — *los datos nunca salen de la planta*
- **Integración con módulo IA de Fatine en los tags** mediante contrato MQTT (caídas, posturas anómalas, inmovilidad detectadas localmente en el tag)
- Modulación de severity por estado de equipos (vía DT / OT-gateway)
- Modulación por rol del operario × estado de mantenimiento (LOTO activo, etc.)
- Geo-tagged docs (procedimientos PRL y fichas de seguridad por zona, del gestor documental del DT)
- App móvil de manager (Purdue / IEC 62443 friendly)
- SMS / llamadas externas vía gateway GSM on-premise
- Reportes de peligrosidad por empleado y por empresa contratista (exportables)
- Integración con cámaras ONVIF/RTSP asociadas a zonas (al saltar alerta, la cámara más cercana muestra el evento)
- Tags en vehículos (palas, retroexcavadoras, bobcats) con interacción operario ↔ vehículo
- Soporte de zonas anidadas / solapadas

#### Showcase (capacidades a nombrar pero no implementar en PoC)
- Lone worker alert avanzado
- Man-down detection vía IA en el tag
- Evidencia automática para mutua
- Coordinación con AGVs / puentes grúa
- Bloqueo lógico SCADA / sala de control

### 1.7 Argumentos económicos / ROI

> El cliente tipo no compra "tecnología guay". Compra una de estas tres cosas:

| Argumento | Cómo se cuantifica |
|---|---|
| **Evitar el coste de un accidente grave** | Coste medio de un accidente con baja: 30-200 k€ entre baja, sustituto, sanción, prima de seguro, juicio. Un solo accidente evitado paga el sistema |
| **Cumplimiento y auditoría** | Inspección de Trabajo / mutua / ISO. Tener histórico digital + log exportable reduce horas de papeleo y multas |
| **Optimización operativa** | Heatmap revela zonas con flujos peligrosos → rediseño de circulación. Ahorro de tiempo en formación dirigida solo a quienes lo necesitan |

### 1.8 GDPR y aceptación social

Punto delicado. Hay que vender bien, no esconder:

- El sistema **no es vigilancia individual continua** — es seguridad por zonas
- Se localiza tags, no personas (un operario puede no llevar tag fuera de su turno)
- Datos personales segregados con permisos granulares (RRHH no ve seguridad, seguridad no ve RRHH)
- Política de retención: posiciones brutas pasados N días se anonimizan (solo agregados)
- Consentimiento + información obligatorios. El sistema **no funciona "a escondidas"**
- Comité de empresa debe estar informado e idealmente integrado en la decisión

Detalles técnicos en `docs/09_GDPR_AND_SECURITY.md`.

### 1.9 Modelo de despliegue

| Capa | Opción A (cliente nuevo) | Opción B (cliente DT) |
|---|---|---|
| Hardware (anclas + tags) | Proveedor partner | Igual |
| Broker MQTT | Mosquitto / EMQX on-prem | Igual |
| Backend | `positioning-api` Spring Boot | Idem (encaja como módulo del DT) |
| Frontend | `positioning-frontend` React | Embebido en DT (futuro) |
| Auth | Auth-server propio del PoC | Reutiliza auth-server del DT |
| BD | MySQL `dt_safetrack` + Mongo `dt_safetrack_metrics` | Idem |
| Red | LAN industrial, Purdue L2/L3 | Idem |

Todo on-prem. **Sin nube por defecto** (industria es muy sensible). Si el cliente quiere réplica nube para reportes ejecutivos, opcional.

---

## Parte 2 — Guion de demo paso a paso

> **Duración**: 20-25 minutos efectivos + 10 de Q&A. Si tienes solo 10 min, salta los actos 3-4.

### 2.0 Pre-demo (15 min antes)

- [ ] Ambos PCs encendidos: el de la demo + uno secundario para "vigilante" (opcional pero impacta)
- [ ] Stack arrancado y verde:
  ```
  cd C:\PACO\workspaces\digital-twin\dt-infra && docker compose up -d
  cd C:\PACO\workspaces\rtls-safetrack\infra && docker compose up -d
  ```
- [ ] Verificar puertos: 9000 (auth), 8090 (api), 5180 (front), 1884 (mqtt)
- [ ] Login probado en `http://localhost:5180`
- [ ] Permiso de notificaciones del navegador concedido (dispara en /dashboard)
- [ ] Click en algún sitio de la app para desbloquear el AudioContext (la sirena no sonará si no)
- [ ] Datos de demo cargados: al menos 3-5 operarios con foto, 3-5 tags asignados, 2-3 zonas (1 DANGER, 1 RESTRICTED, 1 WARNING)
- [ ] Simulador MQTT listo:
  ```
  cd C:\PACO\workspaces\rtls-safetrack\infra && docker compose --profile sim up -d simulator
  ```
- [ ] Pestaña en `/live` con el modelo ya cargado (gracias al cache + keep-alive, las navegaciones serán instantáneas)
- [ ] Si vas a hacer la "fase background", una segunda pestaña con cualquier otra web abierta

### 2.1 Acto 0 — Apertura (1-2 min)

> **Tono**: humano, no técnico. Empezamos con el problema, no con el producto.

**Frase de apertura**:
> *"Antes de enseñaros nada, una pregunta: ¿cuántos accidentes graves habéis tenido en los últimos 5 años? ¿Cuántos casi-accidentes? Y de los que sí pasaron, ¿cuántos creéis que se podrían haber evitado si alguien hubiera visto al operario acercarse a la zona crítica un minuto antes?"*

Deja que respondan. Esa pausa es la que vende.

**Transición**:
> *"Lo que voy a enseñaros no reemplaza nada de lo que ya tenéis — vuestros LOTO, vuestra señalización, vuestra formación. Lo que hace es darle ojos al sistema en tiempo real. Es la diferencia entre tener un seguro que te paga después y tener una alarma que te avisa antes."*

### 2.2 Acto 1 — Visualización en vivo (3-5 min)

**Pantalla**: `/live` (3D)

> *"Esto que veis es vuestra planta. El modelo 3D es exactamente el mismo que tenéis en BIM o en el Digital Twin. Y lo que se mueve aquí dentro son operarios reales detectados por las anclas UWB en tiempo real."*

**Cosas a mostrar (en este orden)**:

1. **Pildoras sobre operarios**: nombre + empresa + chip de tipo (INTERNAL verde / CONTRACTOR azul / VISITOR púrpura)
   > *"Cada operario tiene su tag. Vemos quién es, de qué empresa, qué cargo, todo en vivo. No estamos viendo personas en abstracto — sabemos quién es cada uno."*

2. **Click en una pildora** → se abre `WorkerInfoPanel` con foto + datos completos
   > *"Toda la ficha disponible al instante. Foto, empresa, supervisor, teléfono (clicable), email, fecha de alta, puesto en planta, batería del tag, coordenadas exactas. Si el operario tiene la formación PRL caducada, lo veo en rojo aquí mismo."*

   **Doble click sobre el operario** → la cámara hace zoom sobre él sin enganchar follow.

3. **Botón "Seguir en 3D"** → camera follow
   > *"Y si hay que seguir a alguien — porque está haciendo una operación delicada o porque ha entrado en un sitio raro — la cámara lo persigue. Y mientras, podéis seguir orbitando, haciendo zoom, lo que sea."*

4. **Zonas pintadas en 3D** (cubos / cilindros con color por tipo)
   > *"Estas zonas las define el responsable de seguridad. Cualquiera. No hace falta CAD, no hace falta programador. Os enseño en 30 segundos…"*
   > [breve salto a `/zones/editor`, mostrar drag, snap-to-floor, save] → vuelve a `/live`

5. **Halo coloreado** en operarios que se acercan a una zona
   > *"Y aquí ya estamos viendo la primera capa de seguridad: este operario se está acercando a la zona crítica. El halo se va poniendo rojo según se aproxima. Esto ya por sí solo cambia la conversación: ya no es 'entró o no entró', es 'estamos viendo cómo se acerca'."*

### 2.3 Acto 2 — La alerta crítica (5-7 min) ⭐ *el momento clave*

> **Este es el "aha moment". No tengas prisa.**

**Setup**: el simulador va a meter un operario simulado en una zona DANGER. Antes de hacerlo:

> *"Ahora viene lo importante. Imaginad que el operario, distraído o por las prisas, se mete en la zona de la prensa hidráulica. La que está señalizada, la que tiene LOTO, la que el procedimiento dice que no se entra sin autorización. Pero entra. Mirad lo que pasa."*

**Disparas la alerta** (con el simulador o moviendo manualmente un tag).

**Lo que el cliente ve, secuenciado**:

1. **Pildora del operario se vuelve roja** (visor 3D)
2. **Toast rojo** desliza desde la derecha (AlertBanner)
3. **Modal centrado rojo pulsante con sirena de audio** (CriticalSiren) sobre un fondo atenuado
4. Si tienes la pestaña secundaria abierta de "vigilante" → **notificación nativa de Windows** allí

> *"Mirad lo que pasa: el operario sigue donde está, pero el sistema ya sabe. La pildora roja, el toast con su foto y empresa, la sirena pulsando en el centro de la pantalla — el vigilante NO puede ignorar esto. Y si estaba en otra pestaña, la notificación del sistema operativo le suena en su Windows. No depende de que esté mirando la app."*

**Mostrar el contenido del modal de sirena**:
> *"Fijaos en la información que llega: foto, nombre, empresa, rol, en qué zona está, hora exacta de entrada. Todo en una pantalla. El vigilante no tiene que abrir cinco sistemas para entender qué pasa."*

**Click en "Ver en 3D"** → el sistema te lleva a Live, foco al operario, modo follow activado, panel abierto.

> *"Y si el vigilante quiere ver dónde está exactamente, un click. Le sigue la cámara, ve el contexto, todo."*

**Click en "ACEPTAR Y SILENCIAR"** → siren desaparece, alerta queda en estado "Confirmada".

> *"Una vez confirmado, el sistema deja de gritar pero la alerta sigue activa hasta que el operario salga. Y todo queda registrado: hora de entrada, hora de confirmación por el vigilante, hora de salida. Si mañana hay una inspección o un incidente, esto vale oro."*

---

**🆘 Escena alternativa — el botón de pánico (SOS)** (2-3 min, intercalar aquí o como escena propia)

> *"Y ahora imaginad que el operario, además, pulsa el botón de pánico de su tag. Algo le ha pasado. No es que el sistema lo detecte por proximidad, es que él pide ayuda activamente."*

**Disparas un SOS** desde el panel de un operario (botón "Disparar SOS demo") o desde el simulador.

**Lo que pasa**:
1. **Sirena SOS distinta** (modal rojo más intenso, audio diferente) — *el vigilante distingue al instante si es entrada en zona o petición activa de auxilio*
2. **Mensaje claro**: "El operario ha pulsado el botón de pánico"
3. **Datos enriquecidos**: foto + nombre + empresa + teléfono **clicable** ("llamar ya")
4. **Tres acciones**: *Ayuda en camino* / *Operario a salvo* / *Falso positivo*

> *"Aquí el workflow es distinto. No basta con confirmar — hay que cerrar el ciclo. El vigilante marca 'ayuda en camino' cuando lanza al equipo. Cuando el equipo llega y la situación está cerrada, marca 'operario a salvo'. Si fue un pulsado accidental, 'falso positivo'. Todo queda registrado: cuándo se pulsó, cuándo se confirmó, cuándo llegó la ayuda, quién hizo qué."*

**Mostrar el SosDrawer** (icono SOS del AppBar):
> *"Y si hay varios SOS simultáneos, el responsable los ve a todos en este panel, con sus estados y sus tiempos."*

### 2.4 Acto 3 — Gestión y trazabilidad (3-4 min)

**Pantalla**: AlertsDrawer (icono de campana, top-right)

> *"Aquí es donde el responsable de seguridad ve el día a día."*

**Mostrar**:
1. **4 tabs**: No leídas / Alertas (DANGER+RESTRICTED) / Avisos (WARNING+INFO) / Todas — con badges de count
2. **Sort**: Recientes vs Severidad
3. **Item**: foto + chips estado (Activa/Confirmada/Resuelta) + datos enriquecidos
4. **Botón "Ver en 3D"** + ACK directo

> *"Cualquier responsable puede entrar aquí, filtrar por tipo, ordenar por severidad, ver el histórico. Y de cada alerta tiene la trazabilidad completa: quién entró, dónde, cuándo, cuánto tiempo, quién confirmó."*

**Pantalla**: `/workers` (lista de workers)

5. **Botón "Localizar en 3D"** en cada fila
   > *"Si quiero ver dónde está un operario concreto, lo busco aquí y un click. La app se va a Live, lo enfoca, lo sigue. Útil para preguntar 'oye, ¿dónde está fulanito?' sin tener que buscarlo por radio."*

**Pantalla**: GlobalSearch en el AppBar

6. Buscar un operario por nombre / un tag por serial / una zona por código
   > *"Buscador global. Funciona con todo: operarios, tags, zonas. Click → me lleva al sitio correspondiente."*

### 2.4-bis Acto 3-bis — La ficha del trabajador (3-4 min) ⭐ *gancho fuerte para PRL y RRHH*

> **Cuándo usarlo**: si tienes en sala a alguien de PRL, Recursos Humanos o dirección. Si la audiencia es solo IT/OT, puedes saltártelo.

**Pantalla**: desde la lista de Workers, botón "Ver ficha" sobre un operario con histórico interesante.

**Cabecera (sidebar)**:
> *"Esta es la ficha completa de un operario. A la izquierda lo importante para localizarlo o llamarlo: foto, empresa, su rol, teléfono clicable, email, supervisor primario y de respaldo, fecha de alta."*

**Resaltar el chip rojo "PRL caducado"** (si el operario lo tiene):
> *"Y aquí, en rojo, una señal que vale oro para PRL: este operario tiene la formación de prevención caducada hace X días. El sistema lo marca automáticamente. Cuando llega Inspección de Trabajo, no hay que rebuscar en hojas de cálculo: está aquí."*

**Tab "Resumen"**:
> *"Las últimas 24 horas en un golpe de vista. Cuántas alertas de zona DANGER ha disparado, cuántas RESTRICTED, cuánto tiempo ha pasado en zonas peligrosas, si ha pulsado el botón de pánico. Y el score de riesgo a 30 días, que ahora os enseño en detalle."*

**Tab "Histórico"** — la joya visual:
> *"Aquí podemos reconstruir cualquier día. Elijo una fecha — pongamos ayer. El sistema me dibuja sobre un plano top-down la ruta que hizo este operario, hora a hora. En azul claro empieza la jornada, en azul oscuro termina. Los puntos rojos son cada vez que entró en una zona peligrosa o restringida."*

(Si tienes datos, mueves el slider horario para mostrar un rango concreto.)

> *"Y debajo, una tabla con cuánto tiempo total pasó en cada zona. Útil para detectar patrones: 'oye, este operario pasa media hora al día en una zona donde sólo debería pasar dos minutos'."*

**Tab "Perfil de riesgo"** — el activo comercial:
> *"Aquí es donde el sistema deja de ser un visor de posiciones y se convierte en una herramienta de gestión. Score de riesgo de 0 a 10. Este operario tiene un 6,4 — nivel ALTO. ¿Por qué? El desglose lo explica: 14 entradas en zonas DANGER (×5 puntos cada una), 3 SOS en el último mes, 47 minutos acumulados dentro de zonas peligrosas. Y como ha entrado más de tres veces a la misma zona, se aplica un factor de reincidencia."*

> *"Esto no es un número que me invento. Es una métrica reproducible, comparable entre operarios y empresas. Cuando dirección os pregunte 'oye, ¿qué tal nuestra contrata X?', tenéis un número con qué responder. Cuando PRL os pregunte 'a quién daríamos formación de refresco?', tenéis ranking."*

**Tab "Incidentes"**:
> *"Y el log completo, exportable, listo para cualquier auditoría. Cada entrada en zona, cada SOS, cada confirmación. No hay forma de discutir lo que pasó."*

### 2.5 Acto 4 — Capacidades futuras (2-3 min) — opcional, según tiempo y audiencia

> **Importante**: aclarar qué está implementado y qué es roadmap. Honestidad vende.

> *"Lo que habéis visto está vivo y funciona. Estas son las siguientes piezas que están en desarrollo o planificadas para vuestro caso concreto."*

Mencionar 4-5 capacidades del roadmap visible (sin entrar en detalle):

- **Pantalla de vigilante dedicada** — todas las alertas, foto, ubicación, ACK/Llamar/Falsa alarma, pensada para monitor grande de sala de control
- **Replay temporal** — *"Si pasa un incidente a las 14:23, puedo rebobinar la planta hasta ese momento exacto y ver qué hizo cada uno los 10 minutos previos. Para investigación post-incidente y para formación interna no tiene precio."*
- **Detector de evacuación** — *"En una emergencia real, saber cuántos quedan dentro y dónde estaban es lo que salva vidas. Llegamos al punto de encuentro, vemos: 47 de 52, faltan 5 — y vemos dónde estaban hace 30 segundos."*
- **Modulación inteligente de severity** — *"No es lo mismo un operario de mantenimiento entrando en una máquina parada con LOTO que un operario de producción entrando en la misma máquina en marcha. Lo segundo es alerta máxima, lo primero es trabajo planificado. El sistema lo distingue cruzando con los partes."*
- **Heatmap de incidentes y reportes por contrata** — *"Cada mes os llega un informe: estas son vuestras 3 zonas más conflictivas, este operario reincide, esta empresa contratista concentra el 60% de las alertas. Datos para negociar con contratas, no opiniones."*
- **Asistente IA privado local** — *"Imaginaos un chat dentro de la app donde escribís 'enséñame todas las entradas en la zona del reactor de la semana pasada' o 'genera el informe PRL del mes' y el sistema os contesta. Funciona con un modelo de IA corriendo en una máquina dentro de vuestra fábrica, sin enviar nada al cloud. Las localizaciones de vuestros trabajadores no salen de aquí dentro."*

**Cierre del acto**:
> *"Y luego están las cosas que están en estudio según vuestras necesidades concretas: integración con vuestras cámaras existentes, tags para vehículos como las palas y las carretillas, app móvil para mánagers, integración con vuestro SCADA, geo-localización de documentación de seguridad por zona… Os preparo un roadmap específico cuando tengamos clara vuestra prioridad."*

### 2.6 Acto 5 — Cierre (3-5 min)

**Resumen rápido en una transparencia**:

> *"Resumiendo, lo que os llevarías:*
> *— Visualización en tiempo real de quién está dónde*
> *— Alertas multicanal cuando algo pasa, imposibles de ignorar*
> *— Trazabilidad completa para auditoría y mejora continua*
> *— Integración limpia con vuestros sistemas existentes*
> *— On-prem, dentro de vuestra red, sin cloud por defecto*
> *— Y un roadmap específico para vuestras prioridades, no para las nuestras."*

**Pregunta de cierre** (la más importante, la más difícil):

> *"De lo que habéis visto, ¿qué es lo que más os impactaría a vosotros — no en general, en VUESTRA planta concreta?"*

Esa pregunta abre el siguiente paso: la propuesta personalizada.

### 2.7 Q&A — objeciones típicas y respuestas preparadas

| Objeción | Respuesta |
|---|---|
| *"Y si los operarios se quitan el tag…"* | "Buen punto. Hay tres niveles: el procedimiento dice que deben llevarlo (consecuencia disciplinaria), el sistema detecta tags ausentes en zonas de operación (alerta de incumplimiento), y los wearables modernos detectan que se les quita (acelerómetro). Pero al final es como el casco: no es perfecto, pero el 95% lo lleva, y el 95% es muchísima mejora frente al 0% actual." |
| *"¿Y la privacidad? El comité de empresa…"* | "Punto sensible. La clave es vender la trazabilidad como protección del trabajador, no como vigilancia. Cumplimos GDPR completo, hay políticas de retención, segregación de datos. Y os recomendamos involucrar al comité desde el principio — los que se oponen son los que se enteran tarde." |
| *"¿Qué precisión tiene?"* | "UWB típicamente 10-30 cm. BLE 2-3 m. GPS solo exteriores. Para zonas peligrosas con buffer de 1-2 metros, UWB es lo nuestro. Buffer configurable por zona — no es lo mismo una zona de 50m² que una de 4m²." |
| *"¿Y si se cae la red? ¿O el broker?"* | "El broker es Mosquitto/EMQX, mismo software de millones de plantas industriales. Alta disponibilidad nativa. Si se cae la red de anclas, los tags lo detectan y avisan local (haptic). Si se cae el backend, las alarmas físicas siguen funcionando — esto es complemento, no reemplazo." |
| *"¿Cuánto cuesta?"* | "Depende del alcance. Hardware (anclas + tags) ronda los X-Y k€ según m². Licencia software es Z€/operario/año. Implantación, según zonas y formación, W días. Os preparo presupuesto preciso cuando definamos el scope." |
| *"¿Cuánto tarda en estar operativo?"* | "Pilotaje en una zona crítica: 4-6 semanas desde luz verde. Despliegue completo: 3-6 meses según tamaño. Os recomendamos arrancar por la zona de mayor riesgo, validar, y extender." |
| *"¿No es esto lo mismo que [competidor X]?"* | "El geofencing puro lo hace cualquiera. La diferencia es las acciones diferenciadas por contexto, la trazabilidad enriquecida y la integración con el Digital Twin si lo tenéis. Si lo que necesitáis es solo 'avisar cuando entra', sí, hay opciones más baratas. Si necesitáis un sistema vivo que aporte gestión de seguridad, este es el sitio." |

---

## Parte 3 — Material de soporte

### 3.1 Checklist técnico de la demo

```
[ ] Docker Desktop arrancado
[ ] dt-infra (auth, mysql, mongo) up
[ ] rtls-safetrack (mosquitto, api, frontend) up
[ ] Login OK en /dashboard
[ ] Modelo XKT cargado en /live (verificar consola: [3D] Layer "ALL" loaded)
[ ] AlertsDrawer abre sin errores
[ ] Permiso de notificaciones del SO concedido
[ ] AudioContext desbloqueado (1 click en cualquier sitio)
[ ] Simulador up (--profile sim)
[ ] Workers de demo con foto cargada (no avatar genérico)
[ ] Zonas DANGER + RESTRICTED + WARNING creadas y visibles
[ ] Tags asignados a workers de demo
[ ] Pestaña secundaria del navegador abierta (para mostrar notification SO)
```

### 3.2 Recetas de simulación

> Recetas para disparar cada tipo de evento en la demo. Ajustar coordenadas según el modelo concreto.

**ENTER en zona DANGER**:
```bash
mosquitto_pub -h localhost -p 1884 -t "sim/v1/positions" -m '{"tag":"sim-001","x":-2464980,"y":120,"z":32235100,"ts":"2026-05-07T15:30:00Z"}'
```

**EXIT** (sale de la zona): repetir con coords fuera del polígono.

**Encadenar varios eventos** (operario entra, vagabundea, sale):
- Ver `simulator/scripts/demo-secuencia.sh` (TODO: crear)

### 3.3 Troubleshooting

| Síntoma | Causa probable | Solución |
|---|---|---|
| Modelo 3D no carga, spinner infinito | Backend no devuelve plantView, o XKT no está en `/public/models/` | Verificar `/v1/plant-views?plantId=...` en DevTools. Si no hay plant-view, crear una en backend o en BD |
| AlertsDrawer vacío aunque hay eventos | WebSocket no conectado | Mirar dot rojo/verde en header del drawer. Reconectar reload. Verificar que `/api/ws` proxy en nginx funciona |
| Sirena no suena pero overlay sí aparece | AudioContext bloqueado por autoplay policy | Hacer click en cualquier sitio de la app antes de la demo (gesto desbloquea AudioContext) |
| Notificación nativa del SO no salta | Permiso no concedido / pestaña en foreground | Verificar `Notification.permission === 'granted'` en consola. La notif solo dispara si la pestaña está en background |
| Camera follow se desactiva sola | Bug ya corregido (delta-based) | Si vuelve a pasar, recargar la app — keep-alive puede estar en estado raro |
| El editor de zonas 3D no pinta nada | Bug ya corregido (StrictMode + cache async) | Si vuelve a pasar, hard reload — el lock del cache puede haberse quedado |

### 3.4 Datos de demo recomendados (por crear)

Workers de demo con foto:
- Juan García López (INTERNAL · Mantenimiento)
- María Ruiz Pérez (INTERNAL · Producción)
- Carlos Vega Soto (CONTRACTOR · Acme Industrial · Soldador)
- Pedro Molina (VISITOR · Auditor mutua)
- Ana Torres (INTERNAL · Supervisora)

Zonas de demo:
- **Z-PRENSA-01** (DANGER, severity 5) — la zona estrella, donde dispararemos la alerta principal
- **Z-SERVERS** (RESTRICTED, severity 3) — para mostrar lista blanca de permisos
- **Z-GRUA-N** (WARNING, severity 2) — para mostrar avisos preventivos
- **Z-COMEDOR** (SAFE, severity 1) — para mostrar head-count
- **Z-MANTTO-B04** (INFO, severity 1) — para mostrar docs contextuales (cuando esté)

---

## Apéndice A — Mensajes clave que NO hay que olvidar

1. *"Esto no reemplaza la seguridad funcional certificada. Complementa."*
2. *"No vendemos vigilancia, vendemos protección con trazabilidad."*
3. *"Lo que habéis visto está vivo. Lo que está en roadmap es roadmap, y lo decimos claro."*
4. *"On-prem, dentro de vuestra red. No hay cloud salvo que vosotros lo pidáis."*
5. *"El sistema escala desde una zona piloto hasta la planta entera. No hay que comprar todo de golpe."*

## Apéndice B — Material de apoyo a producir

> Lista de assets a generar para reforzar la demo. **Pendiente**.

- [ ] Folleto comercial PDF de 2 páginas (resumen + screenshots)
- [ ] Vídeo demo grabado de 3 minutos (backup si falla la demo en vivo)
- [ ] Slide deck de 8-10 transparencias (para reuniones comerciales formales)
- [ ] One-pager por sector (química, energía, automoción, alimentaria)
- [ ] Casos de uso documentados con ROI estimado
- [ ] Comparativa frente a competencia (anonimizada)
