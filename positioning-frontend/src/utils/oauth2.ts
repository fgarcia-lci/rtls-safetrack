// OAuth2 PKCE — clonado del Digital Twin (`digital-twin-frontend/src/utils/oauth2.ts`)
// con tres adaptaciones:
//   - clientId: 'dt-web' → 'rtls-safetrack-web' (cliente registrado en oauth2_registered_client del DT)
//   - redirectUri default: :5173 → :5180 (puerto del frontend de Safetrack)
//   - postLogoutRedirectUri default: :5173 → :5180

const AUTH_CONFIG = {
  authServerUrl: import.meta.env.VITE_AUTH_URL ?? 'http://localhost:9000',
  clientId: 'rtls-safetrack-web',
  redirectUri: `${import.meta.env.VITE_FRONTEND_URL ?? 'http://localhost:5180'}/callback`,
  postLogoutRedirectUri: import.meta.env.VITE_FRONTEND_URL ?? 'http://localhost:5180',
  scopes: ['openid', 'offline_access', 'read', 'write'],
};

function generateRandomString(length: number): string {
  const charset = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
  const randomValues = new Uint8Array(length);
  crypto.getRandomValues(randomValues);
  return Array.from(randomValues)
    .map((v) => charset[v % charset.length])
    .join('');
}

async function sha256(plain: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(plain);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return base64UrlEncode(hash);
}

function base64UrlEncode(arrayBuffer: ArrayBuffer): string {
  const bytes = new Uint8Array(arrayBuffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

export async function generatePKCE() {
  const codeVerifier = generateRandomString(128);
  const codeChallenge = await sha256(codeVerifier);
  return { codeVerifier, codeChallenge, codeChallengeMethod: 'S256' };
}

export function buildAuthorizationUrl(codeChallenge: string, state: string): string {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: AUTH_CONFIG.clientId,
    redirect_uri: AUTH_CONFIG.redirectUri,
    scope: AUTH_CONFIG.scopes.join(' '),
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
    state,
  });
  return `${AUTH_CONFIG.authServerUrl}/oauth2/authorize?${params.toString()}`;
}

export async function exchangeCodeForTokens(
  code: string,
  codeVerifier: string,
): Promise<TokenResponse> {
  const params = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: AUTH_CONFIG.redirectUri,
    client_id: AUTH_CONFIG.clientId,
    code_verifier: codeVerifier,
  });
  const response = await fetch(`${AUTH_CONFIG.authServerUrl}/oauth2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  });
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Token exchange failed: ${error}`);
  }
  return response.json();
}

export async function refreshAccessToken(refreshToken: string): Promise<TokenResponse> {
  const params = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    client_id: AUTH_CONFIG.clientId,
  });
  const response = await fetch(`${AUTH_CONFIG.authServerUrl}/oauth2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  });
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Token refresh failed: ${error}`);
  }
  return response.json();
}

export async function revokeToken(token: string): Promise<void> {
  const params = new URLSearchParams({
    token,
    client_id: AUTH_CONFIG.clientId,
  });
  await fetch(`${AUTH_CONFIG.authServerUrl}/oauth2/revoke`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  });
}

export async function performLogout(): Promise<void> {
  // POST a `/logout` para invalidar la sesión en el auth-server. Usamos
  // `fetch` con `credentials: 'include'` (NO submit de un form) para
  // mantener el control de la navegación: tras la llamada, nosotros
  // redirigimos al login.
  //
  // Antes hacíamos un form.submit() que dejaba al auth-server gestionar
  // la redirección posterior. Spring Authorization Server tras `/logout`
  // intenta llevar al `logoutSuccessUrl` configurado; si en el despliegue
  // ese valor está vacío o apunta a una URL no válida, Chrome muestra
  // `ERR_INVALID_REDIRECT` y el usuario se queda atascado en
  // `http://localhost:9000/logout`.
  try {
    await fetch(`${AUTH_CONFIG.authServerUrl}/logout`, {
      method: 'POST',
      credentials: 'include',
      // No body — Spring Security cierra la sesión asociada a la cookie.
    });
  } catch {
    // Si el auth-server no responde (por ejemplo, está caído), igualmente
    // continuamos: el estado local ya está limpio y al volver a login
    // se forzará re-autenticación.
  }
  window.location.href = '/login?logout=true';
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function decodeJWT(token: string): any {
  try {
    const base64Url = token.split('.')[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const jsonPayload = decodeURIComponent(
      atob(base64)
        .split('')
        .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join(''),
    );
    return JSON.parse(jsonPayload);
  } catch (error) {
    console.error('Failed to decode JWT:', error);
    return null;
  }
}

export function isTokenExpired(token: string): boolean {
  const payload = decodeJWT(token);
  if (!payload || !payload.exp) return true;
  const expirationTime = payload.exp * 1000;
  const currentTime = Date.now();
  const bufferTime = 60 * 1000;
  return currentTime >= expirationTime - bufferTime;
}

export interface TokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  refresh_token?: string;
  scope: string;
  id_token?: string;
}

export { AUTH_CONFIG };
