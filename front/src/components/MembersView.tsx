import { useMemo, useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Check, Copy, Plus, ArrowRight, MapPin, MailPlus, Search, ShieldCheck, UsersRound } from 'lucide-react';
import type { Area, Locality, Position, Project, Role, UserType, WorkspaceMember } from '../types';
import { initials } from '../lib/format';
import { availableRoles, roleLabel, roleSummary } from '../lib/roles';
import { Button, EmptyState, LoadingState } from './ui';
import { Dialog } from './ui/Dialog';
import { InvitationsList } from './InvitationsList';
import { useQueryClient } from '@tanstack/react-query';
export type MembersViewProps = {
  token: string;
  workspaceId: string;
  workspacePermissions: string[];
  currentUserId: string;
  currentAreaId?: string;
  currentLocalityIds: string[];
  onRoles?: () => void;
  onAssign?: (userId: string) => void;
  members: WorkspaceMember[];
  pendingMembers: WorkspaceMember[];
  roles: Role[];
  areas: Area[];
  localities: Locality[];
  positions: Position[];
  projects: Project[];
  isLoading: boolean;
  onRefresh: () => void;
  onInviteUser: (input: {
    email: string;
    userType: UserType;
    roleId?: string;
    areaId?: string;
    localityId?: string;
    localityIds?: string[];
    positionId?: string;
    projectId?: string;
    expiresInDays: number;
  }) => Promise<string>;
  onCreateArea: (input: { name: string; description?: string }) => Promise<void>;
  onCreateLocality: (input: { areaId?: string; name: string; code: string; description?: string }) => Promise<void>;
  onCreatePosition: (input: {
    areaId?: string;
    name: string;
    description?: string;
    isManager: boolean;
  }) => Promise<void>;
  onApproveMember: (input: {
    memberId: string;
    roleId?: string;
    areaId?: string;
    localityId?: string;
    localityIds?: string[];
    positionId?: string | null;
    userType?: UserType;
  }) => Promise<void>;
  onUpdateMember: (input: {
    memberId: string;
    expectedUpdatedAt?: string;
    roleId?: string;
    areaId?: string;
    localityId?: string;
    localityIds?: string[];
    positionId?: string | null;
    userType?: UserType;
  }) => Promise<void>;
};


export function MembersView(props: MembersViewProps) {
  const { members, pendingMembers, roles, areas, localities, positions, projects, currentUserId, workspacePermissions, currentAreaId, currentLocalityIds } = props;
  const queryClient = useQueryClient();
  const [params, setParams] = useSearchParams();
  const [search, setSearch] = useState('');
  const [panel, setPanel] = useState<'active' | 'pending' | 'invitations'>('active');
  const [modal, setModal] = useState<'invite' | 'edit' | 'approve'>();
  const [member, setMember] = useState<WorkspaceMember>();
  const [type, setType] = useState<UserType>('INTERNAL');
  const [roleId, setRoleId] = useState('');
  const [areaId, setAreaId] = useState('');
  const [localityIds, setLocalityIds] = useState<string[]>([]);
  const [positionId, setPositionId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [inviteUrl, setInviteUrl] = useState('');
  const [copied, setCopied] = useState(false);
  const [step, setStep] = useState(0);
  const [email, setEmail] = useState('');
  const [inviteProject, setInviteProject] = useState('');
  const has = (key: string) => workspacePermissions.includes(key);
  const canManage = has('member.manage') || has('area.approve_members');
  const choices = availableRoles(roles, type, member?.roleId);
  const chosenRole = roles.find(role => role.id === roleId);
  const roleFilter = params.get('role') ?? '';
  const activeMembers = members.filter(item => item.status === 'ACTIVE');
  const shown = useMemo(() => (panel === 'pending' ? pendingMembers : activeMembers).filter(item =>
    (!roleFilter || item.roleId === roleFilter) && `${item.user.name} ${item.user.email} ${item.area?.name ?? ''}`.toLocaleLowerCase('es').includes(search.trim().toLocaleLowerCase('es'))), [panel, pendingMembers, activeMembers, roleFilter, search]);
  function open(next: typeof modal, item?: WorkspaceMember) {
    setMember(item); setType(item?.userType ?? 'INTERNAL'); setAreaId(item?.areaId ?? currentAreaId ?? areas[0]?.id ?? '');
    setRoleId(item?.roleId ?? roles.find(role => role.name === 'Colaborador')?.id ?? '');
    setLocalityIds(item ? item.localityScopes?.map(scope => scope.localityId) ?? (item.localityId ? [item.localityId] : []) : currentLocalityIds);
    setPositionId(item?.positionId ?? ''); setError(''); setInviteUrl(''); setCopied(false); setStep(next === 'invite' ? 0 : 1); setEmail(item?.user.email ?? ''); setInviteProject(''); setModal(next);
  }
  function changeType(next: UserType) {
    setType(next);
    const safe = availableRoles(roles, next, member?.roleId);
    if (!safe.some(role => role.id === roleId)) setRoleId(safe.find(role => role.name === (next === 'EXTERNAL' ? 'Invitado externo' : 'Colaborador'))?.id ?? safe[0]?.id ?? '');
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError('');
    if (step < 2) { setStep(step + 1); return; }
    setBusy(true);
    try {
      if (!areaId || !roleId) throw new Error('Selecciona un área y un rol para continuar.');
      const input = { userType: type, roleId, areaId, localityIds, positionId: positionId || null };
      if (modal === 'invite') {
        const token = await props.onInviteUser({ ...input, positionId: positionId || undefined, email: email.trim(), expiresInDays: 7,
          projectId: inviteProject || undefined });
        void queryClient.invalidateQueries({ queryKey: ["invitations", props.workspaceId] });
        setInviteUrl(`${window.location.origin}/join?token=${encodeURIComponent(token)}`);
      } else if (member) {
        if (modal === 'approve') await props.onApproveMember({ ...input, memberId: member.id });
        else await props.onUpdateMember({ ...input, memberId: member.id, expectedUpdatedAt: member.updatedAt });
        setModal(undefined);
      }
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'No se pudo guardar el acceso.'); }
    finally { setBusy(false); }
  }
  return <section className="page product-page">
    <header className="product-heading"><div><p className="eyebrow">Equipo</p><h1>Personas</h1><p>Invita a tu equipo y asigna a cada persona un rol y un área.</p></div>{has('workspace.invite_users') && <Button variant="primary" icon={<MailPlus size={17} />} onClick={() => open('invite')}>Invitar persona</Button>}</header>
    <div className="product-toolbar"><div className="product-tabs" aria-label="Estado de personas"><button className={panel === 'active' ? 'active' : ''} onClick={() => setPanel('active')}>Equipo <span>{activeMembers.length}</span></button>{has('workspace.invite_users') && <button className={panel === 'invitations' ? 'active' : ''} onClick={() => setPanel('invitations')}>Invitaciones</button>}{canManage && <button className={panel === 'pending' ? 'active' : ''} onClick={() => setPanel('pending')}>Por aprobar <span>{pendingMembers.length}</span></button>}</div>{props.onRoles && <Button variant="ghost" icon={<ShieldCheck size={16} />} onClick={props.onRoles}>Gestionar roles</Button>}</div>
    {panel !== "invitations" && <><div className="product-filters"><label className="search-field"><Search size={17} /><input aria-label="Buscar personas" placeholder="Buscar por nombre, correo o área…" value={search} onChange={event => setSearch(event.target.value)} /></label><select aria-label="Filtrar por rol" value={roleFilter} onChange={event => { const next = new URLSearchParams(params); if (event.target.value) next.set('role', event.target.value); else next.delete('role'); setParams(next); }}><option value="">Todos los roles</option>{roles.map(role => <option key={role.id} value={role.id}>{roleLabel(role)}</option>)}</select></div>
    {props.isLoading && !members.length ? <LoadingState label="Cargando personas…" rows={4} /> : <div className="day-people-grid">
      {shown.map(item => <article className="day-person-card" key={item.id}>
        <header><span className="person-avatar">{initials(item.user.name)}</span><span className={`day-member-badge ${item.userType === 'EXTERNAL' ? 'external' : ''}`}>{item.userType === 'EXTERNAL' ? 'Invitado' : 'Equipo interno'}</span></header>
        <h2>{item.user.name}{item.userId === currentUserId && <small> Tú</small>}</h2><p>{item.user.email}</p>
        <dl><div><dt><ShieldCheck size={14} />Rol</dt><dd>{roleLabel(item.role)}</dd></div><div><dt><UsersRound size={14} />Área</dt><dd>{item.area?.name ?? 'Por definir'}</dd></div><div><dt><MapPin size={14} />Localidad</dt><dd>{item.localityScopes?.map(scope => scope.locality.name).join(', ') || item.locality?.name || 'Toda el área'}</dd></div></dl>
        <footer>{props.onAssign && panel === 'active' && <Button variant="ghost" size="sm" icon={<Plus size={15} />} onClick={() => props.onAssign?.(item.userId)}>Asignar tarea</Button>}{canManage && item.userId !== currentUserId && (has('workspace.manage') || !item.roleId || roles.some(role => role.id === item.roleId)) && <Button size="sm" onClick={() => open(panel === 'pending' ? 'approve' : 'edit', item)}>{panel === 'pending' ? 'Revisar acceso' : 'Editar acceso'}</Button>}</footer>
      </article>)}
      {!props.isLoading && !shown.length && <EmptyState icon={<UsersRound size={24} />} title={panel === 'pending' ? 'No hay accesos por aprobar' : 'No encontramos personas'} description={panel === 'pending' ? 'Las nuevas solicitudes aparecerán aquí para que revises su rol y área.' : 'Prueba otro nombre o quita el filtro de rol.'} />}
    </div>}
    </>}{panel === "invitations" && <InvitationsList token={props.token} workspaceId={props.workspaceId} />}
    {modal && <Dialog title={inviteUrl ? 'Invitación lista' : modal === 'invite' ? 'Invitar a una persona' : modal === 'approve' ? 'Aprobar acceso' : 'Editar acceso'} description={inviteUrl ? 'Comparte el enlace directamente con la persona invitada.' : member ? `${member.user.name} · ${member.user.email}` : 'Un correo, un rol y un área. El acceso queda definido desde el inicio.'} onClose={() => setModal(undefined)} busy={busy}>
      {inviteUrl ? <div className="product-form"><div className="success-note"><Check size={20} /><span>El enlace caduca en 7 días. La persona creará su contraseña al ingresar.</span></div><label>Enlace de invitación<input readOnly aria-label="Enlace de invitación" value={inviteUrl} onFocus={event => event.target.select()} /></label>{error && <p role="alert" className="form-error">{error}</p>}<footer className="product-form-actions"><Button onClick={() => setModal(undefined)}>Listo</Button><Button variant="primary" icon={<Copy size={16} />} onClick={async () => { try { await navigator.clipboard.writeText(inviteUrl); setCopied(true); } catch { setError('Selecciona y copia el enlace del campo.'); } }}>{copied ? 'Copiado' : 'Copiar enlace'}</Button></footer></div> : <form className="product-form" onSubmit={submit}>
        <ol className="day-form-steps">{['Persona', 'Responsabilidad', 'Confirmar acceso'].map((label,index) => <li key={label} className={step===index?'current':step>index?'complete':''}><span>{index+1}</span>{label}</li>)}</ol>
        {step === 0 && <><label>Correo de la persona<input data-autofocus type="email" required value={email} onChange={event => setEmail(event.target.value)} placeholder="nombre@empresa.com" /></label><fieldset className="day-access-choice"><legend>¿Cómo participará?</legend><label><input type="radio" name="userType" checked={type==='INTERNAL'} onChange={() => changeType('INTERNAL')} /><strong>Parte del equipo</strong><span>Trabaja en un área de la empresa.</span></label><label><input type="radio" name="userType" checked={type==='EXTERNAL'} onChange={() => changeType('EXTERNAL')} /><strong>Invitado externo</strong><span>Colabora únicamente en un proyecto compartido.</span></label></fieldset></>}
        {step === 1 && <><label>¿Qué puede hacer?<select value={roleId} required onChange={event => setRoleId(event.target.value)}><option value="" disabled>Selecciona un rol</option>{choices.map(role => <option key={role.id} value={role.id}>{roleLabel(role)}</option>)}</select></label><div className="scope-note"><strong>{chosenRole && roleLabel(chosenRole)}</strong><p>{chosenRole && roleSummary(chosenRole)}</p></div>
        <label>¿En qué área trabaja?<select value={areaId} required onChange={event => { setAreaId(event.target.value); setLocalityIds([]); setPositionId(''); }}><option value="" disabled>Selecciona un área</option>{areas.map(area => <option key={area.id} value={area.id}>{area.name}</option>)}</select></label>
        {modal === 'invite' && type === 'EXTERNAL' && <label>Proyecto que podrá consultar<select required value={inviteProject} onChange={event => setInviteProject(event.target.value)}><option value="" disabled>Selecciona un proyecto</option>{projects.map(project => <option key={project.id} value={project.id}>{project.name}</option>)}</select></label>}
        <details className="form-details" open={localityIds.length>0||undefined}><summary>Precisar localidades y puesto</summary><fieldset><legend>Localidades permitidas</legend><p className="muted-note">Sin selección: toda el área. El alcance debe estar dentro de las localidades que puedes administrar.</p><div className="checkbox-options">{localities.filter(locality => locality.areaId===areaId).map(locality => <label key={locality.id}><input type="checkbox" checked={localityIds.includes(locality.id)} onChange={event => setLocalityIds(current => event.target.checked ? [...current,locality.id] : current.filter(id => id!==locality.id))} />{locality.name}</label>)}</div></fieldset><label>Puesto<select value={positionId} onChange={event => setPositionId(event.target.value)}><option value="">Sin puesto</option>{positions.filter(position => position.areaId===areaId).map(position => <option key={position.id} value={position.id}>{position.name}</option>)}</select><small>El puesto describe su función. El rol define sus permisos.</small></label></details></>}
        {step === 2 && <section className="day-access-review"><span className="person-avatar">{initials(member?.user.name ?? email)}</span><h3>{member?.user.name ?? email}</h3><p>{modal==='invite'?'Recibirá este acceso al aceptar la invitación.':'Su acceso quedará definido así.'}</p><dl><div><dt>Tipo</dt><dd>{type==='INTERNAL'?'Equipo interno':'Invitado externo'}</dd></div><div><dt>Rol</dt><dd>{chosenRole&&roleLabel(chosenRole)}</dd></div><div><dt>Área</dt><dd>{areas.find(area=>area.id===areaId)?.name}</dd></div><div><dt>Localidades</dt><dd>{localityIds.length?localities.filter(locality=>localityIds.includes(locality.id)).map(locality=>locality.name).join(', '):'Toda el área'}</dd></div>{inviteProject&&<div><dt>Proyecto</dt><dd>{projects.find(project=>project.id===inviteProject)?.name}</dd></div>}</dl><div className="scope-note"><p>{chosenRole&&roleSummary(chosenRole)}</p>{type==='EXTERNAL'&&<p>Sin acceso a la administración, el directorio de personas ni los comentarios internos.</p>}</div></section>}
        {error && <p className="form-error" role="alert">{error}</p>}
        <footer className="product-form-actions"><Button disabled={busy} onClick={() => step > (modal==='invite'?0:1) ? setStep(step-1) : setModal(undefined)}>{step > (modal==='invite'?0:1)?'Atrás':'Cancelar'}</Button><Button type="submit" variant="primary" disabled={busy || (step>0&&!choices.length)}>{busy?'Guardando…':step<2?'Continuar':modal==='invite'?'Crear invitación':modal==='approve'?'Aprobar acceso':'Guardar acceso'}{step<2&&<ArrowRight size={16}/>}</Button></footer>
      </form>}
    </Dialog>}
  </section>;
}
