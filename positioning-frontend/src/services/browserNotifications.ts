// Notificaciones nativas del navegador (Notification API).
//
// Patrón clonado del Digital Twin (`websocket.ts:192-214`). Cuando llega
// una alerta de proximity por WebSocket Y la pestaña está en background
// (otra tab activa, ventana minimizada, etc.), disparamos una notificación
// del SO para que el operador/vigilante no se pierda la alerta aunque no
// tenga la app en primer plano.
//
// Si la pestaña está visible NO disparamos: el AlertsDrawer + el Banner
// (#70) ya cubren ese caso y duplicar sería ruido.
//
// Click en la notificación → focusea la pestaña + emite un custom event
// `rtls:navigate-to-alert` que el MainLayout escucha y hace navigate SPA
// (no hard reload, así preservamos el keep-alive del visor xeokit).
//
// Fallback: si el navegador no soporta Notification, o el usuario denegó
// el permiso, las funciones son no-op silenciosas — el AlertsDrawer sigue
// funcionando.

import type { AlertNotification } from '../types/zones';

const NAVIGATE_EVENT = 'rtls:navigate-to-alert';

export interface NavigateToAlertDetail {
  tagSerial?: string | null;
  workerId?: number | null;
  zoneId?: number | null;
}

function isSupported(): boolean {
  return typeof window !== 'undefined' && 'Notification' in window;
}

/**
 * Pide permiso al usuario si aún no se ha decidido. Idempotente —
 * llamadas múltiples no muestran el popup más de una vez (el navegador
 * lo gestiona). Llamar al cargar la app tras el login.
 */
async function requestPermission(): Promise<NotificationPermission> {
  if (!isSupported()) return 'denied';
  if (Notification.permission === 'granted' || Notification.permission === 'denied') {
    return Notification.permission;
  }
  try {
    return await Notification.requestPermission();
  } catch {
    return 'denied';
  }
}

function isCritical(alert: AlertNotification): boolean {
  const sev = alert.severity ?? 3;
  return sev >= 4 || alert.zoneType === 'DANGER' || alert.zoneType === 'RESTRICTED';
}

function buildTitle(alert: AlertNotification): string {
  const who = alert.workerName ?? alert.workerCode ?? alert.tagSerial ?? 'Operario';
  if (isCritical(alert)) {
    return `🚨 ${who} en zona ${alert.zoneType ?? 'crítica'}`;
  }
  return `⚠️ ${who} en zona ${alert.zoneType ?? ''}`.trim();
}

function buildBody(alert: AlertNotification): string {
  const zone = alert.zoneName ?? alert.zoneCode ?? `Zona ${alert.zoneId}`;
  const company = alert.workerCompanyName ? ` · ${alert.workerCompanyName}` : '';
  return `${zone}${company}`;
}

/**
 * Muestra una notificación nativa para una alerta nueva. No-op si:
 *   - El navegador no soporta Notification API
 *   - El usuario no concedió permiso
 *   - La pestaña está visible (en ese caso el banner/drawer in-app gestiona)
 *   - La alerta es de tipo EXIT (no es nueva, es cierre)
 */
function showAlert(alert: AlertNotification): void {
  if (!isSupported()) return;
  if (Notification.permission !== 'granted') return;
  if (alert.kind !== 'ENTER') return;
  // Tab activa → no notificación SO (ya se ve el banner in-app).
  if (document.visibilityState === 'visible') return;

  try {
    const n = new Notification(buildTitle(alert), {
      body: buildBody(alert),
      icon: alert.workerPhotoUrl ?? '/favicon.svg',
      // tag = id del evento → si el WS reenvía la misma alerta (por
      // reconnect, etc.) el navegador agrupa en lugar de duplicar.
      tag: `rtls-alert-${alert.eventId}`,
      // Críticas no se auto-cierran; el usuario debe cerrarlas o hacer click.
      requireInteraction: isCritical(alert),
      silent: false,
    });

    n.onclick = () => {
      window.focus();
      n.close();
      // Emite evento — el MainLayout (que tiene useNavigate) lo escucha
      // y navega SPA a /live?focusTag=...&follow=true. No usamos
      // window.location.href porque eso provocaría hard reload y mataría
      // el keep-alive del visor xeokit.
      const detail: NavigateToAlertDetail = {
        tagSerial: alert.tagSerial,
        workerId: alert.workerId,
        zoneId: alert.zoneId,
      };
      window.dispatchEvent(new CustomEvent(NAVIGATE_EVENT, { detail }));
    };
  } catch (err) {
    // Algunos navegadores lanzan si la página no fue activada por
    // gesto del usuario — silencioso.
    console.warn('[BrowserNotif] failed to show notification', err);
  }
}

export const browserNotifications = {
  requestPermission,
  showAlert,
  NAVIGATE_EVENT,
  isSupported,
};
