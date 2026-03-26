
export interface AuthUser {
  id: number;
  email: string;
  role?: string;
}

export interface AuthClaims {
  userId: number;
  email: string;
  role: 'admin' | 'user';
  exp?: number;
  iat?: number;
}

export interface AuthResponse {
  token: string;
  user: AuthUser;
}

export interface LoginRequirements {
  requiresAdminAccess: boolean;
}

export interface AuthRequestError extends Error {
  status?: number;
  reason?: string;
  details?: unknown;
}

const AUTH_TOKEN_KEY = 'auth_token';
const AUTH_USER_KEY = 'auth_user';
const LEGACY_AUTH_TOKEN_KEY = 'authToken';
const USER_ROLE_KEY = 'userRole';
const ADMIN_ACCESS_KEY_STORAGE_KEY = 'admin_access_key';
const INVALID_STORAGE_VALUES = new Set(['', 'null', 'undefined']);

function clearAuthStorage() {
  if (typeof localStorage === 'undefined') return;
  localStorage.removeItem(AUTH_TOKEN_KEY);
  localStorage.removeItem(AUTH_USER_KEY);
  localStorage.removeItem(LEGACY_AUTH_TOKEN_KEY);
  localStorage.removeItem(USER_ROLE_KEY);
  if (typeof window !== 'undefined') {
    window.sessionStorage.removeItem(ADMIN_ACCESS_KEY_STORAGE_KEY);
  }
}

function normalizeRole(role: unknown): 'admin' | 'user' {
  return role === 'admin' ? 'admin' : 'user';
}

function getAdminAccessStorage(): Storage | null {
  if (typeof window === 'undefined') return null;
  return window.sessionStorage;
}

function decodeJwtPayload(token: string): Record<string, unknown> | null {
  const parts = token.split('.');
  if (parts.length !== 3) return null;

  try {
    const payload = parts[1]
      .replace(/-/g, '+')
      .replace(/_/g, '/')
      .padEnd(Math.ceil(parts[1].length / 4) * 4, '=');

    return JSON.parse(atob(payload)) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function isValidToken(token: string | null): token is string {
  if (!token) return false;

  const normalizedToken = token.trim();
  if (INVALID_STORAGE_VALUES.has(normalizedToken)) {
    return false;
  }

  const payload = decodeJwtPayload(normalizedToken);
  if (!payload) {
    return false;
  }

  if (typeof payload.exp === 'number' && payload.exp * 1000 <= Date.now()) {
    return false;
  }

  return true;
}

async function parseResponseJson(res: Response): Promise<unknown> {
  const text = await res.text();
  if (!text) return null;

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

function buildAuthRequestError(res: Response, data: unknown): AuthRequestError {
  const error = new Error(
    typeof data === 'object' && data !== null && 'message' in data && typeof data.message === 'string'
      ? data.message
      : 'Request failed'
  ) as AuthRequestError;

  error.status = res.status;
  if (typeof data === 'object' && data !== null && 'reason' in data && typeof data.reason === 'string') {
    error.reason = data.reason;
  }
  error.details = data;
  return error;
}

export function getAuthToken(): string | null {
  if (typeof localStorage === 'undefined') return null;

  const storedToken = localStorage.getItem(AUTH_TOKEN_KEY) || localStorage.getItem(LEGACY_AUTH_TOKEN_KEY);
  if (!isValidToken(storedToken)) {
    if (storedToken) {
      clearAuthStorage();
    }
    return null;
  }

  if (!localStorage.getItem(AUTH_TOKEN_KEY)) {
    localStorage.setItem(AUTH_TOKEN_KEY, storedToken);
    localStorage.removeItem(LEGACY_AUTH_TOKEN_KEY);
  }

  return storedToken;
}

export function getAuthClaims(): AuthClaims | null {
  const token = getAuthToken();
  if (!token) return null;

  const payload = decodeJwtPayload(token);
  if (!payload || typeof payload.userId !== 'number' || typeof payload.email !== 'string') {
    clearAuthStorage();
    return null;
  }

  return {
    userId: payload.userId,
    email: payload.email,
    role: normalizeRole(payload.role),
    exp: typeof payload.exp === 'number' ? payload.exp : undefined,
    iat: typeof payload.iat === 'number' ? payload.iat : undefined
  };
}

export function getAuthUser(): AuthUser | null {
  const claims = getAuthClaims();
  if (!claims) return null;

  const normalizedUser: AuthUser = {
    id: claims.userId,
    email: claims.email,
    role: claims.role
  };

  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(AUTH_USER_KEY, JSON.stringify(normalizedUser));
    localStorage.setItem(USER_ROLE_KEY, normalizedUser.role || 'user');
  }

  return normalizedUser;
}

export function isAdminUser(): boolean {
  return getAuthClaims()?.role === 'admin';
}

export function getAdminAccessKey(): string | null {
  const storage = getAdminAccessStorage();
  if (!storage) return null;

  const storedKey = storage.getItem(ADMIN_ACCESS_KEY_STORAGE_KEY);
  if (!storedKey) return null;

  const normalizedKey = storedKey.trim();
  if (INVALID_STORAGE_VALUES.has(normalizedKey)) {
    storage.removeItem(ADMIN_ACCESS_KEY_STORAGE_KEY);
    return null;
  }

  return normalizedKey;
}

export function setAdminAccessKey(accessKey: string | null) {
  const storage = getAdminAccessStorage();
  if (!storage) return;

  const normalizedKey = accessKey?.trim();
  if (!normalizedKey || INVALID_STORAGE_VALUES.has(normalizedKey)) {
    storage.removeItem(ADMIN_ACCESS_KEY_STORAGE_KEY);
    return;
  }

  storage.setItem(ADMIN_ACCESS_KEY_STORAGE_KEY, normalizedKey);
}

export function getAdminAuthHeaders(extraHeaders: Record<string, string> = {}): Record<string, string> {
  const headers: Record<string, string> = { ...extraHeaders };
  const token = getAuthToken();
  const adminAccessKey = getAdminAccessKey();

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  if (adminAccessKey) {
    headers['X-Admin-Access-Key'] = adminAccessKey;
  }

  return headers;
}

function saveAuth(resp: AuthResponse) {
  if (typeof localStorage === 'undefined') return;
  const claims = decodeJwtPayload(resp.token);
  const user: AuthUser = {
    id: typeof claims?.userId === 'number' ? claims.userId : resp.user.id,
    email: typeof claims?.email === 'string' ? claims.email : resp.user.email,
    role: normalizeRole(claims?.role ?? resp.user.role)
  };

  localStorage.setItem(AUTH_TOKEN_KEY, resp.token);
  localStorage.setItem(AUTH_USER_KEY, JSON.stringify(user));
  localStorage.removeItem(LEGACY_AUTH_TOKEN_KEY);
  localStorage.setItem(USER_ROLE_KEY, user.role || 'user');

  if (user.role !== 'admin') {
    setAdminAccessKey(null);
  }
}

async function request(path: string, body: unknown): Promise<AuthResponse> {
  const res = await fetch(`/api/auth/${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  const data = await parseResponseJson(res);
  if (!res.ok) {
    throw buildAuthRequestError(res, data);
  }
  saveAuth(data as AuthResponse);
  return data as AuthResponse;
}

export async function getLoginRequirements(email: string): Promise<LoginRequirements> {
  const normalizedEmail = email.trim();
  if (!normalizedEmail) {
    return { requiresAdminAccess: false };
  }

  const res = await fetch('/api/auth/login-requirements', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ email: normalizedEmail }),
  });

  const data = await parseResponseJson(res);
  if (!res.ok) {
    throw buildAuthRequestError(res, data);
  }

  return {
    requiresAdminAccess:
      typeof data === 'object' &&
      data !== null &&
      'requiresAdminAccess' in data &&
      Boolean(data.requiresAdminAccess)
  };
}

export async function getRegistrationStatus(): Promise<{ enabled: boolean }> {
  try {
    const res = await fetch('/api/auth/registration-status');
    if (!res.ok) return { enabled: true };
    const data = await res.json();
    return { enabled: Boolean(data.enabled) };
  } catch {
    return { enabled: true };
  }
}

export async function register(email: string, password: string): Promise<AuthUser> {
  const resp = await request('register', { email, password });
  return resp.user;
}

export async function login(email: string, password: string): Promise<AuthUser> {
  const resp = await request('login', { email, password });
  return resp.user;
}

export async function loginWithAdminAccess(email: string, password: string, adminAccessKey: string): Promise<AuthUser> {
  setAdminAccessKey(adminAccessKey);
  try {
    const resp = await request('login', { email, password, adminAccessKey });
    return resp.user;
  } catch (error) {
    setAdminAccessKey(null);
    throw error;
  }
}

export function logout() {
  clearAuthStorage();
}
