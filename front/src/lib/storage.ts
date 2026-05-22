import type { AuthSession, WorkspaceListItem } from "../types";

const authStorageKey = "vianko-day.auth";
const workspaceStorageKey = "vianko-day.workspace";

function buildTokenExpiry(expiresIn: number) {
  return new Date(Date.now() + expiresIn * 1000).toISOString();
}

function normalizeStoredSession(session: AuthSession, assumeFreshToken: boolean) {
  const storedExpiryMs = Date.parse(session.tokens.expiresAt ?? "");
  const hasValidStoredExpiry = Number.isFinite(storedExpiryMs);

  return {
    ...session,
    tokens: {
      ...session.tokens,
      expiresAt: hasValidStoredExpiry
        ? new Date(storedExpiryMs).toISOString()
        : assumeFreshToken
          ? buildTokenExpiry(session.tokens.expiresIn)
          : new Date(0).toISOString()
    }
  };
}

export function shouldRefreshSessionAccessToken(session: AuthSession | undefined, skewMs = 30_000) {
  if (!session) {
    return false;
  }

  const expiresAtMs = Date.parse(session.tokens.expiresAt ?? "");

  if (!Number.isFinite(expiresAtMs)) {
    return true;
  }

  return expiresAtMs <= Date.now() + skewMs;
}

export function getSessionAccessTokenExpiresAt(session: AuthSession) {
  const expiresAtMs = Date.parse(session.tokens.expiresAt ?? "");

  if (Number.isFinite(expiresAtMs)) {
    return expiresAtMs;
  }

  return Date.now();
}

function readJson<T>(key: string): T | undefined {
  const storedValue = window.localStorage.getItem(key);

  if (!storedValue) {
    return undefined;
  }

  try {
    return JSON.parse(storedValue) as T;
  } catch {
    window.localStorage.removeItem(key);
    return undefined;
  }
}

function writeJson<T>(key: string, value: T) {
  window.localStorage.setItem(key, JSON.stringify(value));
}

export function readStoredSession() {
  const storedSession = readJson<AuthSession>(authStorageKey);

  return storedSession ? normalizeStoredSession(storedSession, false) : undefined;
}

export function storeSession(session: AuthSession) {
  const storedSession = normalizeStoredSession(session, true);
  writeJson(authStorageKey, storedSession);
  return storedSession;
}

export function clearStoredSession() {
  window.localStorage.removeItem(authStorageKey);
}

export function readStoredWorkspace() {
  return readJson<WorkspaceListItem>(workspaceStorageKey);
}

export function storeWorkspace(workspace: WorkspaceListItem) {
  writeJson(workspaceStorageKey, workspace);
}

export function clearStoredWorkspace() {
  window.localStorage.removeItem(workspaceStorageKey);
}
