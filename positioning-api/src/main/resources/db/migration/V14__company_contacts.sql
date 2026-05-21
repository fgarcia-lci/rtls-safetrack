-- =============================================================================
-- RTLS Safetrack — Flyway V14: empresa con contactos propios
--
-- Cambio: la empresa pasa a tener su propio teléfono + email obligatorios
-- (centralita / contacto general). El manager personal queda opcional
-- para evitar el "huevo y la gallina" al crear empresas nuevas (necesitas
-- una persona para asignarla como manager, pero esa persona puede no estar
-- aún en el sistema).
--
-- Notas:
--   - Las filas existentes ya creadas se rellenan con un placeholder
--     editable; la UI marca esos campos como obligatorios y pide que el
--     admin los actualice cuando entre a la ficha de la empresa.
--   - manager_person_id ya era NULL en V13, no se cambia el esquema, sólo
--     se documenta como opcional.
-- =============================================================================

ALTER TABLE pos_companies
  ADD COLUMN phone VARCHAR(40)  NOT NULL DEFAULT ''
    AFTER type,
  ADD COLUMN email VARCHAR(120) NOT NULL DEFAULT ''
    AFTER phone;

-- El DEFAULT '' permite añadir la columna sin romper filas existentes.
-- A partir de ahora la UI exige que phone y email se rellenen explícitamente.
-- En producción se quitaría el DEFAULT en una migración posterior una vez
-- garantizado que todos los registros tienen valor válido.
