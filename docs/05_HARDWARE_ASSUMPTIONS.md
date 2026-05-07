# 05. Asunciones sobre el hardware

El hardware no lo diseñamos ni controlamos nosotros — lo hace el cliente o un tercero. Este documento captura **qué asumimos** y **qué hay que confirmar** para no quedar bloqueados.

## Lo que nos contó Paco (reunión previa)

- Sistema basado en **placas ESP32** y **tags**.
- Mencionaron "antenas" (= anchors).
- Precisión **centimétrica**.
- Cada trabajador llevará un tag.
- Los datos llegan a una **cola MQTT** y nosotros los consumimos desde ahí.
- El cliente hace "todo desde hardware al software", a Paco le toca el software.

## Nuestra apuesta sobre la tecnología

### Tecnología de posicionamiento: UWB (Ultra-Wideband)

- Es la **única** tecnología barata-media que da centímetros de precisión indoor.
- BLE (iBeacon, AoA) da 1-2 m.
- WiFi FTM da 1-2 m.
- Cámaras / LiDAR son demasiado caras para cubrir planta grande.

### Chip UWB

- **Qorvo DW3000** es lo más probable (generación nueva, compatible con Apple Nearby Interaction, más barato que el DW1000 antiguo).
- DW1000 todavía en circulación en proyectos heredados.

### Placa ESP32 que probablemente están usando

Por orden de probabilidad:
1. **Makerfabs ESP32 UWB Pro (DW3000)** — ~30-40€, muy popular DIY.
2. **Makerfabs ESP32 UWB (DW1000)** — ~25-30€, versión antigua.
3. **MaUWB DW3000** (variante china) — ~20-25€.
4. **Heltec HTIT-UWB** — similar.
5. Módulo custom PCB (si tienen ingeniería electrónica propia, menos probable).

### Esquema típico

```
Tag (worker)                    Anchor (fijo)             Concentrador HW
┌────────────────┐           ┌────────────────┐            ┌────────────┐
│ ESP32-UWB      │ ranging   │ ESP32-UWB      │            │ ESP32 WiFi │
│ + bateria LiPo │◄─────────▶│ + fuente fija  │───WiFi────►│ o Linux    │
│ + buzzer/LED   │ (50-200m) │ o PoE          │            │            │
│ + botón        │           └────────────────┘            │ publish    │
│                │                                          │ MQTT       │
│                │           Instalado en techo             └─────┬──────┘
└────────────────┘           3-4 mín por zona                     │
   En badge/correa            Trilateración                       ▼
                                                          ┌──────────────┐
                                                          │ MQTT BROKER  │ ◄─ frontera
                                                          │ (nuestro,    │
                                                          │  on-premise) │
                                                          └──────────────┘

Todo lo de la izquierda del broker es del cliente; nosotros nos suscribimos.

Tags simultáneos: 20-30 para piloto, 50-100 a escalar.
Refresh rate: 1-10 Hz. Para PoC 1 Hz.
Precisión real en planta (con metal, multipath): 30-80 cm realista,
  no los "10 cm de laboratorio" que suelen prometer los vendors.
```

### Algoritmo de posicionamiento (dos opciones)

1. **TWR (Two-Way Ranging)**: cada tag pregunta a cada anchor su distancia, uno a uno. El tag o un servidor trilatera.
   - **Pros**: fácil de implementar, librerías DIY (thotro DW1000 Arduino).
   - **Contras**: escala mal. Con 30 tags ya se nota.
   - **Apuesta**: si es DIY, probablemente esto.

2. **TDoA (Time Difference of Arrival)**: tag emite un ping, anchors sincronizados miden diferencia de tiempo de llegada.
   - **Pros**: escala a cientos de tags, menos consumo de batería.
   - **Contras**: requiere sincronización de anchors (cable coax o protocolo custom). Más complejo DIY.
   - **Apuesta**: si hay ingeniería seria detrás, esto.

## Cómo suelen ser los tags físicamente

Paco preguntó cómo son. Dos familias:

### Comerciales (llave en mano)

- Tamaño mechero (4×6 cm) o tarjeta de crédito (8.5×5.4 cm).
- Peso 20-40 g.
- Batería LiPo interna, **6 meses a 2 años** sin recarga.
- Certificación IP65/IP67 (agua, polvo), ATEX si hay zonas explosivas.
- LED + buzzer + motor vibrador + botón SOS.
- Forma de llevar: clip chaleco, correa cuello, pinza casco.
- Ejemplos y precios:
  - Pozyx Tag: ~80€/u
  - Sewio Tag: ~120€/u
  - Ubisense: ~150€/u
  - Qorvo MDEK1001 (dev kit): ~60€/u, no industrial

### DIY sobre ESP32-UWB

- Tamaño 8-12 cm (mucho más grande).
- Peso 80-150 g con batería.
- Batería LiPo 1000-3000 mAh → **1-3 días** con 1Hz (vs meses en comerciales). ESP32 consume mucho.
- Estética "prototipo": caja impresa 3D, cables visibles.
- LED + buzzer + motor + botón → todo conectable al ESP32.
- Coste: ~40-50€/u (si hacen PCB custom, ~20-30€ a volumen).
- **Ideal para piloto**, no ideal para producción a gran escala por autonomía y comodidad.

## Anchors (las "antenas" que mencionaron)

- Puntos fijos instalados en techo/paredes.
- Alimentación: PoE (ideal) o fuente cableada.
- Posición conocida y calibrada (coordenadas en sistema del modelo 3D).
- Cantidad: **3-4 mínimo por zona para trilateración 2D**, 4+ para 3D con altura.
- Para planta grande: ~1 anchor cada 10-20 m de separación según line-of-sight.
- Planta de 5000 m² → ~25-40 anchors.
- Instalación: esto es lo caro (cableado, altura, PoE switches).

## Outdoor (fuera del alcance PoC)

- UWB outdoor funciona pero anchors necesitan IP67 → más caros.
- Alternativa: GPS de móvil corporativo publicando al broker en su propio formato; un nuevo `MobileGpsAdapter` lo normalizaría al modelo interno.
- Para PoC no nos metemos.

## Lo que hay que confirmar con el cliente (preguntas críticas)

Ver detalle en `07_OPEN_QUESTIONS.md`.

Resumen corto:

1. ¿Chip UWB DW1000 o DW3000?
2. ¿TWR o TDoA?
3. **Sample real del payload MQTT que emitirán.** Oro puro esta pregunta.
4. ¿Los anchors estarán calibrados en sistema de coords del modelo IFC, o tendrán su origen propio?
5. ¿Refresh rate por tag (Hz)?
6. ¿Precisión prometida por el fabricante vs precisión real en planta industrial?
7. ¿Tags personales permanentes o pool compartido (kiosko)?
8. ¿Ya tienen prototipo funcionando o solo el plan?

## Riesgos si nuestras asunciones fallan

| Asunción falla | Impacto en software |
|----------------|---------------------|
| No es UWB sino BLE (precisión sub-metro) | Zonas con buffer mayor, posible menor valor del sistema. Código no cambia. |
| Publican distancias crudas, no coordenadas | Metemos solver (trilateración mínimos cuadrados + Kalman) dentro del adapter del proveedor en `positioning-api`. 1-2 semanas extra. |
| Coords en sistema propio, no IFC | Calibrar matriz afín en `pos_plant_settings.positioning_transform_matrix`, aplicada por el adapter. 2-3 días de trabajo (una vez). |
| Refresh rate 10Hz en vez de 1Hz | MongoDB escalará, ajustamos TTL. |
| No hay haptic en los tags | Eliminamos canal `HAPTIC_MQTT`, solo alertas al frontend/email. |
| Formato binario en vez de JSON | El adapter del proveedor decodifica. Más trabajo pero aislado. |

El punto es que nuestra arquitectura (HW/simulador → broker MQTT como frontera → `positioning-api` con adapter por proveedor + modelo interno) **nos protege de casi cualquier cambio en el hardware**. Por eso esa capa de adapters es crítica desde el día 0.
