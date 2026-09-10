import { refreshSession } from '../api/endpoints';
import { ApiError } from '../api/http';
import type { AuthSession } from '../types';
import { readStoredSession, storeSession } from './storage';
let pending: Promise<AuthSession> | undefined;
let blockedToken: string | undefined;
let retryAt = 0;
export function refreshSharedSession(current: AuthSession): Promise<AuthSession> {
  if (pending) return pending;
  const refresh = async () => {
    const stored = readStoredSession();
    if (!stored || stored.user.id !== current.user.id) throw new Error('La sesión cambió.');
    if (stored.tokens.refreshToken !== current.tokens.refreshToken) return stored;
    if (blockedToken === stored.tokens.refreshToken && Date.now() < retryAt) {
      const seconds = Math.ceil((retryAt - Date.now()) / 1000);
      throw new ApiError(429, 'RATE_LIMITED', `La conexión se reintentará en ${seconds} segundos.`, seconds);
    }
    const response = await refreshSession(stored.tokens.refreshToken).catch(error => {
      if (error instanceof ApiError && error.status === 429) {
        blockedToken = stored.tokens.refreshToken;
        retryAt = Date.now() + (error.retryAfterSeconds ?? 60) * 1000;
      }
      throw error;
    });
    blockedToken = undefined;
    retryAt = 0;
    const latest = readStoredSession();
    if (!latest || latest.user.id !== current.user.id) throw new Error('La sesión se cerró.');
    return storeSession({ ...stored, tokens: response.tokens });
  };
  // Web Locks prevents two tabs from consuming the same single-use refresh token.
  const operation = async (): Promise<AuthSession> => 'locks' in navigator ? await navigator.locks.request('vianko-day.session-refresh', refresh) : await refresh();
  pending = operation().finally(() => { pending = undefined; });
  return pending;
}
