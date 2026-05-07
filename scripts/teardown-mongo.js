// =============================================================================
// RTLS Safetrack — Teardown / Rollback completo (MongoDB)
//
// Borra la BD `dt_safetrack_metrics` que contiene las posiciones y agregados.
// Deja la BD `dt_metrics` del Digital Twin intacta.
//
// Uso:
//   mongosh "mongodb://dt_root:dtroot@localhost:27016/admin?authSource=admin" \
//           scripts/teardown-mongo.js
//
// O interactivo:
//   mongosh "mongodb://dt_root:dtroot@localhost:27016/admin?authSource=admin"
//   > load("scripts/teardown-mongo.js")
// =============================================================================

const dbName = "dt_safetrack_metrics";

// 1. Drop de la BD entera (incluye tag_positions_current/5min/hourly/daily, etc.)
const target = db.getSiblingDB(dbName);
const result = target.dropDatabase();
print(`dropDatabase('${dbName}') → ${JSON.stringify(result)}`);

// 2. Quitar permisos del usuario dt_app sobre la BD (el grant lo añadió setup-databases.sql)
//    No es estrictamente necesario porque la BD ya no existe, pero deja el grant huérfano si no se hace.
try {
  db.getSiblingDB("admin").revokeRolesFromUser("dt_app", [
    { role: "readWrite", db: dbName }
  ]);
  print(`revokeRolesFromUser('dt_app', readWrite@${dbName}) → OK`);
} catch (e) {
  print(`revokeRolesFromUser falló (puede que no se otorgara nunca): ${e.message}`);
}

// 3. Verificación: no debería existir la BD
const remaining = db.adminCommand({ listDatabases: 1 }).databases
  .filter(d => d.name === dbName);
if (remaining.length === 0) {
  print(`OK: BD '${dbName}' eliminada correctamente.`);
} else {
  print(`WARN: BD '${dbName}' aún existe.`);
}
