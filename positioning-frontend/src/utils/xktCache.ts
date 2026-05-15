// Cache binario de modelos XKT en IndexedDB.
//
// Por qué: los XKT son grandes (50-300 MB). El cache HTTP de nginx ya
// evita el round-trip al servidor en navegaciones normales, pero un
// hard-reload (Ctrl+F5) lo invalida y el navegador vuelve a descargar
// los 100 MB. IndexedDB persiste entre sesiones y hard-reloads → al
// recargar, leemos de IDB en milisegundos en lugar de descargar la red.
//
// Versionado: usamos la URL completa como key. El nombre de archivo
// embebe versión (`solubilizacion_v1.xkt`); cuando cambien el modelo
// bumpearán el sufijo y la nueva URL será una nueva key. Las viejas
// quedan huérfanas hasta que `evictOlderThan` las limpie (no
// implementado en v1; el navegador hará GC cuando llegue a su cuota).
//
// Fallbacks: si IndexedDB no está disponible (modo privado, cuota,
// usuario lo deshabilitó), las funciones devuelven null/no-op silenciosamente
// y `loadXktBytes` cae al fetch normal — la app sigue funcionando, solo
// sin la mejora de cold-start.

const DB_NAME = 'rtls-xkt-cache';
const STORE = 'xkt';
const DB_VERSION = 1;

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  // Si la promesa falla, vacía la caché para que un siguiente intento
  // pueda reabrir (p.ej. tras conceder cuota).
  dbPromise.catch(() => { dbPromise = null; });
  return dbPromise;
}

export async function getXkt(url: string): Promise<ArrayBuffer | null> {
  try {
    const db = await openDb();
    return await new Promise<ArrayBuffer | null>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).get(url);
      req.onsuccess = () => resolve((req.result as ArrayBuffer | undefined) ?? null);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return null;
  }
}

export async function putXkt(url: string, bytes: ArrayBuffer): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(bytes, url);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    // Cuota llena, modo privado, etc. Silencioso: el peor caso es
    // re-descargar el archivo en el siguiente hard-reload.
  }
}

/**
 * Devuelve los bytes del XKT, sirviendo de IndexedDB si están cacheados
 * o haciendo fetch + cache si no. Si IDB falla en cualquier punto, cae
 * al fetch directo sin error visible al usuario.
 */
export async function loadXktBytes(url: string): Promise<ArrayBuffer> {
  const cached = await getXkt(url);
  if (cached) {
    return cached;
  }
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch XKT (${res.status}): ${url}`);
  const bytes = await res.arrayBuffer();
  // No bloqueamos el load por la escritura en IDB (puede ser lenta con
  // archivos grandes). Disparamos y olvidamos.
  void putXkt(url, bytes);
  return bytes;
}

/**
 * Borra TODAS las entries del cache. Útil para devops/debug
 * (window.__rtlsClearXktCache()) si hay algún XKT corrupto en IDB.
 */
export async function clearXktCache(): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch { /* ignore */ }
}

// Expone clearXktCache en window para debug — no se llama en código.
if (typeof window !== 'undefined') {
  (window as unknown as { __rtlsClearXktCache?: () => Promise<void> }).__rtlsClearXktCache = clearXktCache;
}
