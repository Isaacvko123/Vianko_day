import { refreshSession } from '../api/endpoints';
import type { AuthSession } from '../types';
import { readStoredSession, storeSession } from './storage';
let pending: Promise<AuthSession> | undefined;
export function refreshSharedSession(current: AuthSession): Promise<AuthSession> {
  if (pending) return pending;
  const refresh = async () => {
    const stored = readStoredSession();
    if (!stored || stored.user.id !== current.user.id) throw new Error('La sesión cambió.');
    if (stored.tokens.refreshToken !== current.tokens.refreshToken) return stored;
    const response = await refreshSession(stored.tokens.refreshToken);
    const latest = readStoredSession();
    if (!latest || latest.user.id !== current.user.id) throw new Error('La sesión se cerró.');
    return storeSession({ ...stored, tokens: response.tokens });
  };
  // Web Locks prevents two tabs from consuming the same single-use refresh token.
  const operation = async (): Promise<AuthSession> => 'locks' in navigator ? await navigator.locks.request('vianko-day.session-refresh', refresh) : await refresh();
  pending = operation().finally(() => { pending = undefined; });
  return pending;
}
