# 09. GDPR, privacidad y seguridad

Este documento recoge las decisiones de privacidad y seguridad del sistema. Incluso en PoC, implementamos las medidas básicas porque añadirlas después es más caro.

## Contexto legal (Europa / España)

Trackear la ubicación de empleados con precisión centimétrica es **tratamiento de datos personales** (art. 4.1 RGPD) y en algunos casos **datos sensibles** si se puede inferir conducta, estado de salud, o identificar a terceros.

Antes de producción, el cliente necesita:

1. **Base legal** (art. 6 RGPD): interés legítimo o consentimiento. Interés legítimo en seguridad laboral es defendible si se demuestra que la medida es proporcionada (menos invasiva = mejor).
2. **Consulta al comité de empresa** (art. 64 ET): informar y negociar implantación de sistema de control.
3. **DPIA** (Data Protection Impact Assessment): obligatorio para tratamientos de alto riesgo.
4. **Información a los trabajadores**: cláusula informativa explícita (art. 13 RGPD).
5. **Registro de actividades de tratamiento** actualizado.

**Responsabilidad**: es del cliente (responsable del tratamiento), no nuestra (somos encargados del tratamiento). Pero como proveedores sugerimos las medidas técnicas y lo documentamos.

## Medidas que implementamos en el software

### 1. Retención limitada (TTL automático)

| Colección | TTL default | Configurable hasta |
|-----------|-------------|---------------------|
| `tag_positions_5min` | 48 h | — (fijo, es dato raw) |
| `tag_positions_hourly` | 7 días | 14 días |
| `tag_positions_daily` | 30 días | 90 días (requiere justificación) |
| `proximity_events` (MySQL) | 1 año | 7 años (si hay incidente laboral) |
| `pos_audit_log` | 2 años | — |

- TTL en MongoDB se implementa con índice TTL (nativo).
- `proximity_events` limpieza vía scheduled job (soft delete → archive → hard delete).
- Configurable por planta en `pos_plant_settings.positions_history_retention_days`.

### 2. Minimización: solo los datos necesarios

Campos que NO guardamos (aunque estén disponibles):
- Aceleración, orientación, giroscopio del tag (si el hardware los emitiera).
- Frecuencia cardíaca, temperatura corporal, cualquier biometría.
- Si el tag identifica individualmente a una persona: solo su `employee_code`, no datos familiares, médicos, étnicos.

### 3. Control de acceso basado en roles (RBAC)

Roles (sobre los existentes del DT):

| Rol | Puede ver | Puede modificar |
|-----|-----------|-----------------|
| `SAFETY_MANAGER` | Posiciones realtime, histórico, eventos | Acknowledge eventos |
| `SAFETY_ADMIN` | Todo lo anterior | CRUD zonas, workers, tags |
| `PLANT_MANAGER` | Posiciones agregadas (por zona, por hora), eventos | Nada de CRUD |
| `WORKER` (usuario normal) | Solo su propia posición actual (nadie más) | Nada |
| `AUDITOR` | Solo `pos_audit_log` + eventos | Nada |

- Las consultas individuales a posición de un trabajador concreto quedan **auditadas** en `pos_audit_log`.
- No hay endpoint "posiciones de todos los workers ahora" accesible a roles < SAFETY_MANAGER.

### 4. Auditoría de accesos

Todo acceso a datos sensibles se registra en `pos_audit_log`:
- Consultas a posición individual (`GET /workers/{id}/positions`).
- Exportaciones (`GET /events/export`).
- Cambios en zonas/permisos.
- Cambios en retención.

Campos registrados: `user_id`, `action`, `resource_id`, `ip_address`, `timestamp`, `details`.

Solo rol `AUDITOR` puede consultar esta tabla. Ni siquiera `SAFETY_ADMIN` puede borrarla.

### 5. Pseudonimización en agregados

- `tag_positions_daily` guarda `worker_id` (FK a pos_workers).
- Tras 90 días, un job reemplaza `worker_id` por hash(worker_id + salt) → no-reversible.
- Permite estadísticas agregadas (ocupación por zona, picos horarios) sin identificar individuos.

### 6. Cifrado

- **En tránsito**:
  - Frontend ↔ backend: HTTPS obligatorio en prod (TLS 1.2+).
  - MQTT broker: `mqtts://` con certificado (TLS 1.2+) en prod. En PoC dev, plain `mqtt://` dentro de red Docker.
- **En reposo**:
  - MongoDB/MySQL: cifrado a nivel de volumen (LUKS / BitLocker / AWS EBS encrypted) en prod.
  - No cifrado en PoC dev.

### 7. Seguridad del broker MQTT

- Autenticación obligatoria (user/pass mínimo, certificado preferido).
- ACL por topic: el publicador del lado HW (gateway/concentrador del cliente, o tags directamente) solo puede publicar bajo el prefijo de su planta y no puede suscribirse a comandos de otras plantas. Definir el patrón concreto cuando se conozca el namespace que use el cliente.
- Tags solo pueden publicar a su propio `tag_id` topic (validar en ACL por patrón de cliente ID).
- Rate limiting para prevenir flooding de un tag comprometido.
- Los suscriptores aplicación (`positioning-api`) tienen credenciales separadas y solo acceso de lectura a los topics del HW + escritura a los topics de comandos.

### 8. Defensa contra tags falsos / spoofing

Amenaza: alguien coloca un tag con el ID de un trabajador víctima para pretender que está en otro sitio.

Mitigaciones:
- Tags autenticados con certificado X.509 propio (opcional en PoC).
- Detección de anomalías: saltos imposibles de posición (>10 m/s), presencia simultánea en dos sitios.
- Alertas al `SAFETY_MANAGER` si un tag se "teletransporta".

### 9. Derecho al olvido (art. 17 RGPD)

Endpoint: `DELETE /v1/admin/workers/{id}` con confirmación.

Al borrar un worker:
- Se borra de `pos_workers`.
- Se anonimizan todos sus `pos_proximity_events` (worker_id → NULL, employee_code → 'DELETED').
- Sus posiciones en MongoDB se borran inmediatamente (no esperan TTL).
- Se registra en audit log.

### 10. Portabilidad (art. 20 RGPD)

Endpoint: `GET /v1/workers/{id}/export-personal-data` devuelve ZIP con:
- Datos del worker.
- Histórico de posiciones hasta donde esté retenido.
- Eventos de proximidad que lo involucran.

Formato: JSON + CSV dentro del ZIP.

## IEC 62443 (security levels industriales)

Aplicables cuando RTS se integre en la red OT del cliente:

| Capa | Nivel requerido | Cómo cumple |
|------|-----------------|-------------|
| Tags y anchors (L2) | SL-2 | Depende del fabricante. Nosotros asumimos sí. |
| Concentrador HW del cliente y broker MQTT (L3) | SL-3 | Mosquitto/EMQX con TLS + auth + ACL; broker en LAN industrial on-premise; concentrador HW del cliente en DMZ OT. |
| positioning-api y DB (L4) | SL-3 | Spring Security + JWT + auditoría; DMZ IT. |
| Auth server (L4) | SL-4 | Ya cumple en el DT. |

## Matriz de amenazas (STRIDE resumido)

| Amenaza | Mitigación |
|---------|------------|
| **S**poofing de tag | Autenticación tag + detección anomalías. |
| **T**ampering de posición en tránsito | TLS obligatorio en MQTT prod. |
| **R**epudiation (negar que fue tú) | Audit log inmutable. |
| **I**nformation disclosure | RBAC + pseudonimización + TTL. |
| **D**enial of service | Rate limiting broker + circuit breaker dispatch. |
| **E**levation of privilege | JWT con scopes + `@PreAuthorize` granular. |

## Transparencia con trabajadores

Recomendación al cliente (no nuestra responsabilidad directa, pero lo mencionamos):
- Cartelería informativa en accesos: "planta con sistema de localización indoor por UWB para seguridad laboral".
- Formación breve a cada empleado (5 min) sobre qué se registra, por cuánto tiempo, quién accede.
- Canal para ejercicio de derechos (acceso, rectificación, oposición, supresión).

## Política de retención resumida (resumen visual)

```
 0h                    48h    7d           30d         1a        2a        7a
 │                      │      │             │          │         │         │
 ├── tag_positions_5min ┤
 │                      │
 ├───── tag_positions_hourly ──┤
 │                             │
 ├───────── tag_positions_daily─── (configurable default 30d) ──┤
 │                                                               │
 ├─────────────────── proximity_events (default 1a) ──────────────────────┤
 │                                                                        │
 ├─────────────────────── pos_audit_log (2a) ─────────────────────────────────┤
 │                                                                             │
 └── Si incidente laboral con expediente, retenemos eventos hasta 7a ─────────────┤
```

## Acciones para antes de producción

- [ ] Cliente obtiene informe favorable del comité de empresa.
- [ ] Cliente elabora DPIA.
- [ ] Cliente redacta cláusula informativa a trabajadores.
- [ ] Cliente define oficial DPO (Data Protection Officer) de contacto.
- [ ] Activar TLS obligatorio en MQTT broker.
- [ ] Activar cifrado de volumen en MySQL/MongoDB.
- [ ] Audit log periódicamente exportado a sistema WORM (write-once).
- [ ] Pentest antes de go-live.
