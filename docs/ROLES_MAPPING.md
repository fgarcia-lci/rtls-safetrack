# Mapeo de roles: DT → Safetrack

## Estrategia

**En PoC reutilizamos los roles globales del DT sin tocar su BD.** Cuando se integre al DT (Q3 2026), creamos los roles específicos `ROLE_SAFETRACK_*` y permisos granulares siguiendo el patrón que ya usan para Electrical Consumers.

## Roles del DT (auditados el 2026-04-21)

Definidos en `digital-twin-backend/digital-twin-api/src/main/resources/db/migration/`:

| Código | Origen | Descripción (DT) |
|---|---|---|
| `ROLE_USER` | `V5__seed_roles.sql` | Usuario básico con read access |
| `ROLE_ADMIN` | `V5__seed_roles.sql` | Acceso total, todos los permisos |
| `ROLE_OPERATOR` | `V5__seed_roles.sql` / `V51__assign_permissions_to_roles.sql` | Operador de planta, ACK alertas, mantenimiento |
| `ROLE_EC_VIEWER` | `V61__ec_permissions_and_roles.sql` | Electrical Consumers solo lectura |
| `ROLE_EC_EDITOR` | `V61` | Electrical Consumers lectura/escritura |
| `ROLE_EC_ADMIN` | `V61` | Electrical Consumers admin total |

## Mapeo en uso para Safetrack (PoC)

| Rol DT | Capacidades en Safetrack |
|---|---|
| `ROLE_ADMIN` | CRUD workers, tags, zonas, políticas de notificación, retención GDPR. Puede ver auditoría. Configura matriz de transformación de coords. |
| `ROLE_OPERATOR` | Equipo de seguridad / supervisor: ve realtime de la planta entera, ACK alertas de proximidad, gestiona eventos abiertos, ve histórico. NO modifica zonas ni workers. |
| `ROLE_USER` | Dashboard básico: KPIs, mapa con avatares (anonimizados o solo del propio scope si fuera el caso), lista de últimos eventos. Sin ACK. |

> En PoC no creamos roles específicos. El JWT del auth-server del DT trae el rol; el `positioning-api` valida con `@PreAuthorize("hasRole('OPERATOR')")` o equivalente.

## Cuando se integre al DT (Q3 2026)

Patrón: igual que Electrical Consumers (`V61__ec_permissions_and_roles.sql`). Crear:

### Roles específicos
- `ROLE_SAFETRACK_VIEWER` — ver positions + eventos, sin ACK.
- `ROLE_SAFETRACK_OPERATOR` — ACK alertas, gestionar eventos, ver realtime.
- `ROLE_SAFETRACK_ADMIN` — admin total + configuración + auditoría.

### Permisos granulares
- `MODULE_SAFETRACK_ACCESS` — entrada al módulo.
- `SAFETRACK_POSITION_VIEW` — ver posiciones realtime y histórico.
- `SAFETRACK_WORKER_VIEW` / `SAFETRACK_WORKER_MANAGE`.
- `SAFETRACK_TAG_VIEW` / `SAFETRACK_TAG_MANAGE`.
- `SAFETRACK_ZONE_VIEW` / `SAFETRACK_ZONE_MANAGE`.
- `SAFETRACK_EVENT_ACK`.
- `SAFETRACK_EVENT_EXPORT`.
- `SAFETRACK_AUDIT_VIEW`.
- `SAFETRACK_ADMIN`.

### Tabla `role_permissions` (junction many-to-many)
Misma estructura que el DT actual; añadir filas que mapeen cada `ROLE_SAFETRACK_*` a su set de permisos.

## Validación en código

**Backend (Spring)**:
```java
@PreAuthorize("hasRole('ADMIN') or hasRole('OPERATOR')")
public List<ProximityEventDto> listOpenEvents(...) { ... }

@PreAuthorize("hasRole('ADMIN')")
public ZoneDto createZone(@RequestBody ZoneCreateDto dto) { ... }
```

**Frontend (React)**:
```tsx
const { hasRole } = useAuth();
if (hasRole('OPERATOR')) {
  // Mostrar botón ACK
}
```

> Patrón idéntico al que ya usa el DT (ver `useAdminPermissions.ts` en frontend del DT).

## Referencias

- Roles DT: `digital-twin-backend/digital-twin-api/src/main/resources/db/migration/V5__seed_roles.sql`
- Permisos DT: `V51__assign_permissions_to_roles.sql`, `V61__ec_permissions_and_roles.sql`, `V65__plant_management_permissions.sql`
- AuthContext frontend: `digital-twin-frontend/src/context/AuthContext.tsx`
- Patrón hook: `digital-twin-frontend/src/hooks/useAdminPermissions.ts`
