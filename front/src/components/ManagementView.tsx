import { useEffect, useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ArrowRight, CheckCircle2, ChevronLeft, ChevronRight, Network, Plus } from 'lucide-react';
import type { Area, Locality, PaginationMeta, Position, Project, Role, StaffingRequest, StaffingRequestStatus, WorkspaceMember } from '../types';
import { formatDate } from '../lib/format';
import { Button, EmptyState, LoadingState } from './ui';
import { Dialog } from './ui/Dialog';
type StaffingPageStatus = "PENDING" | "APPROVED" | "REJECTED";

type ManagementViewProps = {
  staffingRequests: StaffingRequest[];
  staffingPagination: Partial<Record<StaffingRequestStatus, PaginationMeta>>;
  staffingPages: Record<StaffingPageStatus, number>;
  staffingPageSize: number;
  projects: Project[];
  members: WorkspaceMember[];
  areas: Area[];
  localities: Locality[];
  positions: Position[];
  roles: Role[];
  currentAreaId?: string;
  canAnswerAllRequests: boolean;
  isLoading: boolean;
  onRefresh: () => void;
  onCreateStaffingRequest: (input: {
    projectId: string;
    targetAreaId: string;
    targetLocalityId?: string;
    positionId?: string;
    roleId?: string;
    requestedUserId?: string;
    quantity: number;
    note?: string;
  }) => Promise<void>;
  onApproveStaffingRequest: (input: {
    requestId: string;
    approvedUserIds: string[];
    responseNote?: string;
  }) => Promise<void>;
  onRejectStaffingRequest: (input: {
    requestId: string;
    responseNote?: string;
  }) => Promise<void>;
  onPageChange: (status: StaffingPageStatus, page: number) => void;
};


const labels = { PENDING: 'Pendientes', APPROVED: 'Aprobadas', REJECTED: 'Rechazadas' };
export function ManagementView({ staffingRequests, staffingPagination, staffingPages, projects, members, areas, localities, positions, isLoading, onCreateStaffingRequest, onApproveStaffingRequest, onRejectStaffingRequest, onPageChange }: ManagementViewProps) {
  const [params, setParams] = useSearchParams();
  const [status, setStatus] = useState<StaffingPageStatus>('PENDING');
  const [modal, setModal] = useState<'create' | 'respond'>();
  const [request, setRequest] = useState<StaffingRequest>();
  const [projectId, setProjectId] = useState(params.get('project') ?? '');
  const [targetAreaId, setTargetAreaId] = useState('');
  const [targetLocalityId, setTargetLocalityId] = useState('');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [decision, setDecision] = useState<'approve' | 'reject'>('approve');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const requestProjects = projects.filter(project => project.permissions?.includes('project.request_staffing'));
  const project = projects.find(item => item.id === projectId);
  useEffect(() => { if (params.get('create') === '1') { setModal('create'); setProjectId(params.get('project') ?? requestProjects[0]?.id ?? ''); } }, [params]);
  const linkedId = params.get('request');
  const linked = staffingRequests.find(item => item.id === linkedId);
  useEffect(() => { if (linked && linked.status !== 'CANCELLED') setStatus(linked.status); }, [linkedId, linked?.status]);
  function close() { setModal(undefined); if (params.has('create')) { const next = new URLSearchParams(params); next.delete('create'); setParams(next, { replace: true }); } }
  const rows = staffingRequests.filter(item => item.status === status);
  const meta = staffingPagination[status]; const page = staffingPages[status]; const pages = Math.max(1, Math.ceil((meta?.total ?? 0) / (meta?.limit || 8)));
  const candidates = request ? members.filter(member => member.status === 'ACTIVE' && member.userType === 'INTERNAL' && member.areaId === request.targetAreaId && (!request.positionId || member.positionId === request.positionId) && (!request.targetLocalityId || member.localityId === request.targetLocalityId || member.localityScopes?.some(scope => scope.localityId === request.targetLocalityId))) : [];
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(''); const form = new FormData(event.currentTarget);
    const read = (name: string) => String(form.get(name) ?? '').trim();
    try {
      if (modal === 'create') {
        await onCreateStaffingRequest({ projectId, targetAreaId, targetLocalityId: targetLocalityId || undefined, positionId: read('positionId') || undefined, quantity: Number(read('quantity')), note: read('note') || undefined });
        setStatus('PENDING');
      } else if (request) {
        if (decision === 'approve') { if (!selectedIds.length || selectedIds.length > request.quantity) throw new Error(`Selecciona entre 1 y ${request.quantity} personas.`); await onApproveStaffingRequest({ requestId: request.id, approvedUserIds: selectedIds, responseNote: read('responseNote') || undefined }); }
        else await onRejectStaffingRequest({ requestId: request.id, responseNote: read('responseNote') });
      }
      close();
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'No se pudo guardar la solicitud.'); }
    finally { setBusy(false); }
  }
  return <section className="page product-page">
    <header className="product-heading"><div><p className="eyebrow">Colaboración entre áreas</p><h1>Solicitudes de apoyo</h1><p>Pide personas para un proyecto. El responsable del área elige quién puede apoyar.</p></div>{requestProjects.length > 0 && <Button variant="primary" icon={<Plus size={17} />} onClick={() => { setError(''); setProjectId(requestProjects[0]?.id ?? ''); setTargetAreaId(''); setTargetLocalityId(''); setModal('create'); }}>Pedir apoyo</Button>}</header>
    <div className="request-flow"><span><i>1</i> Solicitas apoyo</span><ArrowRight size={14} /><span><i>2</i> El área asigna personas</span><ArrowRight size={14} /><span><i>3</i> Se incorporan al proyecto</span></div>
    <div className="product-toolbar"><div className="product-tabs" aria-label="Estado de solicitudes">{(Object.keys(labels) as StaffingPageStatus[]).map(value => <button key={value} className={status === value ? 'active' : ''} onClick={() => setStatus(value)}>{labels[value]}<span>{staffingPagination[value]?.total ?? 0}</span></button>)}</div></div>
    {isLoading && !staffingRequests.length && <LoadingState label="Cargando solicitudes…" rows={3} />}
    <div className="request-list">{rows.map(item => <article className={`request-card ${item.id === linkedId ? 'linked-request' : ''}`} key={item.id} id={`request-${item.id}`}><span className="request-icon"><Network size={20} /></span><div className="request-info"><div><h2>{item.project.name}</h2>{item.canRespond && <span className="subtle-tag attention-tag">Requiere tu respuesta</span>}</div><p>{item.quantity} {item.quantity === 1 ? 'persona de' : 'personas de'} <strong>{item.targetArea.name}</strong>{item.targetLocality && ` · ${item.targetLocality.name}`}{item.position && ` · ${item.position.name}`}</p>{item.note && <p className="request-note">{item.note}</p>}<small>{item.requester.name} · {formatDate(item.createdAt)}</small>{item.status === 'APPROVED' && <div className="request-outcome"><CheckCircle2 size={15} /><span>{item.assignments.map(assignment => assignment.user.name).join(', ') || 'Personal incorporado'}</span></div>}{item.responseNote && <p className="request-note">Respuesta: {item.responseNote}</p>}</div>{item.canRespond && <Button size="sm" onClick={() => { setRequest(item); setSelectedIds([]); setDecision('approve'); setError(''); setModal('respond'); }}>Resolver</Button>}{item.status === 'PENDING' && !item.canRespond && <span className="waiting-label">Esperando al área</span>}</article>)}</div>
    {!isLoading && !rows.length && <EmptyState icon={<Network size={25} />} title={status === 'PENDING' ? 'No hay solicitudes pendientes' : `No hay solicitudes ${labels[status].toLowerCase()}`} description="Las solicitudes y sus respuestas quedan registradas aquí para darles seguimiento." />}
    {(meta?.total ?? 0) > 0 && <footer className="product-pagination"><span>{meta?.total} solicitudes</span><div><Button size="sm" aria-label="Página anterior" disabled={page <= 1 || isLoading} onClick={() => onPageChange(status, page - 1)}><ChevronLeft size={17} /></Button><span>Página {page} de {pages}</span><Button size="sm" aria-label="Página siguiente" disabled={page >= pages || isLoading} onClick={() => onPageChange(status, page + 1)}><ChevronRight size={17} /></Button></div></footer>}
    {modal && <Dialog title={modal === 'create' ? 'Pedir apoyo a otra área' : 'Resolver solicitud'} description={modal === 'create' ? 'El área destino recibirá la solicitud y decidirá a quién asignar.' : `${request?.project.name} · ${request?.quantity} personas solicitadas`} busy={busy} onClose={close}><form className="product-form" onSubmit={submit}>{modal === 'create' ? <>
      <label>Proyecto que necesita apoyo<select required value={projectId} onChange={event => { setProjectId(event.target.value); setTargetAreaId(''); setTargetLocalityId(''); }}><option value="" disabled>Selecciona un proyecto</option>{requestProjects.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
      <div className="form-two-columns"><label>Área a la que solicitas<select required value={targetAreaId} onChange={event => { setTargetAreaId(event.target.value); setTargetLocalityId(''); }}><option value="" disabled>Selecciona un área</option>{areas.filter(area => area.id !== project?.areaId).map(area => <option key={area.id} value={area.id}>{area.name}</option>)}</select></label><label>Personas necesarias<input name="quantity" type="number" min={1} max={25} required defaultValue={1} /></label></div>
      <label>Para qué necesitas apoyo<textarea name="note" rows={3} maxLength={2000} placeholder="Ej. Dos personas para el inventario de esta semana." /></label>
      <details className="form-details"><summary>Localidad y puesto <span>Opcional</span></summary><div className="form-two-columns"><label>Localidad<select disabled={!targetAreaId} value={targetLocalityId} onChange={event => setTargetLocalityId(event.target.value)}><option value="">Cualquier localidad</option>{localities.filter(item => item.areaId === targetAreaId).map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label>Puesto<select name="positionId" key={targetAreaId} disabled={!targetAreaId} defaultValue=""><option value="">Cualquier puesto</option>{positions.filter(item => item.areaId === targetAreaId).map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label></div></details>
    </> : <>
      {request?.note && <div className="scope-note"><strong>Motivo de la solicitud</strong>{request.note}</div>}
      <div className="product-tabs"><button type="button" className={decision === 'approve' ? 'active' : ''} onClick={() => setDecision('approve')}>Asignar apoyo</button><button type="button" className={decision === 'reject' ? 'active' : ''} onClick={() => setDecision('reject')}>Rechazar</button></div>
      {decision === 'approve' && <fieldset><legend>Selecciona hasta {request?.quantity} personas · {selectedIds.length} seleccionadas</legend><div className="staff-candidates">{candidates.map(member => <label key={member.id}><input type="checkbox" checked={selectedIds.includes(member.userId)} disabled={!selectedIds.includes(member.userId) && selectedIds.length >= (request?.quantity ?? 0)} onChange={event => setSelectedIds(ids => event.target.checked ? [...ids, member.userId] : ids.filter(id => id !== member.userId))} /><span><strong>{member.user.name}</strong><small>{member.position?.name ?? 'Colaborador'} · {member.locality?.name ?? 'Toda el área'}</small></span></label>)}</div>{!candidates.length && <p className="inline-empty">No hay personas disponibles que coincidan con el área, localidad y puesto solicitados.</p>}</fieldset>}
      <label>{decision === 'reject' ? 'Motivo del rechazo' : 'Nota de respuesta (opcional)'}<textarea name="responseNote" key={decision} required={decision === 'reject'} minLength={decision === 'reject' ? 2 : undefined} maxLength={2000} rows={2} /></label>
      {decision === 'approve' && <p className="scope-note">Las personas seleccionadas se incorporarán al proyecto con su rol actual. Después, la coordinación podrá asignarles tareas.</p>}
    </>}{error && <p className="form-error" role="alert">{error}</p>}<footer className="product-form-actions"><Button disabled={busy} onClick={close}>Cancelar</Button><Button type="submit" variant={modal === 'respond' && decision === 'reject' ? 'danger' : 'primary'} disabled={busy || (modal === 'respond' && decision === 'approve' && !selectedIds.length)}>{busy ? 'Guardando…' : modal === 'create' ? 'Enviar solicitud' : decision === 'approve' ? 'Asignar personas' : 'Rechazar solicitud'}</Button></footer></form></Dialog>}
  </section>;
}
