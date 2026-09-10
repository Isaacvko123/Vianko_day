import { useEffect, useState, type FormEvent } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowRight, Check, Plus, Search, UsersRound } from 'lucide-react';
import { createTask, createStaffingRequest, getProject } from '../api/endpoints';
import { apiRequest } from '../api/http';
import type { Area, Project, TaskPriority } from '../types';
import { initials } from '../lib/format';
import { Button } from './ui';
import { Dialog } from './ui/Dialog';
export type TaskPerson = { id: string; name: string; area?: string; position?: string; inProject: boolean; external: boolean };
export type ComposeOptions = { projectId?: string; statusId?: string; assigneeId?: string };
export function TaskComposer({ token, projects, initial, currentUserId, onClose, onCreated }: {
  token: string; projects: Project[]; initial: ComposeOptions; currentUserId: string;
  onClose: () => void; onCreated: (projectId: string, taskId: string) => void;
}) {
  const available = projects.filter(project => project.permissions?.includes('task.create'));
  const [projectId, setProjectId] = useState(available.find(project => project.id === initial.projectId)?.id ?? available[0]?.id ?? '');
  const [boardId, setBoardId] = useState('');
  const [selected, setSelected] = useState<string[]>(initial.assigneeId ? [initial.assigneeId] : []);
  const [search, setSearch] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [supportOpen, setSupportOpen] = useState(false);
  const [supportArea, setSupportArea] = useState('');
  const [supportNote, setSupportNote] = useState('');
  const [supportBusy, setSupportBusy] = useState(false);
  const [supportSent, setSupportSent] = useState(false);
  const [supportError, setSupportError] = useState('');
  const client = useQueryClient();
  const context = useQuery({ queryKey: ['quick-project', projectId], queryFn: () => getProject(token, projectId), enabled: Boolean(projectId) });
  const project = context.data?.project;
  const supportCatalog = useQuery({ queryKey: ['staffing-catalog', project?.workspaceId], queryFn: () => apiRequest<{areas: Area[]}>(`/staffing-requests/catalog?workspaceId=${project?.workspaceId}`, {token}), enabled: Boolean(supportOpen && project?.workspaceId) });
  async function requestSupport() {
    if (!supportArea || supportBusy) return;
    setSupportBusy(true); setSupportError('');
    try { await createStaffingRequest(token, {projectId, targetAreaId: supportArea, quantity: 1, note: supportNote.trim() || undefined}); setSupportSent(true); await client.invalidateQueries({queryKey:['workspace',project?.workspaceId,'management']}); }
    catch (failure) { setSupportError(failure instanceof Error ? failure.message : 'No se pudo enviar la solicitud.'); }
    finally { setSupportBusy(false); }
  }
  const canAssign = project?.permissions?.includes('task.assign');
  const people = useQuery({ queryKey: ['task-people', projectId], queryFn: () => apiRequest<{ people: TaskPerson[] }>(`/projects/${projectId}/task-people`, { token }), enabled: Boolean(projectId && canAssign) });
  useEffect(() => { if (people.data) setSelected(previous => previous.filter(id => people.data.people.some(person => person.id === id))); }, [people.data]);
  const board = project?.boards?.find(item => item.id === boardId) ?? project?.boards?.[0];
  const shown = (people.data?.people ?? []).filter(person => `${person.name} ${person.area ?? ''}`.toLocaleLowerCase('es').includes(search.toLocaleLowerCase('es')));
  function toggle(id: string) { setSelected(previous => previous.includes(id) ? previous.filter(item => item !== id) : [...previous, id]); }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!board || busy) return;
    const form = new FormData(event.currentTarget); const title = String(form.get('title') ?? '').trim();
    if (!title) { setError('Escribe qué hay que hacer.'); return; }
    setBusy(true); setError('');
    try {
      const date = String(form.get('dueAt') ?? '');
      const status = board.statuses.find(item => item.id === initial.statusId && !item.countsAsDone && item.category !== 'CANCELLED');
      const { task } = await createTask(token, { boardId: board.id, statusId: status?.id, title, description: String(form.get('description') ?? '').trim() || undefined,
        priority: String(form.get('priority') ?? 'MEDIUM') as TaskPriority, dueAt: date ? new Date(`${date}T12:00:00`).toISOString() : undefined, assigneeIds: canAssign ? selected : [] });
      await Promise.all([client.invalidateQueries({ queryKey: ['work-items'] }), client.invalidateQueries({ queryKey: ['project', projectId] }), client.invalidateQueries({ queryKey: ['quick-project', projectId] }), client.invalidateQueries({ queryKey: ['task-people', projectId] })]);
      onCreated(projectId, task.id);
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'No se pudo crear la tarea. Tu información sigue aquí.'); } finally { setBusy(false); }
  }
  return <Dialog title="¿Qué hay que hacer?" description="Define la tarea, elige a las personas y listo." busy={busy || supportBusy} onClose={onClose}>
    <form className="task-composer" onSubmit={submit}><fieldset disabled={busy || supportBusy}>
      <input className="composer-title" aria-label="Nombre de la tarea" name="title" autoComplete="off" data-autofocus required minLength={2} maxLength={240} placeholder="Escribe una tarea concreta…" />
      <div className="composer-destination"><label>Proyecto<select required value={projectId} onChange={event => { setProjectId(event.target.value); setSelected([]); setBoardId(''); setError(''); setSupportOpen(false); setSupportSent(false); setSupportArea(''); setSupportNote(''); }}><option value="" disabled>Elige un proyecto</option>{available.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>{(project?.boards?.length ?? 0) > 1 && <label>Tablero<select value={board?.id ?? ''} onChange={event => setBoardId(event.target.value)}>{project?.boards?.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>}<label>Entrega <small>Opcional</small><input type="date" name="dueAt" /></label></div>
      {canAssign && <section className="composer-people"><header><h3><UsersRound size={17} />¿Quién lo hace?{selected.length > 0 && <span>{selected.length}</span>}</h3>{people.data?.people.some(person => person.id === currentUserId) && <button type="button" onClick={() => toggle(currentUserId)}>{selected.includes(currentUserId) ? 'Quitarme' : 'Asignarme'}</button>}</header>
        <label className="composer-search"><Search size={16} /><input aria-label="Buscar responsable" placeholder="Busca una persona de tu equipo…" value={search} onChange={event => setSearch(event.target.value)} /></label>
        <div className="composer-roster">{shown.map(person => <button type="button" aria-pressed={selected.includes(person.id)} key={person.id} className={selected.includes(person.id) ? 'selected' : ''} onClick={() => toggle(person.id)}><span className="person-avatar">{initials(person.name)}</span><span><strong>{person.name}</strong><small>{person.external ? 'Invitado al proyecto' : person.position ?? person.area ?? 'Equipo'}{!person.inProject ? ' · Se incorporará al proyecto' : ''}</small></span><span className="person-check">{selected.includes(person.id) ? <Check size={14} /> : <Plus size={14} />}</span></button>)}</div>
        {people.isLoading && <p className="composer-hint">Cargando personas…</p>}{!people.isLoading && !people.error && !shown.length && <p className="composer-hint">No hay personas que coincidan.</p>}
        <p className="composer-hint">{selected.length ? 'Las personas seleccionadas recibirán una notificación.' : 'Puedes crearla sin responsable y asignarla después.'}</p>
        {project?.permissions?.includes('project.request_staffing') && <button className="composer-support" type="button" onClick={() => setSupportOpen(!supportOpen)}>Solicitar una persona de otra área<ArrowRight size={16} /></button>}
        {supportOpen && <div className="composer-support-form">{supportSent ? <p className="success-note"><Check size={17}/>Solicitud enviada. El área elegirá una persona; podrás asignarla cuando aprueben el apoyo.</p> : <><h4>Solicitar una persona</h4><p>Tu tarea se conserva mientras pides apoyo.</p><label>Área que puede apoyar<select value={supportArea} onChange={event => setSupportArea(event.target.value)}><option value="">Elige el área</option>{supportCatalog.data?.areas.filter(area=>area.id!==project?.areaId).map(area=><option key={area.id} value={area.id}>{area.name}</option>)}</select></label><label>Para qué necesitas apoyo<textarea rows={2} value={supportNote} onChange={event=>setSupportNote(event.target.value)} maxLength={2000}/></label>{(supportError||supportCatalog.error)&&<p className="form-error">{supportError||supportCatalog.error?.message}</p>}<Button disabled={!supportArea||supportBusy} onClick={()=>void requestSupport()}>{supportBusy?'Enviando…':'Enviar solicitud de apoyo'}</Button></>}</div>}
      </section>}
      <details className="composer-details"><summary>Agregar descripción y prioridad</summary><label>Descripción<textarea name="description" rows={3} maxLength={10000} placeholder="Contexto, resultado esperado o instrucciones…" /></label><label>Prioridad<select name="priority" defaultValue="MEDIUM"><option value="LOW">Baja</option><option value="MEDIUM">Normal</option><option value="HIGH">Alta</option><option value="URGENT">Urgente</option></select></label></details>
    </fieldset>
    {(error || context.error || people.error) && <p className="form-error" role="alert">{error || context.error?.message || people.error?.message}</p>}
    {!available.length && <p className="composer-hint">Primero crea un proyecto o solicita acceso a uno.</p>}
    <footer><span>{selected.length ? `${selected.length} ${selected.length === 1 ? 'responsable' : 'responsables'}` : 'Sin responsable'}</span><Button disabled={busy || supportBusy} onClick={onClose}>Cancelar</Button><Button variant="primary" type="submit" disabled={busy || supportBusy || !board || context.isFetching || people.isFetching}>{busy ? 'Creando…' : selected.length ? 'Crear y asignar' : 'Crear tarea'}<ArrowRight size={16} /></Button></footer>
    </form>
  </Dialog>;
}
