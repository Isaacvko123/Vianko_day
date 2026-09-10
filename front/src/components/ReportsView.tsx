import { useState } from 'react';
import { ArrowUpRight, BarChart3, FileDown } from 'lucide-react';
import { Button, EmptyState, LoadingState } from './ui';
import type { ReportPeriodKey, WorkspaceSummary } from '../types';
import { formatDate, formatMinutes } from '../lib/format';
import { DashboardGantt } from './LazyDashboardGantt';
type ReportsViewProps = { token: string; userId: string; workspaceId: string; summary?: WorkspaceSummary; period: ReportPeriodKey; isLoading: boolean; onPeriodChange: (period: ReportPeriodKey) => void; onRefresh: () => void; onOpenProject: (projectId: string) => void; onOpenTask: (projectId: string, taskId: string) => void };
const reportPeriodOptions: Array<{ value: ReportPeriodKey; label: string }> = [
  { value: "week", label: "Semana" },
  { value: "month", label: "Mes" },
  { value: "bimester", label: "Bimestre" },
  { value: "semester", label: "Semestre" },
  { value: "year", label: "Año" }
];

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function reportRows(summary: WorkspaceSummary) {
  const projectRows = summary.projects.map((project) => `
    <tr>
      <td>${escapeHtml(project.project_name)}</td>
      <td>${project.completed_tasks}/${project.total_tasks}</td>
      <td>${project.blocked_tasks}</td>
      <td>${project.overdue_tasks}</td>
      <td>${formatMinutes(project.actual_minutes ?? 0)}</td>
      <td>${project.progress_percent ?? 0}%</td>
    </tr>
  `).join("");
  const userRows = summary.users.map((user) => `
    <tr>
      <td>${escapeHtml(user.name)}</td>
      <td>${user.completed_tasks}</td>
      <td>${user.active_tasks}</td>
      <td>${user.overdue_tasks}</td>
      <td>${formatMinutes(user.total_minutes)}</td>
    </tr>
  `).join("");
  const activityRows = summary.activities.map((activity) => `
    <tr>
      <td>${escapeHtml(activity.title)}</td>
      <td>${escapeHtml(activity.project_name)}</td>
      <td>${escapeHtml(activity.assignee_names || "Sin asignados")}</td>
      <td>${formatDate(activity.due_at)}</td>
      <td>${formatMinutes(activity.actual_minutes)}</td>
      <td>${activity.delay_days > 0 ? `${activity.delay_days} dia(s)` : "A tiempo"}</td>
    </tr>
  `).join("");

  return { projectRows, userRows, activityRows };
}

function openPdfReport(summary: WorkspaceSummary) {
  const totals = {
    tasks: summary.projects.reduce((sum, project) => sum + project.total_tasks, 0),
    completed: summary.projects.reduce((sum, project) => sum + project.completed_tasks, 0),
    delayed: summary.projects.reduce((sum, project) => sum + project.late_tasks, 0),
    minutes: summary.users.reduce((sum, user) => sum + user.total_minutes, 0)
  };
  const rows = reportRows(summary);
  const reportWindow = window.open("", "_blank");

  if (!reportWindow) {
    return;
  }

  reportWindow.opener = null;
  reportWindow.document.write(`
    <!doctype html>
    <html lang="es">
      <head>
        <meta charset="utf-8" />
        <title>Reporte ${escapeHtml(summary.period.label)} - Vianko Day</title>
        <style>
          body { font-family: Inter, Arial, sans-serif; color: #172033; margin: 32px; }
          h1 { margin: 0 0 6px; font-size: 28px; }
          h2 { margin: 28px 0 10px; font-size: 18px; }
          p { color: #58657a; margin: 0 0 18px; }
          .kpis { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin: 18px 0 24px; }
          .kpi { border: 1px solid #d9e2ef; border-radius: 12px; padding: 12px; }
          .kpi span { display: block; color: #64748b; font-size: 11px; font-weight: 800; text-transform: uppercase; }
          .kpi strong { display: block; margin-top: 6px; font-size: 20px; }
          table { width: 100%; border-collapse: collapse; margin-bottom: 18px; }
          th { background: #eef4ff; color: #475569; font-size: 11px; text-align: left; text-transform: uppercase; }
          th, td { border: 1px solid #d9e2ef; padding: 9px; font-size: 12px; vertical-align: top; }
          tr:nth-child(even) td { background: #f8fafc; }
          @page { margin: 18mm; }
        </style>
      </head>
      <body>
        <h1>Reporte operativo Vianko Day</h1>
        <p>${escapeHtml(summary.period.label)} · ${formatDate(summary.period.start)} a ${formatDate(summary.period.end)}</p>
        <section class="kpis">
          <div class="kpi"><span>Actividades</span><strong>${totals.tasks}</strong></div>
          <div class="kpi"><span>Terminadas</span><strong>${totals.completed}</strong></div>
          <div class="kpi"><span>Con retraso</span><strong>${totals.delayed}</strong></div>
          <div class="kpi"><span>Tiempo real</span><strong>${formatMinutes(totals.minutes)}</strong></div>
        </section>
        <h2>Proyectos</h2>
        <table><thead><tr><th>Proyecto</th><th>Avance</th><th>Bloqueadas</th><th>Vencidas</th><th>Tiempo real</th><th>%</th></tr></thead><tbody>${rows.projectRows}</tbody></table>
        <h2>Usuarios</h2>
        <table><thead><tr><th>Usuario</th><th>Terminadas</th><th>Activas</th><th>Vencidas</th><th>Tiempo</th></tr></thead><tbody>${rows.userRows}</tbody></table>
        <h2>Actividades y retrasos</h2>
        <table><thead><tr><th>Actividad</th><th>Proyecto</th><th>Asignados</th><th>Fin</th><th>Tiempo</th><th>Riesgo</th></tr></thead><tbody>${rows.activityRows}</tbody></table>
      </body>
    </html>
  `);
  reportWindow.document.close();
  reportWindow.focus();
  reportWindow.print();
}

export function ReportsView({ token, userId, workspaceId, summary, period, isLoading, onPeriodChange, onOpenProject, onOpenTask }: ReportsViewProps) {
  const [tab, setTab] = useState<'projects' | 'people' | 'tasks'>('projects');
  const [page, setPage] = useState(1);
  const projects = summary?.projects ?? [];
  const people = summary?.users ?? [];
  const tasks = summary?.activities ?? [];
  const total = projects.reduce((sum, project) => sum + project.total_tasks, 0);
  const completed = projects.reduce((sum, project) => sum + project.completed_tasks, 0);
  const overdue = projects.reduce((sum, project) => sum + project.overdue_tasks, 0);
  const blocked = projects.reduce((sum, project) => sum + project.blocked_tasks, 0);
  const minutes = people.reduce((sum, person) => sum + person.total_minutes, 0);
  const rate = total ? Math.round(completed / total * 100) : 0;
  const count = tab === 'projects' ? projects.length : tab === 'people' ? people.length : tasks.length;
  const pages = Math.max(1, Math.ceil(count / 20)); const activePage = Math.min(page, pages); const start = (activePage - 1) * 20;
  return <section className="page product-page reports-page">
    <header className="product-heading"><div><p className="eyebrow">Seguimiento del equipo</p><h1>Resumen del trabajo</h1><p>Revisa avances y pendientes de los proyectos dentro de tu alcance.</p></div><div className="report-primary-actions"><select aria-label="Período del reporte" value={period} onChange={event => { setPage(1); onPeriodChange(event.target.value as ReportPeriodKey); }}>{reportPeriodOptions.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select><Button icon={<FileDown size={16} />} disabled={!summary} onClick={() => summary && openPdfReport(summary)}>Exportar PDF</Button></div></header>
    {summary && <p className="report-period-label">{summary.period.label} · {formatDate(summary.period.start)} al {formatDate(summary.period.end)}</p>}
    {isLoading && !summary && <LoadingState label="Calculando el resumen…" rows={4} />}
    <div className="dashboard-metrics" data-guide="reports-kpis"><article><span>Tareas terminadas</span><strong>{completed}<small> / {total}</small></strong><div className="dashboard-progress"><i style={{ width: `${rate}%` }} /></div><small>{rate}% del trabajo registrado</small></article><article><span>Vencidas</span><strong className={overdue ? 'metric-overdue' : ''}>{overdue}</strong><small>Pendientes con fecha superada</small></article><article><span>Bloqueadas</span><strong className={blocked ? 'metric-blocked' : ''}>{blocked}</strong><small>Necesitan ayuda para continuar</small></article><article><span>Tiempo registrado</span><strong>{formatMinutes(minutes)}</strong><small>Reportado por las personas del equipo</small></article></div>
    <DashboardGantt key={workspaceId} token={token} userId={userId} workspaceId={workspaceId} team onOpen={onOpenTask}/>
    <div className="product-toolbar"><div className="product-tabs">{([['projects', 'Proyectos'], ['people', 'Personas'], ['tasks', 'Tareas']] as const).map(([value, label]) => <button key={value} className={tab === value ? 'active' : ''} onClick={() => { setTab(value); setPage(1); }}>{label}</button>)}</div><span className="muted-note">{count} registros</span></div>
    <div className="dashboard-table">
      {tab === 'projects' && projects.slice(start, start + 20).map(project => <button key={project.project_id} className="dashboard-project-row" onClick={() => onOpenProject(project.project_id)}><span><strong>{project.project_name}</strong><small>{project.completed_tasks} terminadas · {project.active_tasks} activas</small></span><span className="dashboard-progress-group"><span className="dashboard-progress"><i style={{ width: `${project.progress_percent ?? 0}%` }} /></span><small>{project.progress_percent ?? 0}%</small></span><span className="dashboard-signals">{project.overdue_tasks > 0 && <em className="signal-red">{project.overdue_tasks} vencidas</em>}{project.blocked_tasks > 0 && <em className="signal-amber">{project.blocked_tasks} bloqueadas</em>}{project.overdue_tasks === 0 && project.blocked_tasks === 0 && <em>Sin alertas</em>}</span><ArrowUpRight size={16} /></button>)}
      {tab === 'people' && <>{people.length > 0 && <div className="dashboard-people-row table-labels"><span>Persona</span><span>Activas</span><span>Terminadas</span><span>Tiempo</span></div>}{people.slice(start, start + 20).map(person => <div className="dashboard-people-row" key={person.user_id}><span><strong>{person.name}</strong><small>{person.overdue_tasks} vencidas · {person.blocked_tasks} bloqueadas</small></span><span>{person.active_tasks}</span><span>{person.completed_tasks}</span><span>{formatMinutes(person.total_minutes)}</span></div>)}</>}
      {tab === 'tasks' && tasks.slice(start, start + 20).map(task => <button className="dashboard-task-row" key={task.task_id} onClick={() => onOpenTask(task.project_id, task.task_id)}><span><strong>{task.title}</strong><small>{task.project_name} · {task.assignee_names || 'Sin asignar'}</small></span><span>{task.status_name}</span><span>{task.delay_days > 0 ? <em className="signal-red">{task.delay_days} días de retraso</em> : formatDate(task.due_at)}</span><ArrowUpRight size={16} /></button>)}
      {!isLoading && !count && <EmptyState icon={<BarChart3 size={25} />} title="Todavía no hay datos para este período" description="Los avances aparecerán cuando el equipo cree tareas y registre su trabajo." />}
    </div>
    {count > 20 && <footer className="product-pagination"><span>{start + 1}–{Math.min(start + 20, count)} de {count}</span><div><Button size="sm" disabled={activePage <= 1} onClick={() => setPage(activePage - 1)}>Anterior</Button><span>{activePage} de {pages}</span><Button size="sm" disabled={activePage >= pages} onClick={() => setPage(activePage + 1)}>Siguiente</Button></div></footer>}
  </section>;
}
