
export interface AuthUser {
  id: number;
  email: string;
  role?: string;
}

export interface AuthClaims {
  userId: number;
  email: string;
  role: 'admin' | 'user' | 'ops';
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

function normalizeRole(role: unknown): 'admin' | 'user' | 'ops' {
  if (role === 'admin') return 'admin';
  if (role === 'ops') return 'ops';
  return 'user';
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
  const role = getAuthClaims()?.role;
  return role === 'admin' || role === 'ops';
}

export function isOpsUser(): boolean {
  return getAuthClaims()?.role === 'ops';
}

export function getUserRole(): 'admin' | 'user' | 'ops' {
  return getAuthClaims()?.role || 'user';
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

// ==================== 本地会话（桌面可选身份）====================
// 桌面版不再请求 /api/auth：登录/注册仅创建一个本地会话（自包含的伪 JWT），
// 供个性化/同步类可选功能读取身份；应用功能不依赖登录。
function localUserIdFromIdentity(identity: string): number {
  let h = 0;
  for (let i = 0; i < identity.length; i++) {
    h = (Math.imul(31, h) + identity.charCodeAt(i)) | 0;
  }
  return Math.abs(h) % 2_000_000_000 || 1;
}

function encodeBase64Url(value: unknown): string {
  const json = JSON.stringify(value);
  return btoa(json)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function createLocalSession(identity: string, role: 'admin' | 'user' | 'ops'): AuthUser {
  const trimmed = identity.trim();
  const user: AuthUser = {
    id: localUserIdFromIdentity(trimmed),
    email: trimmed.includes('@') ? trimmed : `${trimmed}@local.desktop`,
    role,
  };
  const now = Math.floor(Date.now() / 1000);
  const header = encodeBase64Url({ alg: 'none', typ: 'JWT' });
  const payload = encodeBase64Url({
    userId: user.id,
    email: user.email,
    role,
    iat: now,
    exp: now + 60 * 60 * 24 * 3650, // 本地会话长期有效
  });
  const token = `${header}.${payload}.local`;

  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(AUTH_TOKEN_KEY, token);
    localStorage.setItem(AUTH_USER_KEY, JSON.stringify(user));
    localStorage.setItem(USER_ROLE_KEY, role);
    localStorage.removeItem(LEGACY_AUTH_TOKEN_KEY);
  }
  if (role !== 'admin' && role !== 'ops') {
    setAdminAccessKey(null);
  }
  return user;
}

export async function getLoginRequirements(_email: string): Promise<LoginRequirements> {
  // 本地模式：无管理访问密钥门槛
  return { requiresAdminAccess: false };
}

export async function getRegistrationStatus(): Promise<{ enabled: boolean }> {
  // 本地模式：注册开关不适用，始终允许创建本地会话
  return { enabled: true };
}

export async function register(username: string, _password: string): Promise<AuthUser> {
  return createLocalSession(username, 'user');
}

export async function login(email: string, _password: string): Promise<AuthUser> {
  return createLocalSession(email, 'user');
}

export async function loginWithAdminAccess(email: string, _password: string, adminAccessKey: string): Promise<AuthUser> {
  setAdminAccessKey(adminAccessKey);
  return createLocalSession(email, 'admin');
}

export function logout() {
  clearAuthStorage();
}
