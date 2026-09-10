import { useState, type FormEvent } from 'react';
import { ArrowRight, Check, Eye, EyeOff, LockKeyhole } from 'lucide-react';
import { login } from '../api/endpoints';
import type { AuthSession } from '../types';
export function AuthScreen({ onAuthenticated }: { onAuthenticated: (session: AuthSession) => void }) {
  const [busy, setBusy] = useState(false);
  const [visible, setVisible] = useState(false);
  const [error, setError] = useState('');
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (busy) return;
    const form = new FormData(event.currentTarget); setError(''); setBusy(true);
    try { onAuthenticated(await login({ email: String(form.get('email')).trim(), password: String(form.get('password')) })); }
    catch (failure) { setError(failure instanceof Error ? failure.message : 'No se pudo iniciar sesión.'); }
    finally { setBusy(false); }
  }
  return <main className="day-login"><section className="day-login-form"><a className="day-login-brand" href="/"><span>v</span>vianko<strong>day</strong></a><div><p className="day-kicker">Tu equipo empieza aquí</p><h1>Vamos a hacer<br/>que pase.</h1><p>Entra a tu cuenta para continuar con tu trabajo.</p><form onSubmit={submit}><label>Correo electrónico<input name="email" type="email" autoComplete="username" required placeholder="nombre@empresa.com" disabled={busy}/></label><label>Contraseña<span className="password-control"><input name="password" type={visible?'text':'password'} autoComplete="current-password" required disabled={busy}/><button type="button" aria-label={visible?'Ocultar contraseña':'Ver contraseña'} onClick={()=>setVisible(!visible)}>{visible?<EyeOff size={17}/>:<Eye size={17}/>}</button></span></label>{error&&<p className="form-error" role="alert">{error}</p>}<button className="day-login-submit" type="submit" disabled={busy}>{busy?'Ingresando…':'Entrar a mi equipo'}<ArrowRight size={18}/></button></form><div className="day-login-invite"><LockKeyhole size={17}/><p>¿Primera vez? Pide una invitación al responsable de tu empresa. Él definirá tu rol y tus proyectos.</p></div></div><small>Vianko Day · Trabajo en equipo, sin vueltas.</small></section><section className="day-login-story"><span className="day-story-label">MENOS RUIDO. MÁS CLARIDAD.</span><h2>Personas que<br/>hacen equipo.<br/><em>Trabajo que avanza.</em></h2><div className="day-story-flow"><article><span>01</span><div><h3>Define lo que sigue</h3><p>Un proyecto, un objetivo y tareas concretas.</p></div></article><article><span>02</span><div><h3>Conecta a las personas</h3><p>Asigna responsables y pide apoyo a otras áreas.</p></div></article><article><span>03</span><div><h3>Avanza en equipo</h3><p>Comparte avances y recibe los cambios al momento.</p></div></article></div><footer><span/><span/><span/><p>Todo en el mismo lugar.</p></footer></section></main>;
}
