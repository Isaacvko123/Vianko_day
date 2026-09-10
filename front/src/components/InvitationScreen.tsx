import { useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { apiRequest } from '../api/http';
import type { AuthSession } from '../types';
export function InvitationScreen({ onAuthenticated }: { onAuthenticated: (session: AuthSession) => void }) {
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (saving) return;
    const data = new FormData(event.currentTarget); setSaving(true); setError('');
    try {
      const session = await apiRequest<AuthSession>('/auth/accept-invitation', { method: 'POST', body: { token, name: String(data.get('name') ?? '').trim() || undefined, password: String(data.get('password') ?? '') } });
      onAuthenticated(session);
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'No se pudo aceptar la invitación.'); }
    finally { setSaving(false); }
  }
  return <main className="invitation-page"><section><p className="eyebrow">Vianko Day</p><h1>Únete a tu equipo</h1><p>Tu invitación define la empresa y el alcance de tu acceso. Si ya tienes cuenta, utiliza tu contraseña actual.</p>
    {token.length < 32 ? <p className="form-error" role="alert">El enlace está incompleto. Solicita una nueva invitación.</p> : <form className="form-stack" onSubmit={submit}>
      <label>Nombre <small>Necesario si es tu primera cuenta</small><input name="name" minLength={2} maxLength={120} autoComplete="name" /></label>
      <label>Contraseña<input name="password" type="password" minLength={8} maxLength={256} autoComplete="current-password" required /></label>
      {error ? <p className="form-error" role="alert">{error}</p> : undefined}<button className="primary-action" type="submit" disabled={saving}>{saving ? 'Validando…' : 'Aceptar invitación'}</button>
    </form>}<Link to="/login">Volver al inicio</Link></section></main>;
}
