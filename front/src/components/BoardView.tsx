import { useSearchParams } from 'react-router-dom';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ArrowLeft, ArrowRight, CalendarDays, Check, ChevronRight, Columns3, List, MessageSquare, MoveHorizontal, Plus, Search, SlidersHorizontal, UsersRound, X } from 'lucide-react';
import type { Board, BoardMode, Project, Role, Task, TaskPriority, WorkspaceMember } from '../types';
import { Button, EmptyState, LoadingState } from './ui';
import { canMoveTask, defaultTaskFilters, filterAndSortTasks, isTaskDone, priorityLabels, taskStatusOptions } from '../lib/tasks';
import type { TaskFilters } from '../lib/tasks';
import { formatDate, getDueSummary, initials } from '../lib/format';
import { useCompactLayout } from '../hooks/useCompactLayout';
type BoardViewProps = {
  onProjects: () => void;
  chatPanel?: ReactNode;
  canUseChat?: boolean;
  onCompose: (options?: { statusId?: string; assigneeId?: string }) => void;
  onRequestStaffing?: () => void;
  projects: Project[];
  activeProject?: Project;
  activeBoard?: Board;
  boards: Board[];
  onBoardChange: (boardId: string) => void;
  canChangeTaskStatus: boolean;
  tasks: Task[];
  boardMode: BoardMode;
  isLoading: boolean;
  currentUserId: string;
  workspaceMembers: WorkspaceMember[];
  roles: Role[];
  canCreateTasks: boolean;
  canManageProjectMembers: boolean;
  canEditCompletedTasks: boolean;
  onRefresh: () => void;
  onProjectChange: (projectId: string) => void;
  onBoardModeChange: (mode: BoardMode) => void;
  onCreateTask: (input: {
    title: string;
    description?: string;
    priority: TaskPriority;
    startAt?: string;
    dueAt?: string;
    estimateMinutes?: number;
    statusId?: string;
    assigneeIds: string[];
  }) => Promise<void>;
  onAddProjectMember: (input: { projectId: string; userId: string; roleId?: string }) => Promise<void>;
  onTaskStatusChange: (taskId: string, statusId: string) => Promise<void>;
  onSelectTask: (taskId: string) => void;
  selectedTaskId?: string;
};

export function BoardView({ activeProject, activeBoard, projects, boards, onBoardChange, tasks, boardMode, onBoardModeChange, isLoading, currentUserId, canChangeTaskStatus, canEditCompletedTasks, canCreateTasks, onProjectChange, onTaskStatusChange, onSelectTask, selectedTaskId, onCompose, onRequestStaffing, chatPanel, canUseChat, onProjects }: BoardViewProps) {
  const [params,setParams]=useSearchParams();
  const [tab, setTab] = useState<'tasks' | 'people' | 'chat'>(()=>params.has('chat')&&canUseChat?'chat':'tasks');
  useEffect(()=>{if(params.has('chat')&&canUseChat)setTab('chat');else setTab(current=>current==='chat'?'tasks':current);},[params,canUseChat]);
  function goTab(next:'tasks'|'people'|'chat'){setTab(next);const query=new URLSearchParams(params);if(activeProject){query.set('project',activeProject.id);query.set('workspace',activeProject.workspaceId);}if(next==='chat'){query.set('chat','1');query.delete('task');query.delete('tab');query.delete('comment');}else query.delete('chat');setParams(query,{replace:true});}

  const [filters, setFilters] = useState<TaskFilters>(defaultTaskFilters);
  const compact = useCompactLayout();
  const [mobileMode, setMobileMode] = useState<BoardMode>('list');
  const mode = compact ? mobileMode : boardMode;
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState('');
  const filterCount = Number(filters.focus !== 'all') + Number(Boolean(filters.assigneeId));
  function changeMode(next: BoardMode) {
    if (compact) setMobileMode(next); else onBoardModeChange(next);
  }
  function clearFilters() { setFilters(defaultTaskFilters); setStatusFilter(''); }
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const pendingRef = useRef(new Set<string>());
  const [pending, setPending] = useState(new Set<string>());
  const [dragging, setDragging] = useState<string>();
  const [over, setOver] = useState<string>();
  const statuses = useMemo(() => [...(activeBoard?.statuses ?? [])].sort((a,b) => a.position-b.position), [activeBoard]);
  const mainTasks = tasks.filter(task => !task.parentTaskId || !tasks.some(parent => parent.id === task.parentTaskId));
  const shown = filterAndSortTasks(mainTasks, statuses, filters, currentUserId);
  const mobileTasks = statusFilter ? shown.filter(task => task.statusId === statusFilter) : shown;
  const members = activeProject?.members ?? [];
  async function move(task: Task, statusId: string) {
    if (pendingRef.current.has(task.id) || task.statusId === statusId) return;
    if (!task.capabilities?.allowedStatusIds.includes(statusId)) { setError('Tu rol no permite este cambio de estado.'); return; }
    pendingRef.current.add(task.id); setPending(new Set(pendingRef.current)); setError(''); setNotice('');
    try { await onTaskStatusChange(task.id, statusId); setNotice(`Tarea movida a ${statuses.find(status => status.id === statusId)?.name}.`); }
    catch (failure) { setError(failure instanceof Error ? failure.message : 'No se pudo mover la tarea.'); }
    finally { pendingRef.current.delete(task.id); setPending(new Set(pendingRef.current)); }
  }
  function card(task: Task) {
    const movable = canMoveTask(task, statuses, currentUserId, canChangeTaskStatus, canEditCompletedTasks);
    const late = getDueSummary(task.dueAt, isTaskDone(task, statuses)).tone === 'overdue';
    const assigned = task.assignees ?? [];
    return <article key={task.id} className={`day-task ${selectedTaskId === task.id ? 'selected' : ''} ${pending.has(task.id) ? 'saving' : ''}`} draggable={!compact && mode === 'kanban' && movable && !pending.has(task.id)} onDragStart={event => { event.dataTransfer.setData('text/plain', task.id); event.dataTransfer.effectAllowed = 'move'; setDragging(task.id); }} onDragEnd={() => { setDragging(undefined); setOver(undefined); }}>
      <button className="day-task-open" onClick={() => onSelectTask(task.id)}><span className={`day-priority ${task.priority.toLowerCase()}`}><i />{priorityLabels[task.priority]}</span><strong>{task.title}</strong>{task.description && <p>{task.description}</p>}</button>
      <div className="day-task-meta"><span className={late ? 'late' : ''}><CalendarDays size={15} />{late ? 'Vencida · ' : ''}{task.dueAt ? formatDate(task.dueAt) : 'Sin fecha'}</span>{Boolean(task._count?.comments) && <span aria-label={`${task._count?.comments} comentarios`}><MessageSquare size={15} />{task._count?.comments}</span>}{Boolean(task._count?.subtasks) && <span aria-label={`${task._count?.subtasks} subtareas`}><Check size={15} />{task._count?.subtasks}</span>}</div>
      <footer><button className="day-task-assignees" onClick={() => onSelectTask(task.id)} aria-label={`Responsables de ${task.title}: ${assigned.map(person => person.user.name).join(', ') || 'sin asignar'}`}><span className="day-avatar-stack">{assigned.slice(0,compact ? 1 : 3).map(person => <span key={person.userId} title={person.user.name}>{initials(person.user.name)}</span>)}{!assigned.length && <UsersRound size={17}/>}</span><span className="day-assignee-label">{assigned.length ? `${assigned[0].user.name}${assigned.length > 1 ? ` +${assigned.length-1}` : ''}` : 'Sin asignar'}</span></button>{movable ? <select aria-label={`Cambiar estado de ${task.title}`} disabled={pending.has(task.id)} value={task.statusId} onChange={event => void move(task,event.target.value)}>{taskStatusOptions(task,statuses).map(status => <option key={status.id} value={status.id}>{status.name}</option>)}</select> : <span className="day-task-status-label">{statuses.find(status => status.id === task.statusId)?.name ?? task.status?.name ?? 'Sin estado'}</span>}</footer>
    </article>;
  }
  if (!activeProject) return (
    <section className="day-board">
      <EmptyState title="Elige dónde trabajar" description="Abre un proyecto para ver sus tareas y a las personas que participan."
        action={<Button variant="primary" onClick={onProjects}>Ver proyectos</Button>} />
    </section>
  );

  const emptyTasks = (
    <EmptyState
      title={mainTasks.length ? 'No hay tareas con estos filtros' : 'El siguiente paso empieza aquí'}
      description={mainTasks.length ? 'Cambia los filtros para ver el resto del proyecto.' : 'Crea una tarea, elige quién la hará y define una fecha.'}
      action={mainTasks.length ? <Button onClick={clearFilters}>Quitar filtros</Button> : canCreateTasks ? <Button variant="primary" icon={<Plus size={17}/>} onClick={() => onCompose()}>Crear primera tarea</Button> : undefined}
    />
  );

  return <section className="day-board">
    <button className="day-project-back" onClick={onProjects}><ArrowLeft size={17}/>Proyectos</button>
    <header className="day-board-heading">
      <div>
        <p className="day-kicker">{activeProject.area?.name ?? 'Proyecto'}<ChevronRight size={13}/>{activeProject.locality?.name ?? 'Equipo'}</p>
        <h1>{activeProject.name}</h1>
        {activeProject.description && <p>{activeProject.description}</p>}
      </div>
      <div className="day-heading-actions">
        <div className="day-avatar-stack">{members.slice(0,4).map(member => <span key={member.userId} title={member.user.name}>{initials(member.user.name)}</span>)}</div>
        {canCreateTasks && <Button variant="primary" icon={<Plus size={18}/>} onClick={() => onCompose()}>Crear tarea</Button>}
      </div>
    </header>

    <div className="day-board-tabs">
      <nav aria-label="Secciones del proyecto">
        <button className={tab === 'tasks' ? 'selected' : ''} aria-pressed={tab === 'tasks'} onClick={() => goTab('tasks')}>Tareas <span>{mainTasks.length}</span></button>
        <button className={tab === 'people' ? 'selected' : ''} aria-pressed={tab === 'people'} onClick={() => goTab('people')}>Equipo <span>{members.length}</span></button>
        {canUseChat && <button className={tab === 'chat' ? 'selected' : ''} aria-pressed={tab === 'chat'} onClick={() => goTab('chat')}><MessageSquare size={16}/>Chat</button>}
      </nav>
    </div>

    {tab === 'chat' ? chatPanel : tab === 'tasks' ? <>
      <div className="day-board-tools">
        <div className="day-board-search-row">
          <label className="day-search"><Search size={18}/><input type="search" aria-label="Buscar tareas" placeholder="Buscar tarea o persona" value={filters.search} onChange={event => setFilters({...filters, search:event.target.value})}/></label>
          <Button className={'day-mobile-filter-toggle ' + (filterCount ? 'has-filters' : '')} icon={<SlidersHorizontal size={18}/>} aria-expanded={filtersOpen} aria-controls="board-filter-controls" onClick={() => setFiltersOpen(!filtersOpen)}>Filtros{filterCount > 0 && <b>{filterCount}</b>}</Button>
        </div>
        <div id="board-filter-controls" className="day-board-filter-controls" hidden={compact && !filtersOpen}>
          <label>Mostrar<select value={filters.focus} onChange={event => setFilters({...filters,focus:event.target.value as TaskFilters['focus']})}>
            <option value="all">Todas las tareas</option><option value="mine">Asignadas a mí</option><option value="today">Para hoy</option><option value="overdue">Vencidas</option><option value="blocked">Bloqueadas</option><option value="unassigned">Sin responsable</option>
          </select></label>
          <label>Responsable<select value={filters.assigneeId} onChange={event => setFilters({...filters,assigneeId:event.target.value})}>
            <option value="">Todas las personas</option>{members.map(member => <option key={member.userId} value={member.userId}>{member.user.name}</option>)}
          </select></label>
          {boards.length > 1 && <label>Tablero<select value={activeBoard?.id ?? ''} onChange={event => onBoardChange(event.target.value)}>{boards.map(board => <option key={board.id} value={board.id}>{board.name}</option>)}</select></label>}
          {filterCount > 0 && <Button variant="ghost" icon={<X size={15}/>} onClick={clearFilters}>Limpiar</Button>}
        </div>
      </div>
      <div className="day-board-view-row">
        <span>{compact && mode === 'list' ? mobileTasks.length : shown.length} {(compact && mode === 'list' ? mobileTasks.length : shown.length) === 1 ? 'tarea' : 'tareas'}{filters.focus === 'mine' ? ' para ti' : ''}</span>
        <div className="day-view-switch" aria-label="Presentación de tareas">
          <button aria-pressed={mode === 'list'} className={mode === 'list' ? 'selected' : ''} onClick={() => changeMode('list')}><List size={17}/>Lista</button>
          <button aria-pressed={mode === 'kanban'} className={mode === 'kanban' ? 'selected' : ''} onClick={() => changeMode('kanban')}><Columns3 size={17}/>Tablero</button>
        </div>
      </div>
      {compact && mode === 'list' && <nav className="day-mobile-statuses" aria-label="Filtrar tareas por estado">
        <button aria-pressed={!statusFilter} className={!statusFilter ? 'selected' : ''} onClick={() => setStatusFilter('')}>Todas <span>{shown.length}</span></button>
        {statuses.map(status => <button key={status.id} aria-pressed={statusFilter === status.id} className={statusFilter === status.id ? 'selected' : ''} onClick={() => setStatusFilter(status.id)}><i style={{background:status.color ?? '#64748b'}}/>{status.name}<span>{shown.filter(task => task.statusId === status.id).length}</span></button>)}
      </nav>}
      {error && <p className="form-error" role="alert">{error}</p>}
      {notice && <p className="day-save-notice" role="status">{notice}</p>}

      {isLoading && !tasks.length ? <LoadingState label="Abriendo el proyecto…" rows={3}/> : mode === 'kanban' ? <>
        {compact && <p className="day-board-swipe-hint"><MoveHorizontal size={16}/>Desliza para ver los demás estados</p>}
        <div className="day-kanban" tabIndex={0} aria-label="Tablero de tareas, desplazamiento horizontal">
          {statuses.map(status => {
            const items = shown.filter(task => task.statusId === status.id);
            const canAdd = canCreateTasks && !status.countsAsDone && status.category !== 'CANCELLED';
            return <section key={status.id} className={'day-column ' + (over === status.id ? 'drag-over' : '')}
              onDragOver={event => { const task = tasks.find(item => item.id === dragging); if (task?.capabilities?.allowedStatusIds.includes(status.id)) { event.preventDefault(); setOver(status.id); } }}
              onDragLeave={() => setOver(undefined)}
              onDrop={event => { event.preventDefault(); const task = tasks.find(item => item.id === event.dataTransfer.getData('text/plain')); setOver(undefined); setDragging(undefined); if (task) void move(task,status.id); }}>
              <header><i style={{background:status.color ?? '#64748b'}}/><h2>{status.name}</h2><span>{items.length}</span>
                {canAdd && <button aria-label={'Crear tarea en ' + status.name} onClick={() => onCompose({statusId:status.id})}><Plus size={18}/></button>}
              </header>
              <div className="day-column-tasks">{items.map(card)}{!items.length && <p className="day-column-empty">Sin tareas</p>}</div>
              {canAdd && <button className="day-column-add" onClick={() => onCompose({statusId:status.id})}><Plus size={17}/>Agregar tarea</button>}
            </section>;
          })}
        </div>
      </> : compact ? <div className="day-mobile-task-list">{mobileTasks.map(card)}{!mobileTasks.length && emptyTasks}</div> : <div className="day-task-table">
        <div className="day-task-table-head"><span>Tarea</span><span>Responsables</span><span>Entrega</span><span>Estado</span></div>
        {shown.map(task => <div className="day-task-table-row" key={task.id}>
          <button onClick={() => onSelectTask(task.id)}><i className={'day-priority-dot ' + task.priority.toLowerCase()}/><strong>{task.title}</strong></button>
          <span>{task.assignees?.map(person => person.user.name).join(', ') || 'Sin asignar'}</span>
          <span>{formatDate(task.dueAt)}</span>
          <select aria-label={'Estado de ' + task.title} value={task.statusId} disabled={pending.has(task.id) || !canMoveTask(task,statuses,currentUserId,canChangeTaskStatus,canEditCompletedTasks)} onChange={event => void move(task,event.target.value)}>
            {taskStatusOptions(task,statuses).map(status => <option key={status.id} value={status.id}>{status.name}</option>)}
          </select>
        </div>)}
        {!shown.length && emptyTasks}
      </div>}
    </> : <section className="day-project-people">
      <header><div><h2>El equipo de este proyecto</h2><p>Asigna una tarea a una persona o solicita apoyo a otra área.</p></div>
        {onRequestStaffing && <Button icon={<Plus size={17}/>} onClick={onRequestStaffing}>Pedir apoyo a otra área</Button>}
      </header>
      <div>{members.map(member => <article key={member.userId}><span className="person-avatar">{initials(member.user.name)}</span><h3>{member.user.name}</h3><p>{member.user.email}</p>
        {canCreateTasks && <Button variant="ghost" onClick={() => onCompose({assigneeId:member.userId})}>Asignar tarea<ArrowRight size={16}/></Button>}
      </article>)}</div>
    </section>}
  </section>;
}
