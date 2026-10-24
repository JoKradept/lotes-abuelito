/**
 * Gestión de autenticación y sesiones con Motor API.
 */
export type UserSession = {
  usuario: string;
  roles: string[];
  token: string;
  expira?: string;
};

const MOTOR_URL = "http://localhost:3031/v1";
const TOKEN_KEY = "motor_token";
const USER_KEY = "motor_user";
const AUTH_EVENT = "motor_auth_change";

export function getToken(): string {
  if (typeof window === "undefined") return "";
  return localStorage.getItem(TOKEN_KEY) || "";
}

export function getSavedSession(): UserSession | null {
  if (typeof window === "undefined") return null;
  const token = localStorage.getItem(TOKEN_KEY);
  const raw = localStorage.getItem(USER_KEY);
  if (!token || !raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return { ...parsed, token };
  } catch {
    return null;
  }
}

export function saveSession(session: UserSession): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(TOKEN_KEY, session.token);
  localStorage.setItem(USER_KEY, JSON.stringify({
    usuario: session.usuario,
    roles: session.roles,
    expira: session.expira,
  }));
  window.dispatchEvent(new CustomEvent(AUTH_EVENT, { detail: session }));
}

export function clearSession(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
  window.dispatchEvent(new CustomEvent(AUTH_EVENT, { detail: null }));
}

export async function login(usuario: string, password: string): Promise<UserSession> {
  const res = await fetch(`${MOTOR_URL}/_login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ usuario: usuario.trim().toLowerCase(), password }),
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || "Error al iniciar sesión");
  }

  // Obtener roles de /_me con el nuevo token
  const meRes = await fetch(`${MOTOR_URL}/_me`, {
    headers: { Authorization: `Bearer ${data.token}` },
  });
  const meData = meRes.ok ? await meRes.json() : { roles: [] };

  const session: UserSession = {
    usuario: data.usuario || usuario,
    roles: meData.roles || [],
    token: data.token,
    expira: data.expira,
  };

  saveSession(session);
  return session;
}

export async function checkSession(): Promise<UserSession | null> {
  const token = getToken();
  if (!token) return null;
  try {
    const res = await fetch(`${MOTOR_URL}/_me`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      clearSession();
      return null;
    }
    const data = await res.json();
    const current = getSavedSession();
    const session: UserSession = {
      usuario: data.name || current?.usuario || "",
      roles: data.roles || [],
      token,
      expira: current?.expira,
    };
    // Actualizar storage si cambiaron los roles
    localStorage.setItem(USER_KEY, JSON.stringify({
      usuario: session.usuario,
      roles: session.roles,
      expira: session.expira,
    }));
    return session;
  } catch {
    return getSavedSession();
  }
}

export function canManageUsers(roles?: string[]): boolean {
  if (!roles) return false;
  return roles.includes("dueno") || roles.includes("admin") || roles.includes("*");
}

export function onAuthChange(cb: (session: UserSession | null) => void): () => void {
  if (typeof window === "undefined") return () => {};
  const handler = (e: Event) => {
    const custom = e as CustomEvent<UserSession | null>;
    cb(custom.detail);
  };
  window.addEventListener(AUTH_EVENT, handler);
  return () => window.removeEventListener(AUTH_EVENT, handler);
}
