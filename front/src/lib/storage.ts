import type { AuthSession, WorkspaceListItem } from "../types";

const authStorageKey = "vianko-day.auth";
const workspaceStorageKey = "vianko-day.workspace";

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
  return readJson<AuthSession>(authStorageKey);
}

export function storeSession(session: AuthSession) {
  writeJson(authStorageKey, session);
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
