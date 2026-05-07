# 00. Overview

## Qué es RTLS Safetrack

Sistema de **localización en tiempo real (RTLS)** para trabajadores dentro de plantas industriales. Permite:

- Saber dónde está cada trabajador en todo momento, con precisión centimétrica (objetivo), sobre planos 2D y modelos 3D.
- Detectar cuando un trabajador entra en una zona peligrosa o restringida.
- Lanzar alertas en cascada: háptica al trabajador (vibración del tag), notificaciones al equipo de seguridad, registro de eventos.
- Disparar acciones complementarias en coordinación con otros sistemas (parada de máquinas mediante capa safety certificada separada — este sistema NO es esa capa).

## Por qué existe

Cliente de LCI ha pedido implantar un sistema de seguridad activa en sus plantas. Hardware (tags, anchors, ESP32) lo fabrica el cliente o un tercero; **a Paco le han encargado el software**: consumir los datos del sistema de posicionamiento vía MQTT, visualizarlos y actuar en consecuencia.

## Contexto comercial (importante)

**No hay proyecto aprobado todavía.** La PoC tiene un objetivo doble:

1. **Validar técnicamente** la idea (que se puede hacer y cómo).
2. **Demo de venta**: enseñársela al cliente para que apruebe presupuesto.

Si la demo no convence al cliente, **se pierde el proyecto** y lo busca fuera. Por eso:

- Prioridad a lo que entre por los ojos: visor 3D, alertas visuales, look & feel del DT.
- Integración futura con el Digital Twin como **anzuelo comercial** ("si os mola, esto se mete en el DT y tenéis todo unificado").
- Cobertura técnica suficiente para que la demo cuente la historia completa, pero sin sobre-ingeniar.

Ver detalle de prioridades pivotadas en `06_POC_PLAN.md`.

## Estado actual (2026-04-21)

- Fase de **análisis y diseño**. No se ha escrito ni una línea de código.
- Hay documento de arquitectura y decisiones consensuadas con Paco.
- Pendiente reunión con cliente (noche del 2026-04-21) para confirmar asunciones sobre hardware.
- La PoC prevé 4-5 semanas de trabajo (ver `06_POC_PLAN.md`).

## Relación con el Digital Twin

Este proyecto nace **paralelo** al Digital Twin (`C:\PACO\workspaces\digital-twin`) con estas reglas:

- Comparte **auth-server** y stack técnico.
- Duplica **bases de datos** y **backend/frontend** para no contaminar el DT mientras la PoC está inestable.
- Se diseña pensando en que **se integrará como módulo del DT** una vez validado. Ver `08_INTEGRATION_WITH_DT.md`.

## Alcance de la PoC

| Sí entra en PoC | NO entra en PoC |
|-----------------|-----------------|
| Ingestión MQTT con adapter por proveedor | Integración con hardware real (usaremos simulador) |
| Visor 3D con avatares en tiempo real | Paradas automáticas de máquinas |
| Visor 2D con plano de planta | Outdoor / GPS |
| CRUD workers/tags/zones | App móvil / kiosco de binding tag↔worker |
| Editor de zonas 3D | Multi-planta (1 planta piloto) |
| Motor de proximidad + alertas | Analítica histórica avanzada |
| Comando háptico al tag (vía MQTT) | Integración safety PLC |
| GDPR básico (TTL, roles, audit) | Certificación ISO 13849 |

## Quiénes son los usuarios

- **Equipo de seguridad (SAFETY_MANAGER)**: monitoriza en tiempo real, atiende alertas.
- **Managers de planta (PLANT_MANAGER)**: consulta estados, KPIs, trazabilidad de incidentes.
- **Administradores (ADMIN)**: CRUD de workers/tags/zones, configuración.
- **Trabajadores**: llevan tag, no interactúan con software (reciben vibración/luz en el tag).

## Cronograma estimado

- **2026-04-21**: fin de fase de diseño.
- **2026-04-22 a 2026-04-26**: Fase 0 (scaffolding).
- **2026-04-27 a 2026-05-31**: Fases 1-5 de PoC.
- **Demo interna**: finales de mayo 2026.
- **Integración al DT**: después de PoC validada, Q3 2026 probable.
