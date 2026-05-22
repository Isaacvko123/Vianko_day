import { AlertTriangle, BarChart3, CheckCircle2, Clock3, FileDown, ListChecks, RefreshCw, TimerReset } from "lucide-react";
import { Button, Card, EmptyState, LoadingState, PageHeader, StatCard } from "./ui";
import type { ReportPeriodKey, WorkspaceSummary } from "../types";
import { formatDate, formatMinutes } from "../lib/format";

type ReportsViewProps = {
  summary?: WorkspaceSummary;
  period: ReportPeriodKey;
  isLoading: boolean;
  onPeriodChange: (period: ReportPeriodKey) => void;
  onRefresh: () => void;
};

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
  const reportWindow = window.open("", "_blank", "noopener,noreferrer");

  if (!reportWindow) {
    return;
  }

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

export function ReportsView({ summary, period, isLoading, onPeriodChange, onRefresh }: ReportsViewProps) {
  const projects = summary?.projects ?? [];
  const users = summary?.users ?? [];
  const activities = summary?.activities ?? [];
  const totalTasks = projects.reduce((sum, project) => sum + project.total_tasks, 0);
  const completedTasks = projects.reduce((sum, project) => sum + project.completed_tasks, 0);
  const blockedTasks = projects.reduce((sum, project) => sum + project.blocked_tasks, 0);
  const overdueTasks = projects.reduce((sum, project) => sum + project.overdue_tasks, 0);
  const lateTasks = projects.reduce((sum, project) => sum + project.late_tasks, 0);
  const unestimatedTasks = projects.reduce((sum, project) => sum + project.unestimated_tasks, 0);
  const totalMinutes = users.reduce((sum, user) => sum + user.total_minutes, 0);
  const estimatedMinutes = projects.reduce((sum, project) => sum + (project.estimate_minutes ?? 0), 0);
  const pendingMinutes = Math.max(estimatedMinutes - totalMinutes, 0);
  const completionRate = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;
  const onTimeRate = completedTasks > 0 ? Math.max(0, Math.round(((completedTasks - lateTasks) / completedTasks) * 100)) : 0;
  const atRiskProjects = projects.filter((project) => project.blocked_tasks > 0 || project.overdue_tasks > 0);
  const topProject = [...projects].sort((first, second) => (second.progress_percent ?? 0) - (first.progress_percent ?? 0))[0];
  const topUser = [...users].sort((first, second) => second.total_minutes - first.total_minutes)[0];

  return (
    <section className="page reports-page">
      <PageHeader
        eyebrow="Reportes"
        title="Resumen operativo"
        description="Indicadores de avance, bloqueo y tiempo registrado para decidir rapido sin perseguir datos."
        actions={
          <div className="report-actions">
            <label>
              Periodo
              <select value={period} onChange={(event) => onPeriodChange(event.target.value as ReportPeriodKey)}>
                {reportPeriodOptions.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </label>
            <Button icon={<FileDown size={17} />} variant="secondary" disabled={!summary} onClick={() => summary ? openPdfReport(summary) : undefined}>PDF</Button>
            <Button icon={<RefreshCw size={17} />} variant="secondary" onClick={onRefresh}>Actualizar</Button>
          </div>
        }
      />

      {isLoading ? <LoadingState label="Calculando reportes..." rows={4} /> : undefined}

      <section className="report-hero-panel" data-guide="reports-kpis">
        <article className="report-score-card">
          <span>Salud operativa</span>
          <strong>{completionRate}%</strong>
          <div className="progress-track">
            <span style={{ width: `${completionRate}%` }} />
          </div>
          <small>{completedTasks} de {totalTasks} actividades terminadas</small>
        </article>
        <article>
          <span>Proyecto con mejor avance</span>
          <strong>{topProject?.project_name ?? "Sin proyectos"}</strong>
          <small>{topProject ? `${topProject.progress_percent ?? 0}% completado` : "Crea actividades para medir avance"}</small>
        </article>
        <article>
          <span>Mayor carga registrada</span>
          <strong>{topUser?.name ?? "Sin registros"}</strong>
          <small>{topUser ? `${formatMinutes(topUser.total_minutes)} invertidos` : "Registra tiempo para medir carga"}</small>
        </article>
        <article className={atRiskProjects.length > 0 ? "risk-card warning" : "risk-card"}>
          <span>Riesgo actual</span>
          <strong>{atRiskProjects.length}</strong>
          <small>proyecto(s) con bloqueos o vencimientos</small>
        </article>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6" data-guide="reports-kpis">
        <StatCard icon={<ListChecks size={18} />} label="Total" value={totalTasks} />
        <StatCard icon={<CheckCircle2 size={18} />} label="Terminadas" value={completedTasks} tone="green" />
        <StatCard icon={<AlertTriangle size={18} />} label="Bloqueadas" value={blockedTasks} tone={blockedTasks > 0 ? "amber" : "slate"} />
        <StatCard icon={<TimerReset size={18} />} label="Vencidas" value={overdueTasks} tone={overdueTasks > 0 ? "red" : "slate"} />
        <StatCard icon={<TimerReset size={18} />} label="Con retraso" value={lateTasks} tone={lateTasks > 0 ? "red" : "slate"} />
        <StatCard icon={<Clock3 size={18} />} label="Horas" value={formatMinutes(totalMinutes)} tone="blue" />
      </section>

      <section className="report-time-panel">
        <article>
          <span>Estimado total</span>
          <strong>{formatMinutes(estimatedMinutes)}</strong>
          <small>Incluye actividades principales y subtareas planeadas.</small>
        </article>
        <article>
          <span>Tiempo invertido</span>
          <strong>{formatMinutes(totalMinutes)}</strong>
          <small>Registrado por usuarios en actividades y subtareas.</small>
        </article>
        <article className={pendingMinutes > 0 ? "warning" : "ok"}>
          <span>Balance operativo</span>
          <strong>{pendingMinutes > 0 ? formatMinutes(pendingMinutes) : "Estimado cubierto"}</strong>
          <small>{pendingMinutes > 0 ? "Tiempo estimado aun no consumido." : "El tiempo real ya cubrio o supero la estimacion."}</small>
        </article>
        <article className={onTimeRate < 80 && completedTasks > 0 ? "warning" : "ok"}>
          <span>Cierre a tiempo</span>
          <strong>{onTimeRate}%</strong>
          <small>{lateTasks} terminadas fuera de fecha; {unestimatedTasks} sin estimar.</small>
        </article>
      </section>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.25fr)_minmax(360px,0.75fr)]">
        <Card className="grid gap-4 p-5" data-guide="reports-projects">
          <h2 className="flex items-center gap-2 text-lg font-black text-slate-950"><BarChart3 size={18} /> Avance por proyecto</h2>
          <div className="report-list">
            {projects.map((project) => (
              <article className={project.overdue_tasks > 0 || project.blocked_tasks > 0 ? "report-row at-risk" : "report-row"} key={project.project_id}>
                <div>
                  <strong>{project.project_name}</strong>
                  <small>
                    {project.completed_tasks}/{project.total_tasks} terminadas · {project.active_tasks} activas · {project.blocked_tasks} bloqueadas · {project.overdue_tasks} vencidas
                    {" · "}Estimado {formatMinutes(project.estimate_minutes ?? 0)} · Real {formatMinutes(project.actual_minutes ?? 0)}
                  </small>
                  <small>{project.late_tasks} con retraso · {project.unestimated_tasks} sin estimar</small>
                </div>
                <div className="progress-track">
                  <span style={{ width: `${project.progress_percent ?? 0}%` }} />
                </div>
                <em>{project.progress_percent ?? 0}%</em>
              </article>
            ))}
            {!isLoading && projects.length === 0 ? (
              <EmptyState title="Sin avance disponible" description="Cuando existan proyectos con actividades, aqui se vera su progreso." />
            ) : undefined}
          </div>
        </Card>

        <Card className="grid gap-4 p-5" data-guide="reports-users">
          <h2 className="flex items-center gap-2 text-lg font-black text-slate-950"><Clock3 size={18} /> Productividad por usuario</h2>
          <div className="report-list">
            {users.map((user, index) => (
              <article key={user.user_id}>
                <div>
                  <strong>#{index + 1} {user.name}</strong>
                  <small>{user.completed_tasks} terminadas · {user.active_tasks} activas · {user.assigned_tasks} asignadas</small>
                  <small>{user.overdue_tasks} vencidas · {user.blocked_tasks} bloqueadas · {user.late_tasks} tarde · Est. {formatMinutes(user.estimate_minutes)}</small>
                </div>
                <em>{formatMinutes(user.total_minutes)}</em>
              </article>
            ))}
            {!isLoading && users.length === 0 ? (
              <EmptyState title="Sin tiempo registrado" description="El ranking aparecera cuando el equipo registre tiempo trabajado." />
            ) : undefined}
          </div>
        </Card>
      </div>

      <Card className="grid gap-4 p-5" data-guide="reports-activities">
        <h2 className="flex items-center gap-2 text-lg font-black text-slate-950"><ListChecks size={18} /> Actividades, tiempos y retrasos</h2>
        <div className="report-activity-table">
          <span>Actividad</span>
          <span>Proyecto</span>
          <span>Fechas</span>
          <span>Tiempo</span>
          <span>Riesgo</span>
          {activities.map((activity) => (
            <article className={activity.delay_days > 0 ? "late" : ""} key={activity.task_id}>
              <div>
                <strong>{activity.title}</strong>
                <small>{activity.description || "Sin descripcion"}</small>
                <small>{activity.assignee_names || "Sin asignados"} · {activity.subtask_count} subtareas · {activity.comment_count} comentarios</small>
              </div>
              <span>{activity.project_name}</span>
              <span>
                Inicio {formatDate(activity.start_at)}
                <small>Fin {formatDate(activity.due_at)} · Cierre {formatDate(activity.completed_at)}</small>
              </span>
              <span>
                Real {formatMinutes(activity.actual_minutes)}
                <small>Estimado {formatMinutes(activity.estimate_minutes)}</small>
              </span>
              <em>
                {activity.delay_days > 0 ? `${activity.delay_days} dia(s)` : "A tiempo"}
                <small>{activity.status_name} · {activity.priority}</small>
              </em>
            </article>
          ))}
        </div>
        {!isLoading && activities.length === 0 ? (
          <EmptyState title="Sin actividades para reportar" description="Cuando existan actividades, aqui apareceran tiempos, cierres y retrasos." />
        ) : undefined}
      </Card>
    </section>
  );
}
