import { AlertTriangle, BarChart3, CheckCircle2, Clock3, ListChecks, RefreshCw, TimerReset } from "lucide-react";
import { Button, Card, EmptyState, LoadingState, PageHeader, StatCard } from "./ui";
import type { WorkspaceSummary } from "../types";
import { formatMinutes } from "../lib/format";

type ReportsViewProps = {
  summary?: WorkspaceSummary;
  isLoading: boolean;
  onRefresh: () => void;
};

export function ReportsView({ summary, isLoading, onRefresh }: ReportsViewProps) {
  const projects = summary?.projects ?? [];
  const users = summary?.users ?? [];
  const totalTasks = projects.reduce((sum, project) => sum + project.total_tasks, 0);
  const completedTasks = projects.reduce((sum, project) => sum + project.completed_tasks, 0);
  const blockedTasks = projects.reduce((sum, project) => sum + project.blocked_tasks, 0);
  const overdueTasks = projects.reduce((sum, project) => sum + project.overdue_tasks, 0);
  const totalMinutes = users.reduce((sum, user) => sum + user.total_minutes, 0);
  const completionRate = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;
  const atRiskProjects = projects.filter((project) => project.blocked_tasks > 0 || project.overdue_tasks > 0);
  const topProject = [...projects].sort((first, second) => (second.progress_percent ?? 0) - (first.progress_percent ?? 0))[0];

  return (
    <section className="page reports-page">
      <PageHeader
        eyebrow="Reportes"
        title="Resumen operativo"
        description="Indicadores de avance, bloqueo y tiempo registrado para decidir rapido sin perseguir datos."
        actions={<Button icon={<RefreshCw size={17} />} variant="secondary" onClick={onRefresh}>Actualizar</Button>}
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
        <article className={atRiskProjects.length > 0 ? "risk-card warning" : "risk-card"}>
          <span>Riesgo actual</span>
          <strong>{atRiskProjects.length}</strong>
          <small>proyecto(s) con bloqueos o vencimientos</small>
        </article>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5" data-guide="reports-kpis">
        <StatCard icon={<ListChecks size={18} />} label="Total" value={totalTasks} />
        <StatCard icon={<CheckCircle2 size={18} />} label="Terminadas" value={completedTasks} tone="green" />
        <StatCard icon={<AlertTriangle size={18} />} label="Bloqueadas" value={blockedTasks} tone={blockedTasks > 0 ? "amber" : "slate"} />
        <StatCard icon={<TimerReset size={18} />} label="Vencidas" value={overdueTasks} tone={overdueTasks > 0 ? "red" : "slate"} />
        <StatCard icon={<Clock3 size={18} />} label="Horas" value={formatMinutes(totalMinutes)} tone="blue" />
      </section>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.25fr)_minmax(360px,0.75fr)]">
        <Card className="grid gap-4 p-5" data-guide="reports-projects">
          <h2 className="flex items-center gap-2 text-lg font-black text-slate-950"><BarChart3 size={18} /> Avance por proyecto</h2>
          <div className="report-list">
            {projects.map((project) => (
              <article className={project.overdue_tasks > 0 || project.blocked_tasks > 0 ? "report-row at-risk" : "report-row"} key={project.project_id}>
                <div>
                  <strong>{project.project_name}</strong>
                  <small>{project.completed_tasks}/{project.total_tasks} terminadas · {project.blocked_tasks} bloqueadas · {project.overdue_tasks} vencidas</small>
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
                  <small>{user.completed_tasks} actividades terminadas</small>
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
    </section>
  );
}
