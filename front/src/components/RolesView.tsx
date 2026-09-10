import { useState, type FormEvent } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Copy, LockKeyhole, Plus, ShieldCheck, Trash2, UsersRound } from 'lucide-react';
import { apiRequest } from '../api/http';
import type { Role } from '../types';
import { roleLabel, roleSummary } from '../lib/roles';
import { Button, LoadingState } from './ui';
import { Dialog } from './ui/Dialog';

type Profile = { id: string; name: string; summary: string; scope: string; actions: string[]; restrictions: string[] };
type CatalogRole = Role & { updatedAt: string; profileId?: string; canDelete: boolean; _count: { members: number; projectMembers: number; invitations: number; projectStaffingRequests: number } };
type Catalog = { roles: CatalogRole[]; profiles: Profile[] };
export function RolesView({ token, workspaceId, onSaved, onPeople }: { token: string; workspaceId: string; onSaved: () => void; onPeople: (roleId: string) => void }) {
  const client = useQueryClient();
  const base = `/workspaces/${workspaceId}/roles`;
  const query = useQuery({ queryKey: ['role-catalog', workspaceId], queryFn: () => apiRequest<Catalog>(`${base}/catalog`, { token }) });
  const [selectedId, setSelectedId] = useState('');
  const [editingRole, setEditingRole] = useState<CatalogRole>();
  const [modal, setModal] = useState<'create' | 'edit' | 'delete'>();
  const [profileId, setProfileId] = useState('contributor');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const roles = query.data?.roles ?? [];
  const profiles = query.data?.profiles ?? [];
  const selected = roles.find(role => role.id === selectedId) ?? roles.find(role => role.name === 'Colaborador') ?? roles[0];
  const profile = profiles.find(item => item.id === selected?.profileId);
  const chosenProfile = profiles.find(item => item.id === profileId);
  const mainRoles = roles.filter(role => !role.isSystem || !['Admin TI', 'Lider TI', 'Developer'].includes(role.name));
  const legacy = roles.filter(role => !mainRoles.includes(role));
  function open(next: typeof modal) { setEditingRole(selected); setError(''); setProfileId(selected?.profileId ?? 'contributor'); setModal(next); }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError('');
    const form = new FormData(event.currentTarget);
    try {
      const result = modal === 'delete' ? await apiRequest<{ role?: Role }>(`${base}/${editingRole!.id}`, { token, method: 'DELETE' })
        : await apiRequest<{ role?: Role }>(modal === 'edit' ? `${base}/${editingRole!.id}` : base, { token, method: modal === 'edit' ? 'PATCH' : 'POST', body: {
          name: String(form.get('name')).trim(), description: String(form.get('description')).trim(),
          ...(modal === 'edit' ? { expectedUpdatedAt: editingRole!.updatedAt } : { profileId })
        } });
      if (result.role) setSelectedId(result.role.id);
      await client.invalidateQueries({ queryKey: ['role-catalog', workspaceId] }); onSaved(); setModal(undefined);
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'No se pudo guardar el rol.'); }
    finally { setBusy(false); }
  }
  const roleButton = (role: CatalogRole) => <button key={role.id} type="button" className={`role-choice ${selected?.id === role.id ? 'selected' : ''}`} onClick={() => setSelectedId(role.id)}>
    <ShieldCheck size={18} /><span><strong>{roleLabel(role)}</strong><small>{role.isSystem ? 'Predefinido' : 'Personalizado'} · {role._count.members} personas</small></span>
  </button>;
  return <section className="page product-page">
    <header className="product-heading"><div><p className="eyebrow">Administración</p><h1>Roles y permisos</h1><p>Define qué puede hacer cada persona. Asígnale su rol desde Personas.</p></div><Button variant="primary" icon={<Plus size={17} />} onClick={() => open('create')}>Crear rol</Button></header>
    {query.isLoading && <LoadingState label="Cargando roles…" rows={4} />}
    {query.error && <div className="form-error" role="alert">{query.error.message}<Button onClick={() => void query.refetch()}>Reintentar</Button></div>}
    {selected && <div className="roles-workbench">
      <aside className="role-list" aria-label="Roles disponibles">{mainRoles.map(roleButton)}{legacy.length > 0 && <details><summary>Roles anteriores ({legacy.length})</summary><p>Se conservan para las personas que ya los usan.</p>{legacy.map(roleButton)}</details>}</aside>
      <article className="role-detail">
        <div className="role-detail-heading"><span className="product-icon"><ShieldCheck size={24} /></span><div><p className="eyebrow">{selected.isSystem ? 'Perfil predefinido' : 'Rol personalizado'}</p><h2>{roleLabel(selected)}</h2></div>{selected.isSystem && <span className="subtle-tag"><LockKeyhole size={13} /> Protegido</span>}</div>
        <p className="role-purpose">{selected.description || roleSummary(selected)}</p>
        <div className="scope-note"><strong>Dónde puede actuar</strong><p>{profile?.scope ?? (selected.permissions?.includes('workspace.manage') ? 'Toda la empresa, incluidos sus proyectos privados.' : 'Solo los proyectos y las tareas que se le comparten.')}</p></div>
        <h3>Acciones permitidas</h3>
        <ul className="permission-summary">{(profile?.actions ?? [roleSummary(selected)]).map(action => <li key={action}><Check size={16} />{action}</li>)}</ul>
        {profile && <><h3>Límites del rol</h3><ul className="role-limits">{profile.restrictions.map(item => <li key={item}>{item}</li>)}</ul></>}
        <div className="role-usage"><UsersRound size={18} /><span><strong>{selected._count.members} personas</strong><small>{selected._count.projectMembers} asignaciones en proyectos · {selected._count.invitations} invitaciones</small></span><Button size="sm" onClick={() => onPeople(selected.id)}>Ver personas</Button></div>
        <footer className="role-actions"><Button icon={<Copy size={16} />} onClick={() => open('create')}>Crear desde un perfil</Button>{!selected.isSystem && <><Button onClick={() => open('edit')}>Editar nombre y propósito</Button><Button variant="danger" aria-label={`Eliminar ${selected.name}`} title={selected.canDelete ? 'Eliminar rol sin uso' : 'Solo se eliminan roles sin asignaciones ni invitaciones'} disabled={!selected.canDelete} onClick={() => open('delete')}><Trash2 size={16} /></Button></>}</footer>
        <p className="muted-note">El área y la localidad delimitan el alcance. El puesto describe la función de la persona y no concede permisos.</p>
      </article>
    </div>}
    {modal && <Dialog title={modal === 'create' ? 'Crear un rol' : modal === 'edit' ? 'Editar rol' : 'Eliminar rol'} description={modal === 'create' ? 'Elige un nivel de acceso y dale un nombre claro para tu equipo.' : undefined} onClose={() => setModal(undefined)} busy={busy}>
      <form className="product-form" onSubmit={submit}>
        {modal !== 'delete' ? <>
          <label>Nombre del rol<input name="name" data-autofocus required minLength={3} maxLength={60} defaultValue={modal === 'edit' ? editingRole?.name : ''} placeholder="Ej. Coordinación de soporte" /></label>
          <label>Para qué se usará<textarea name="description" required minLength={10} maxLength={400} rows={2} defaultValue={modal === 'edit' ? editingRole?.description : ''} placeholder="Describe la responsabilidad que tendrá este grupo de personas." /></label>
          {modal === 'create' ? <fieldset><legend>Nivel de acceso</legend><div className="profile-picker">{profiles.map(item => <label key={item.id} className={profileId === item.id ? 'selected' : ''}><input type="radio" name="profileId" value={item.id} checked={profileId === item.id} onChange={() => setProfileId(item.id)} /><span><strong>{item.name}</strong><small>{item.summary}</small></span></label>)}</div>{chosenProfile && <div className="scope-note"><strong>{chosenProfile.name}: alcance y límites</strong><p>{chosenProfile.scope}</p><ul>{chosenProfile.restrictions.map(item => <li key={item}>{item}</li>)}</ul></div>}</fieldset> : <div className="scope-note">El nivel de acceso se conserva. Para cambiarlo, crea un rol con otro perfil y reasigna a las personas desde su ficha.</div>}
        </> : <p>Se eliminará «{editingRole?.name}». Este rol no tiene personas, proyectos ni invitaciones vinculadas.</p>}
        {error && <p className="form-error" role="alert">{error}</p>}
        <footer className="product-form-actions"><Button disabled={busy} onClick={() => setModal(undefined)}>Cancelar</Button><Button type="submit" variant={modal === 'delete' ? 'danger' : 'primary'} disabled={busy}>{busy ? 'Guardando…' : modal === 'create' ? 'Crear rol' : modal === 'edit' ? 'Guardar cambios' : 'Eliminar rol'}</Button></footer>
      </form>
    </Dialog>}
  </section>;
}
