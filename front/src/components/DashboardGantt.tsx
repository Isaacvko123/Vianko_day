import { useEffect, useId, useState, type CSSProperties } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, ArrowRight, CalendarClock, ChevronLeft, ChevronRight, Diamond, FolderKanban, UsersRound } from 'lucide-react';
import { apiRequest } from '../api/http';
import { calendarDay, describeDates, localDate, shortDate, taskDates, weekStart, type GanttTask } from '../lib/gantt';
import { Button, EmptyState, LoadingState } from './ui';
import '../gantt.css';

type TimelineResponse = {
  tasks: GanttTask[];
  total: number;
  page: number;
  pages: number;
  summary: { total: number; today: number; overdue: number; undated: number };
  projects: { id: string; name: string }[];
};
type Props = { token: string; userId: string; workspaceId: string; team?: boolean; onOpen: (projectId: string, taskId: string) => void };
type Bucket = 'period' | 'overdue' | 'undated';

function TimelineBar({ task, first, days, today, onOpen, onLocate }: {
  task: GanttTask; first: number; days: number; today: number; onOpen: () => void; onLocate: (day: number) => void;
}) {
  const dates = taskDates(task);
  if (dates.invalid) return <button className="gantt-date-action warning" onClick={onOpen}>Revisar fechas</button>;
  if (dates.first === undefined || dates.last === undefined) return <button className="gantt-date-action" onClick={onOpen}>Abrir para definir fechas <ArrowRight size={14}/></button>;
  if (dates.last < first || dates.first >= first + days) {
    const before = dates.last < first;
    return <button className={`gantt-date-action ${before ? '' : 'future'}`} onClick={() => onLocate(before ? dates.last! : dates.first!)}>
      {before && <ArrowLeft size={14}/>}Ver {shortDate(before ? dates.last : dates.first)}{!before && <ArrowRight size={14}/>}
    </button>;
  }
  const overdue = dates.due !== undefined && dates.due < today;
  const tone = overdue ? 'overdue' : task.status.category === 'BLOCKED' ? 'blocked' : task.status.category === 'IN_PROGRESS' ? 'progress' : 'planned';
  const progress = Math.max(0, Math.min(100, task.progress));
  const description = `${task.title}. ${describeDates(task)}. ${task.status.name}. Avance ${progress}%. Abrir tarea.`;
  if (dates.start === undefined || dates.due === undefined) {
    const left = (dates.first - first + 0.5) / days * 100;
    return <button className={`gantt-milestone ${tone}`} style={{ left: `${left}%` }} title={description} aria-label={description} onClick={onOpen}><Diamond size={20} fill="currentColor"/></button>;
  }
  const visibleStart = Math.max(first, dates.first);
  const visibleEnd = Math.min(first + days, dates.last + 1);
  const progressEnd = dates.first + (dates.last - dates.first + 1) * progress / 100;
  const visibleProgress = Math.max(0, Math.min(100, (progressEnd - visibleStart) / (visibleEnd - visibleStart) * 100));
  return <button className={`gantt-bar ${tone} ${dates.first < first ? 'continued-left' : ''} ${dates.last >= first + days ? 'continued-right' : ''}`}
    style={{ left: `${(visibleStart - first) / days * 100}%`, width: `${(visibleEnd - visibleStart) / days * 100}%` }} title={description} aria-label={description} onClick={onOpen}>
    <span>{task.status.name} · {progress}%</span><i aria-hidden="true" style={{ width: `${visibleProgress}%` }}/>
  </button>;
}

export function DashboardGantt({ token, userId, workspaceId, team = false, onOpen }: Props) {
  const titleId = useId();
  const [today, setToday] = useState(() => calendarDay(new Date()));
  const [first, setFirst] = useState(() => weekStart(calendarDay(new Date())));
  const [days, setDays] = useState(30);
  const [bucket, setBucket] = useState<Bucket>('period');
  const [projectId, setProjectId] = useState('');
  const [page, setPage] = useState(1);
  useEffect(() => {
    const syncDay = () => setToday(calendarDay(new Date()));
    const timer = window.setInterval(syncDay, 60_000);
    document.addEventListener('visibilitychange', syncDay);
    return () => { window.clearInterval(timer); document.removeEventListener('visibilitychange', syncDay); };
  }, []);
  const params = new URLSearchParams({ state: 'active', mine: String(!team), timeline: bucket, page: String(page), limit: '25', today: localDate(today).toISOString(), tomorrow: localDate(today + 1).toISOString() });
  if (bucket === 'period') { params.set('from', localDate(first).toISOString()); params.set('to', localDate(first + days).toISOString()); }
  if (projectId) params.set('projectId', projectId);
  // Same query family as the agenda: socket invalidation refreshes only mounted views.
  const query = useQuery({ queryKey: ['work-items', workspaceId, 'gantt', userId, params.toString()], queryFn: () => apiRequest<TimelineResponse>(`/workspaces/${workspaceId}/work-items?${params}`, { token }), staleTime: 15_000 });
  const data = query.data;
  useEffect(() => { if (data && page > data.pages) setPage(data.pages); }, [data, page]);
  const ticks = Array.from({ length: days }, (_, index) => localDate(first + index));
  const months: { label: string; start: number; length: number }[] = [];
  ticks.forEach((date, index) => {
    const label = date.toLocaleDateString('es-MX', { month: 'long', year: 'numeric' });
    const previous = months[months.length - 1];
    if (previous?.label === label) previous.length++;
    else months.push({ label, start: index, length: 1 });
  });
  const todayVisible = today >= first && today < first + days;
  const chartStyle = { '--gantt-days': days, '--gantt-today': `${(today - first + 0.5) / days * 100}%` } as CSSProperties;
  const changeRange = (next: number) => { setFirst(next); if (bucket === 'period') setPage(1); };
  const selectBucket = (next: Bucket) => { setBucket(next); setPage(1); };
  const rangeLabel = `${shortDate(first)} – ${shortDate(first + days - 1)}, ${localDate(first + days - 1).getFullYear()}`;
  return <section className="dashboard-gantt" aria-labelledby={titleId}>
    <header className="gantt-heading"><div><span className="gantt-eyebrow"><CalendarClock size={16}/>Calendario de pendientes</span><h2 id={titleId}>{team ? 'La cronología del equipo' : 'Tus próximas entregas'}</h2><p>{team ? 'Trabajo dentro de tu alcance, con fechas, responsables y avance.' : 'Organiza lo que sigue y abre cualquier tarea para darle seguimiento.'}</p></div><label className="gantt-project"><FolderKanban size={16}/><select aria-label="Proyecto de la cronología" value={projectId} onChange={event => { setProjectId(event.target.value); setPage(1); }}><option value="">Todos los proyectos</option>{data?.projects.map(project => <option key={project.id} value={project.id}>{project.name}</option>)}</select></label></header>
    <div className="gantt-toolbar"><div className="gantt-buckets" aria-label="Pendientes de la cronología">
      <button aria-pressed={bucket === 'period'} onClick={() => selectBucket('period')}>En el período</button>
      <button aria-pressed={bucket === 'overdue'} onClick={() => selectBucket('overdue')}>Vencidas{data && <b className={data.summary.overdue ? 'attention' : ''}>{data.summary.overdue}</b>}</button>
      <button aria-pressed={bucket === 'undated'} onClick={() => selectBucket('undated')}>Sin fechas{data && <b>{data.summary.undated}</b>}</button>
    </div>{bucket !== 'undated' && <div className="gantt-range-controls"><Button size="sm" aria-label="Período anterior" onClick={() => changeRange(first - days)}><ChevronLeft size={16}/></Button><Button size="sm" onClick={() => changeRange(weekStart(today))}>Hoy</Button><Button size="sm" aria-label="Período siguiente" onClick={() => changeRange(first + days)}><ChevronRight size={16}/></Button><select aria-label="Escala de la cronología" value={days} onChange={event => { setDays(Number(event.target.value)); setPage(1); }}><option value={14}>2 semanas</option><option value={30}>Mes</option><option value={90}>Trimestre</option></select></div>}</div>
    <div className="gantt-caption"><strong>{bucket === 'undated' ? 'Pendientes por programar' : rangeLabel}</strong><span role="status">{query.isFetching ? 'Actualizando…' : data ? `${data.total} ${data.total === 1 ? 'tarea' : 'tareas'}${bucket === 'overdue' ? ' vencidas en total' : bucket === 'period' ? ' en este período' : ' sin fechas'}` : ''}</span></div>
    {query.isPending && <LoadingState label="Cargando la cronología…" rows={3}/>}
    {query.error && <div className="gantt-error" role="alert"><p>{query.error.message}</p><Button size="sm" onClick={() => void query.refetch()}>Reintentar</Button></div>}
    {data && data.total === 0 && <EmptyState icon={<CalendarClock size={25}/>} title={bucket === 'undated' ? 'Tus pendientes tienen fechas' : bucket === 'overdue' ? 'No hay entregas vencidas' : 'No hay tareas en este período'} description={bucket === 'period' ? 'Prueba otro período o revisa las tareas vencidas y las que aún no tienen fechas.' : bucket === 'undated' ? 'Cuando una tarea no tenga inicio ni entrega, aparecerá aquí.' : 'Los próximos vencimientos siguen disponibles en el calendario.'}/>}
    {Boolean(data?.tasks.length) && (bucket === 'undated' ? <div className="gantt-undated">{data!.tasks.map(task => <button key={task.id} onClick={() => onOpen(task.projectId, task.id)}><CalendarClock size={19}/><span><strong>{task.title}</strong><small>{task.project.name} · {task.assignees.map(person => person.user.name).join(', ') || 'Sin responsable'}</small></span><span>Abrir tarea <ArrowRight size={16}/></span></button>)}</div> : <div className="gantt-scroll" tabIndex={0} role="region" aria-label="Diagrama de Gantt. Desplaza horizontalmente para ver todas las fechas.">
      <div className="gantt-chart" style={chartStyle}>
        <div className="gantt-grid-row gantt-header"><div className="gantt-task-heading">Tarea y responsable<small>Selecciona una tarea para abrirla</small></div><div className="gantt-axis"><div className="gantt-months">{months.map(month => <span key={month.label} style={{ gridColumn: `${month.start + 1} / span ${month.length}` }}>{month.label}</span>)}</div><div className="gantt-days">{ticks.map((date, index) => <span key={index} title={date.toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' })} className={`${date.getDay() === 0 || date.getDay() === 6 ? 'weekend' : ''} ${first + index === today ? 'today' : ''}`}>{days <= 30 || index % 7 === 0 || first + index === today ? date.getDate() : ''}</span>)}</div></div></div>
        {data!.tasks.map(task => {
          const overdue = task.dueAt && calendarDay(task.dueAt) < today;
          return <div className="gantt-grid-row gantt-task-row" key={task.id}><button className="gantt-task-label" onClick={() => onOpen(task.projectId, task.id)} title={`${task.title}. ${describeDates(task)}`}><strong>{task.title}</strong><small>{task.project.name} · {task.assignees.map(person => person.user.name).join(', ') || 'Sin responsable'}</small><span className={overdue ? 'overdue' : ''}>{overdue ? 'Vencida · ' : ''}{describeDates(task)}</span></button><div className="gantt-track">{todayVisible && <i className="gantt-today-line" aria-hidden="true"/>}<TimelineBar task={task} first={first} days={days} today={today} onOpen={() => onOpen(task.projectId, task.id)} onLocate={day => changeRange(weekStart(day))}/></div></div>;
        })}
      </div>
    </div>)}
    {data && data.total > 0 && <footer className="gantt-footer"><div className="gantt-legend">{bucket === 'undated' ? <span><UsersRound size={14}/>Abre una tarea para revisar sus responsables y fechas.</span> : <><span><i className="planned"/>Por hacer</span><span><i className="progress"/>En curso</span><span><i className="blocked"/>Bloqueada</span><span><i className="overdue"/>Vencida</span><span><Diamond size={12}/>Una fecha definida</span></>}</div><div className="gantt-pagination"><span>{(page - 1) * 25 + 1}–{Math.min(page * 25, data.total)} de {data.total}</span>{data.pages > 1 && <><Button size="sm" aria-label="Tareas anteriores de la cronología" disabled={page <= 1 || query.isFetching} onClick={() => setPage(page - 1)}><ChevronLeft size={16}/></Button><Button size="sm" aria-label="Tareas siguientes de la cronología" disabled={page >= data.pages || query.isFetching} onClick={() => setPage(page + 1)}><ChevronRight size={16}/></Button></>}</div></footer>}
  </section>;
}
