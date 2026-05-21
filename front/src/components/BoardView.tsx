import { FormEvent, useMemo, useState } from "react";
import { CalendarClock, ClipboardList, KanbanSquare, ListFilter, Plus, RefreshCw, TimerReset, Users, X } from "lucide-react";
import { Button, EmptyState, LoadingState, StatCard } from "./ui";
import type { Board, BoardMode, BoardStatus, Project, ProjectMember, Role, Task, TaskPriority, WorkspaceMember } from "../types";
import { formatDate, formatMinutes, getDueSummary, getRangeLabel, initials } from "../lib/format";

type BoardViewProps = {
  projects: Project[];
  activeProject?: Project;
  activeBoard?: Board;
  tasks: Task[];
  completedTasks: Task[];
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

function readFormString(form: HTMLFormElement, fieldName: string) {
  const value = new FormData(form).get(fieldName);
  return typeof value === "string" ? value.trim() : "";
}

function readFormStrings(form: HTMLFormElement, fieldName: string) {
  return new FormData(form)
    .getAll(fieldName)
    .filter((value): value is string => typeof value === "string" && value.trim().length > 0);
}

function getTaskEstimateLabel(task: Task) {
  return task.estimateMinutes ? formatMinutes(task.estimateMinutes) : "Falta estimar";
}

function toIsoDate(dateValue: string) {
  return dateValue ? new Date(`${dateValue}T00:00:00.000Z`).toISOString() : undefined;
}

function isTaskDone(task: Task, statuses: BoardStatus[]) {
  const currentStatus = statuses.find((status) => status.id === task.statusId);
  return Boolean(task.completedAt || currentStatus?.countsAsDone);
}

function TaskCard({
  task,
  statuses,
  currentUserId,
  canEditCompletedTasks,
  selected,
  onSelect,
  onTaskStatusChange
}: {
  task: Task;
  statuses: BoardStatus[];
  currentUserId: string;
  canEditCompletedTasks: boolean;
  selected: boolean;
  onSelect: (taskId: string) => void;
  onTaskStatusChange: (taskId: string, statusId: string) => Promise<void>;
}) {
  const dueSummary = getDueSummary(task.dueAt, isTaskDone(task, statuses));
  const done = isTaskDone(task, statuses);
  const isAssignedToCurrentUser = Boolean((task.assignees ?? []).some((assignee) => assignee.userId === currentUserId));
  const canMoveStatus = (isAssignedToCurrentUser || canEditCompletedTasks) && (!done || canEditCompletedTasks);

  return (
    <article className={selected ? "task-card selected" : "task-card"} data-guide="task-card">
      <button className="task-main" type="button" onClick={() => onSelect(task.id)}>
        <span className="task-card-top">
          <span className={`priority priority-${task.priority.toLowerCase()}`}>{task.priority}</span>
          <span className={`due-chip due-${dueSummary.tone}`}>{dueSummary.label}</span>
        </span>
        <strong className="task-title">{task.title}</strong>
        <small>{task.description || "Sin descripcion"}</small>
      </button>
      <div className="task-metrics">
        <span>
          <small>Inicio</small>
          <strong>{formatDate(task.startAt)}</strong>
        </span>
        <span>
          <small>Fin</small>
          <strong>{formatDate(task.dueAt)}</strong>
        </span>
        <span>
          <small>Rango</small>
          <strong>{getRangeLabel(task.startAt, task.dueAt)}</strong>
        </span>
        <span>
          <small>Estimado</small>
          <strong>{getTaskEstimateLabel(task)}</strong>
        </span>
      </div>
      <div className="task-card-actions">
        <div className="task-assignee-block" aria-label="Asignados">
          <div className="task-assignees">
            {(task.assignees ?? []).map((assignee) => (
              <span key={assignee.id} title={`${assignee.user.name} · ${assignee.user.email}`}>{initials(assignee.user.name)}</span>
            ))}
            {(task.assignees ?? []).length === 0 ? <em>Sin asignados</em> : undefined}
          </div>
          {(task.assignees ?? []).length > 0 ? (
            <small>{(task.assignees ?? []).map((assignee) => assignee.user.name).join(", ")}</small>
          ) : undefined}
        </div>
        <select
          value={task.statusId}
          disabled={!canMoveStatus}
          title={canMoveStatus ? "Cambiar estado" : "Solo asignados pueden moverla; terminadas solo admin o gerente."}
          onChange={(event) => void onTaskStatusChange(task.id, event.target.value)}
        >
          {statuses.map((status) => (
            <option key={status.id} value={status.id}>{status.name}</option>
          ))}
        </select>
      </div>
    </article>
  );
}

export function BoardView({
  projects,
  activeProject,
  activeBoard,
  tasks,
  completedTasks,
  boardMode,
  isLoading,
  currentUserId,
  workspaceMembers,
  roles,
  canCreateTasks,
  canManageProjectMembers,
  canEditCompletedTasks,
  onRefresh,
  onProjectChange,
  onBoardModeChange,
  onCreateTask,
  onAddProjectMember,
  onTaskStatusChange,
  onSelectTask,
  selectedTaskId
}: BoardViewProps) {
  const [isCreating, setIsCreating] = useState(false);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isMemberModalOpen, setIsMemberModalOpen] = useState(false);
  const [isAddingMember, setIsAddingMember] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [memberErrorMessage, setMemberErrorMessage] = useState("");
  const statuses = activeBoard?.statuses ?? [];
  const projectMembers = activeProject?.members ?? [];
  const projectMemberUserIds = new Set(projectMembers.map((member) => member.userId));
  const availableMembers = workspaceMembers.filter((member) => member.status === "ACTIVE" && !projectMemberUserIds.has(member.userId));
  const mainTasks = useMemo(() => tasks.filter((task) => !task.parentTaskId), [tasks]);
  const mainCompletedTasks = useMemo(() => completedTasks.filter((task) => !task.parentTaskId), [completedTasks]);

  const tasksByStatus = useMemo(() => {
    return statuses.map((status) => ({
      status,
      tasks: mainTasks.filter((task) => task.statusId === status.id)
    }));
  }, [statuses, mainTasks]);
  const boardInsights = useMemo(() => {
    return mainTasks.reduce(
      (summary, task) => {
        const dueSummary = getDueSummary(task.dueAt, isTaskDone(task, statuses));

        return {
          total: summary.total + 1,
          overdue: dueSummary.tone === "overdue" ? summary.overdue + 1 : summary.overdue,
          dueToday: dueSummary.tone === "today" ? summary.dueToday + 1 : summary.dueToday,
          missingEstimate: task.estimateMinutes ? summary.missingEstimate : summary.missingEstimate + 1
        };
      },
      { total: 0, overdue: 0, dueToday: 0, missingEstimate: 0 }
    );
  }, [statuses, mainTasks]);

  async function handleCreateTask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage("");

    if (!activeBoard) {
      setErrorMessage("Selecciona un tablero primero.");
      return;
    }

    setIsCreating(true);

    try {
      const form = event.currentTarget;
      const estimateText = readFormString(form, "estimateMinutes");
      const description = readFormString(form, "description");
      const startAt = readFormString(form, "startAt");
      const dueAt = readFormString(form, "dueAt");

      if (startAt && dueAt && dueAt < startAt) {
        throw new Error("La fecha fin no puede ser anterior a la fecha inicio.");
      }

      await onCreateTask({
        title: readFormString(form, "title"),
        description: description || undefined,
        priority: readFormString(form, "priority") as TaskPriority,
        startAt: toIsoDate(startAt),
        dueAt: toIsoDate(dueAt),
        estimateMinutes: estimateText ? Number(estimateText) : undefined,
        statusId: readFormString(form, "statusId") || undefined,
        assigneeIds: readFormStrings(form, "assigneeIds")
      });

      form.reset();
      setIsCreateModalOpen(false);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "No se pudo crear la actividad.");
    } finally {
      setIsCreating(false);
    }
  }

  async function handleAddProjectMember(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMemberErrorMessage("");

    if (!activeProject) {
      setMemberErrorMessage("Selecciona un proyecto primero.");
      return;
    }

    setIsAddingMember(true);

    try {
      const form = event.currentTarget;
      await onAddProjectMember({
        projectId: activeProject.id,
        userId: readFormString(form, "userId"),
        roleId: readFormString(form, "roleId") || undefined
      });
      form.reset();
    } catch (error) {
      setMemberErrorMessage(error instanceof Error ? error.message : "No se pudo agregar al proyecto.");
    } finally {
      setIsAddingMember(false);
    }
  }

  return (
    <section className="page board-page">
      <header className="page-heading board-hero">
        <div>
          <p className="eyebrow">Tablero</p>
          <h1>{activeProject?.name ?? "Selecciona un proyecto"}</h1>
          {activeProject ? (
            <p className="hero-copy">
              {activeProject.description || "Seguimiento operativo por estado, fecha, asignados y estimacion."}
              <span className="hero-meta">
                <CalendarClock size={14} />
                Inicio {formatDate(activeProject.startDate)} · Fin {formatDate(activeProject.endDate)}
              </span>
            </p>
          ) : undefined}
        </div>
        <div className="header-actions">
          <select value={activeProject?.id ?? ""} onChange={(event) => onProjectChange(event.target.value)}>
            <option value="" disabled>Proyecto</option>
            {projects.map((project) => (
              <option key={project.id} value={project.id}>{project.name}</option>
            ))}
          </select>
          <div className="icon-toggle" data-guide="board-modes">
            <button className={boardMode === "kanban" ? "active" : ""} type="button" onClick={() => onBoardModeChange("kanban")} title="Kanban">
              <KanbanSquare size={18} />
            </button>
            <button className={boardMode === "list" ? "active" : ""} type="button" onClick={() => onBoardModeChange("list")} title="Lista">
              <ListFilter size={18} />
            </button>
          </div>
          <Button icon={<RefreshCw size={17} />} variant="secondary" onClick={onRefresh}>Actualizar</Button>
          {canManageProjectMembers ? (
            <Button icon={<Users size={18} />} variant="secondary" data-guide="board-members" onClick={() => {
              setMemberErrorMessage("");
              setIsMemberModalOpen(true);
            }}>
              Miembros proyecto
            </Button>
          ) : undefined}
          {canCreateTasks ? (
            <Button icon={<Plus size={18} />} variant="primary" data-guide="board-new-task" onClick={() => {
              setErrorMessage("");
              setIsCreateModalOpen(true);
            }}>
              Nueva actividad
            </Button>
          ) : undefined}
        </div>
      </header>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" data-guide="board-kpis">
        <StatCard icon={<ClipboardList size={18} />} label="Total" value={boardInsights.total} />
        <StatCard icon={<TimerReset size={18} />} label="Vencidas" value={boardInsights.overdue} tone={boardInsights.overdue > 0 ? "red" : "slate"} />
        <StatCard icon={<CalendarClock size={18} />} label="Vencen hoy" value={boardInsights.dueToday} tone={boardInsights.dueToday > 0 ? "amber" : "slate"} />
        <StatCard icon={<TimerReset size={18} />} label="Sin estimar" value={boardInsights.missingEstimate} tone={boardInsights.missingEstimate > 0 ? "amber" : "slate"} />
      </section>

      {isLoading ? <LoadingState label="Cargando actividades..." rows={4} /> : undefined}

      {boardMode === "kanban" ? (
        <section className="kanban-board" data-guide="board-kanban">
          {tasksByStatus.map((column) => (
            <div className="kanban-column" key={column.status.id}>
              <header>
                <span style={{ background: column.status.color ?? "#64748b" }} />
                <strong>{column.status.name}</strong>
                <small>{column.tasks.length}</small>
              </header>
              <div className="kanban-stack">
                {column.tasks.map((task) => (
                  <TaskCard
                    key={task.id}
                    task={task}
                    statuses={statuses}
                    currentUserId={currentUserId}
                    canEditCompletedTasks={canEditCompletedTasks}
                    selected={selectedTaskId === task.id}
                    onSelect={onSelectTask}
                    onTaskStatusChange={onTaskStatusChange}
                  />
                ))}
                {column.tasks.length === 0 ? (
                  <div className="kanban-empty">
                    <ClipboardList size={20} />
                    Sin actividades
                  </div>
                ) : undefined}
              </div>
            </div>
          ))}
        </section>
      ) : (
        <section className="task-table">
          <div className="task-table-head">
            <span>Actividad</span>
            <span>Estado</span>
            <span>Prioridad</span>
            <span>Fechas</span>
            <span>Vence</span>
            <span>Estimado</span>
          </div>
          {mainTasks.map((task) => (
            <button key={task.id} className="task-row" type="button" onClick={() => onSelectTask(task.id)}>
              <span>{task.title}</span>
              <span>{statuses.find((status) => status.id === task.statusId)?.name ?? "Sin estado"}</span>
              <span>{task.priority}</span>
              <span>{formatDate(task.startAt)} / {formatDate(task.dueAt)}</span>
              <span>{getDueSummary(task.dueAt, isTaskDone(task, statuses)).label}</span>
              <span>{getTaskEstimateLabel(task)}</span>
            </button>
          ))}
        </section>
      )}

      {!isLoading && mainTasks.length === 0 ? (
        <EmptyState
          icon={<ClipboardList size={24} />}
          title="No hay actividades en este tablero"
          description="Crea una actividad cuando el proyecto tenga trabajo asignable."
          action={canCreateTasks ? <Button icon={<Plus size={18} />} variant="primary" onClick={() => setIsCreateModalOpen(true)}>Nueva actividad</Button> : undefined}
        />
      ) : undefined}

      <section className="completed-archive" aria-label="Actividades terminadas" data-guide="board-completed">
        <header className="completed-archive-header">
          <div>
            <p className="eyebrow">Archivo</p>
            <h2>Terminadas</h2>
            <span>
              El tablero activo conserva terminadas durante 3 dias; aqui queda el historial para revisar o reabrir.
            </span>
          </div>
          <strong>{mainCompletedTasks.length}</strong>
        </header>

        {mainCompletedTasks.length > 0 ? (
          <div className="completed-archive-grid">
            {mainCompletedTasks.map((task) => (
              <TaskCard
                key={task.id}
                task={task}
                statuses={statuses}
                currentUserId={currentUserId}
                canEditCompletedTasks={canEditCompletedTasks}
                selected={selectedTaskId === task.id}
                onSelect={onSelectTask}
                onTaskStatusChange={onTaskStatusChange}
              />
            ))}
          </div>
        ) : (
          <div className="completed-empty">
            <EmptyState
              icon={<ClipboardList size={24} />}
              title="Aun no hay terminadas"
              description="Cuando una actividad pase a Terminado aparecera aqui sin ensuciar el tablero operativo."
            />
          </div>
        )}

        {canEditCompletedTasks ? (
          <p className="completed-policy">Admin y gerente pueden reabrir una terminada cambiando su estado desde este archivo.</p>
        ) : (
          <p className="completed-policy">Las terminadas quedan bloqueadas; solo admin o gerente pueden reabrirlas.</p>
        )}
      </section>

      {isCreateModalOpen ? (
        <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="create-task-title">
          <section className="task-modal">
            <header className="modal-header">
              <div>
                <p className="eyebrow">Actividad</p>
                <h2 id="create-task-title">Nueva actividad</h2>
              </div>
              <button className="icon-button" type="button" onClick={() => setIsCreateModalOpen(false)} title="Cerrar">
                <X size={18} />
              </button>
            </header>

            <form className="modal-task-form" onSubmit={handleCreateTask}>
              <label className="task-title-field">
                Actividad
                <input name="title" minLength={2} required placeholder="Nombre claro de la actividad" />
              </label>
              <label>
                Estado
                <select name="statusId" defaultValue={statuses[0]?.id ?? ""}>
                  {statuses.map((status) => (
                    <option key={status.id} value={status.id}>{status.name}</option>
                  ))}
                </select>
              </label>
              <label>
                Prioridad
                <select name="priority" defaultValue="MEDIUM">
                  <option value="LOW">Baja</option>
                  <option value="MEDIUM">Media</option>
                  <option value="HIGH">Alta</option>
                  <option value="URGENT">Urgente</option>
                </select>
              </label>
              <label>
                Inicio
                <input name="startAt" type="date" />
              </label>
              <label>
                Fin
                <input name="dueAt" type="date" />
              </label>
              <label>
                Estimado
                <input name="estimateMinutes" type="number" min={1} placeholder="Minutos" />
              </label>
              <label className="task-assignee-field">
                Asignados
                <select name="assigneeIds" multiple>
                  {projectMembers.map((member: ProjectMember) => (
                    <option key={member.userId} value={member.userId}>{member.user.name}</option>
                  ))}
                </select>
              </label>
              <label className="task-description-field">
                Descripcion
                <textarea name="description" rows={4} placeholder="Objetivo, contexto o criterio de terminado" />
              </label>
              {errorMessage ? <p className="form-error">{errorMessage}</p> : undefined}
              <div className="modal-actions">
                <button className="ghost-button" type="button" onClick={() => setIsCreateModalOpen(false)}>Cancelar</button>
                <button className="primary-action" type="submit" disabled={isCreating || !activeBoard}>
                  <Plus size={18} />
                  {isCreating ? "Creando..." : "Crear actividad"}
                </button>
              </div>
            </form>
          </section>
        </div>
      ) : undefined}

      {isMemberModalOpen ? (
        <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="project-members-title">
          <section className="task-modal project-member-modal">
            <header className="modal-header">
              <div>
                <p className="eyebrow">Proyecto</p>
                <h2 id="project-members-title">Miembros del proyecto</h2>
              </div>
              <button className="icon-button" type="button" onClick={() => setIsMemberModalOpen(false)} title="Cerrar">
                <X size={18} />
              </button>
            </header>

            <section className="project-member-grid">
              <div className="project-member-list">
                <h3>Dentro del proyecto</h3>
                {projectMembers.map((member) => (
                  <article className="member-card compact" key={member.id}>
                    <span>{initials(member.user.name)}</span>
                    <div>
                      <strong>{member.user.name}</strong>
                      <small>{member.user.email}</small>
                    </div>
                    <em>{member.role?.name ?? "Sin rol proyecto"}</em>
                  </article>
                ))}
                {projectMembers.length === 0 ? <p className="muted">No hay miembros agregados.</p> : undefined}
              </div>

              <form className="form-stack" onSubmit={handleAddProjectMember}>
                <h3>Agregar persona</h3>
                <label>
                  Usuario activo
                  <select name="userId" required defaultValue="">
                    <option value="" disabled>Selecciona usuario</option>
                    {availableMembers.map((member) => (
                      <option key={member.id} value={member.userId}>
                        {member.user.name} · {member.user.email}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Rol dentro del proyecto
                  <select name="roleId" defaultValue="">
                    <option value="">Usar rol del workspace</option>
                    {roles.map((role) => (
                      <option key={role.id} value={role.id}>{role.name}</option>
                    ))}
                  </select>
                </label>
                {memberErrorMessage ? <p className="form-error">{memberErrorMessage}</p> : undefined}
                <div className="modal-actions">
                  <button className="ghost-button" type="button" onClick={() => setIsMemberModalOpen(false)}>Cerrar</button>
                  <button className="primary-action" type="submit" disabled={isAddingMember || !activeProject || availableMembers.length === 0}>
                    <Plus size={18} />
                    {isAddingMember ? "Agregando..." : "Agregar al proyecto"}
                  </button>
                </div>
              </form>
            </section>
          </section>
        </div>
      ) : undefined}
    </section>
  );
}
