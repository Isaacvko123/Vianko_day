import { useState, type FormEvent } from 'react';
import { Archive, ArrowUpRight, Building2, CalendarDays, FolderKanban, Lock, MoreHorizontal, Plus, Search, UsersRound, ArrowRight } from 'lucide-react';
import type { Area, Locality, Project } from '../types';
import { formatDate, initials } from '../lib/format';
import { Button, EmptyState, LoadingState } from './ui';
import { Dialog } from './ui/Dialog';
type ProjectsViewProps = {
  projects: Project[];
  onCompose?: (projectId: string) => void;
  currentAreaId?: string;
  currentLocalityId?: string;
  areas: Area[];
  localities: Locality[];
  activeProjectId?: string;
  isLoading: boolean;
  canCreateProjects: boolean;
  canDeleteProjects: boolean;
  onRefresh: () => void;
  onSelectProject: (projectId: string) => void;
  onCreateProject: (input: {
    areaId?: string;
    localityId?: string;
    name: string;
    description?: string;
    visibility: "WORKSPACE" | "PRIVATE";
    color?: string;
    startDate?: string;
    endDate?: string;
  }) => Promise<void>;
  onUpdateProject: (projectId: string, input: {
    areaId?: string;
    localityId?: string | null;
    expectedUpdatedAt?: string;
    name?: string;
    description?: string;
    visibility?: "WORKSPACE" | "PRIVATE";
    color?: string;
    startDate?: string | null;
    endDate?: string | null;
  }) => Promise<void>;
  onArchiveProject: (projectId: string) => Promise<void>;
};


const palette = ['#255ac4', '#334155', '#5278a5', '#76689b', '#3f7c80', '#a07840'];
export function ProjectsView({ projects, areas, localities, currentAreaId, currentLocalityId, isLoading, canCreateProjects, onSelectProject, onCreateProject, onUpdateProject, onArchiveProject, onCompose }: ProjectsViewProps) {
  const [search, setSearch] = useState('');
  const [areaFilter, setAreaFilter] = useState('');
  const [modal, setModal] = useState<'create' | 'edit' | 'archive'>();
  const [editing, setEditing] = useState<Project>();
  const [areaId, setAreaId] = useState('');
  const [localityId, setLocalityId] = useState('');
  const [visibility, setVisibility] = useState<'PRIVATE' | 'WORKSPACE'>('PRIVATE');
  const [color, setColor] = useState(palette[0]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  function open(project?: Project) {
    setEditing(project); setAreaId(project?.areaId ?? currentAreaId ?? areas[0]?.id ?? ''); setLocalityId(project?.localityId ?? currentLocalityId ?? '');
    setVisibility(project?.visibility ?? 'PRIVATE'); setColor(project?.color ?? palette[0]); setError(''); setModal(project ? 'edit' : 'create');
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError('');
    const form = new FormData(event.currentTarget);
    const read = (key: string) => String(form.get(key) ?? '').trim();
    try {
      if (modal === 'archive' && editing) await onArchiveProject(editing.id);
      else {
        const startDate = read('startDate'); const endDate = read('endDate');
        if (startDate && endDate && startDate > endDate) throw new Error('La entrega debe ser posterior al inicio.');
        const input = { name: read('name'), description: read('description'), areaId, visibility, color };
        if (editing) await onUpdateProject(editing.id, { ...input, localityId: localityId || null, startDate: startDate ? `${startDate}T00:00:00.000Z` : null, endDate: endDate ? `${endDate}T00:00:00.000Z` : null, expectedUpdatedAt: editing.updatedAt });
        else await onCreateProject({ ...input, localityId: localityId || undefined, startDate: startDate ? `${startDate}T00:00:00.000Z` : undefined, endDate: endDate ? `${endDate}T00:00:00.000Z` : undefined });
      }
      setModal(undefined);
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'No se pudo guardar el proyecto.'); }
    finally { setBusy(false); }
  }
  const shown = projects.filter(project => (!areaFilter || project.areaId===areaFilter) && `${project.name} ${project.description ?? ''} ${project.area?.name ?? ''}`.toLocaleLowerCase('es').includes(search.trim().toLocaleLowerCase('es')));
  return <section className="page product-page">
    <header className="product-heading"><div><p className="eyebrow">El trabajo de tu equipo</p><h1>Proyectos</h1><p>Un espacio para cada objetivo. Abre un proyecto para crear y organizar sus tareas.</p></div>{canCreateProjects && <Button variant="primary" icon={<Plus size={17} />} data-guide="projects-new" onClick={() => open()}>Crear proyecto</Button>}</header>
    <div className="day-projects-layout"><aside className="day-project-areas"><h2>Explorar</h2><button className={!areaFilter?'selected':''} onClick={()=>setAreaFilter('')}><FolderKanban size={16}/><span>Todos los proyectos</span><small>{projects.length}</small></button>{Array.from(new Map(projects.filter(project=>project.area).map(project=>[project.area!.id,project.area!])).values()).map(area=><button key={area.id} className={areaFilter===area.id?'selected':''} onClick={()=>setAreaFilter(area.id)}><Building2 size={16}/><span>{area.name}</span><small>{projects.filter(project=>project.areaId===area.id).length}</small></button>)}<p>Las tareas viven en un proyecto. Las personas reciben sus asignaciones en Mi trabajo.</p></aside><div className="day-projects-results"><div className="day-projects-search"><label className="day-search"><Search size={17}/><input aria-label="Buscar proyectos" placeholder="Buscar por nombre u objetivo…" value={search} onChange={event=>setSearch(event.target.value)}/></label><span>{shown.length} proyectos</span></div>
    {isLoading&&!projects.length&&<LoadingState label="Cargando proyectos…" rows={3}/>}
    <div className="day-project-cards">{shown.map(project=><article className="day-project-card" key={project.id}><header><span style={{background:project.color??'#255ac4'}}>{project.name.slice(0,1).toUpperCase()}</span><div><small>{project.area?.name??'Proyecto'}{project.locality&&` · ${project.locality.name}`}</small><button onClick={()=>onSelectProject(project.id)}>{project.name}</button></div>{project.permissions?.includes('project.update')&&<Button variant="ghost" size="sm" aria-label={`Configurar ${project.name}`} onClick={()=>open(project)}><MoreHorizontal size={18}/></Button>}</header><p>{project.description||'Un espacio para organizar tareas y trabajar en equipo.'}</p><div className="day-project-members"><div className="day-avatar-stack">{project.members?.slice(0,4).map(member=><span key={member.userId} title={member.user.name}>{initials(member.user.name)}</span>)}</div><small>{project.members?.length??0} {(project.members?.length??0)===1?'persona':'personas'}</small><span title={project.visibility==='PRIVATE'?'Solo participantes':'Compartido con su área'}>{project.visibility==='PRIVATE'?<Lock size={13}/>:<Building2 size={13}/>}</span></div>{project.endDate&&<div className="day-project-deadline"><CalendarDays size={14}/>Entrega {formatDate(project.endDate)}</div>}<footer>{onCompose&&project.permissions?.includes('task.create')&&<button onClick={()=>onCompose(project.id)}><Plus size={15}/>Crear tarea</button>}<button onClick={()=>onSelectProject(project.id)}>Abrir proyecto<ArrowRight size={15}/></button></footer></article>)}</div></div></div>
    {!isLoading && !shown.length && <EmptyState icon={<FolderKanban size={25} />} title={search ? 'No encontramos ese proyecto' : 'Tu próximo objetivo empieza aquí'} description={search ? 'Prueba con otro nombre o área.' : 'Crea un proyecto, incorpora a tu equipo y agrega su primera tarea.'} action={canCreateProjects && !search ? <Button variant="primary" onClick={() => open()}>Crear primer proyecto</Button> : undefined} />}
    {modal && <Dialog title={modal === 'create' ? 'Crear proyecto' : modal === 'archive' ? 'Archivar proyecto' : 'Configurar proyecto'} description={modal === 'archive' ? 'Dejará de aparecer en el trabajo activo del equipo.' : 'Define el objetivo y quién puede acceder.'} onClose={() => setModal(undefined)} busy={busy}>
      <form className="product-form" onSubmit={submit}>{modal === 'archive' ? <p>Se archivará «{editing?.name}» junto con sus tableros activos. Los registros se conservarán.</p> : <>
        <label>Nombre del proyecto<input name="name" data-autofocus required minLength={2} maxLength={160} defaultValue={editing?.name} placeholder="Ej. Apertura de nueva sucursal" /></label><label>Objetivo <span className="optional-label">Opcional</span><textarea name="description" maxLength={2000} rows={2} defaultValue={editing?.description} placeholder="¿Qué necesita lograr el equipo?" /></label>
        <div className="form-two-columns"><label>Área responsable<select required value={areaId} onChange={event => { setAreaId(event.target.value); setLocalityId(''); }}><option value="" disabled>Selecciona un área</option>{areas.map(area => <option key={area.id} value={area.id}>{area.name}</option>)}</select></label><label>Quién puede verlo<select value={visibility} onChange={event => setVisibility(event.target.value as 'PRIVATE' | 'WORKSPACE')}><option value="PRIVATE">Solo participantes</option><option value="WORKSPACE">Participantes y gerencia del área</option></select></label></div>
        <p className="scope-note">{visibility === 'PRIVATE' ? 'Solo las personas incorporadas al proyecto y administración pueden acceder.' : 'Además del equipo del proyecto, puede acceder la gerencia de esta área dentro de sus localidades.'} Los externos siempre necesitan una invitación al proyecto.</p>
        <details className="form-details"><summary>Fechas, localidad y color <span>Opcional</span></summary><div className="form-two-columns"><label>Inicio<input name="startDate" type="date" defaultValue={editing?.startDate?.slice(0, 10)} /></label><label>Entrega<input name="endDate" type="date" defaultValue={editing?.endDate?.slice(0, 10)} /></label></div><label>Localidad<select value={localityId} onChange={event => setLocalityId(event.target.value)}><option value="">Toda el área</option>{localities.filter(locality => locality.areaId === areaId).map(locality => <option key={locality.id} value={locality.id}>{locality.name}</option>)}</select></label><fieldset><legend>Color del proyecto</legend><div className="color-options">{palette.map(value => <label key={value} style={{ background: value }} title={value}><input aria-label={`Color ${value}`} type="radio" name="color" checked={color === value} onChange={() => setColor(value)} /></label>)}</div></fieldset></details>
      </>}{error && <p className="form-error" role="alert">{error}</p>}<footer className="product-form-actions">{modal === 'edit' && editing?.permissions?.includes('project.delete') && <Button variant="ghost" icon={<Archive size={16} />} onClick={() => { setError(''); setModal('archive'); }}>Archivar</Button>}<Button disabled={busy} onClick={() => setModal(undefined)}>Cancelar</Button><Button type="submit" variant={modal === 'archive' ? 'danger' : 'primary'} disabled={busy}>{busy ? 'Guardando…' : modal === 'create' ? 'Crear proyecto' : modal === 'archive' ? 'Archivar proyecto' : 'Guardar cambios'}</Button></footer></form>
    </Dialog>}
  </section>;
}
