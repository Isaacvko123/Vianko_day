import { FormEvent, useEffect, useState } from "react";
import { CalendarClock, CheckCircle2, Clock3, GitBranch, MessageSquareText, PanelRightClose, Plus, ShieldAlert, TimerReset } from "lucide-react";
import { Button, EmptyState, LoadingState } from "./ui";
import type { ActivityEvent, BoardStatus, ProjectMember, Task, TaskComment, TaskPriority, TimeLog, WorkspaceMember } from "../types";
import { formatDate, formatMinutes, getDueSummary, getRangeLabel, initials } from "../lib/format";

type TaskDetailPanelProps = {
  task?: Task;
  subtasks: Task[];
  statuses: BoardStatus[];
  projectMembers: ProjectMember[];
  workspaceMembers: WorkspaceMember[];
  comments: TaskComment[];
  timeLogs: TimeLog[];
  events: ActivityEvent[];
  isLoading: boolean;
  currentUserId: string;
  canCreateSubtasks: boolean;
  canMoveClosedTasks: boolean;
  canViewPlanning: boolean;
  canEditPlanning: boolean;
  canModifyCompletedTask: boolean;
  onClose: () => void;
  onUpdateTaskPlan: (input: { startAt?: string; dueAt?: string; estimateMinutes?: number }) => Promise<void>;
  onCreateSubtask: (input: {
    title: string;
    description?: string;
    priority: TaskPriority;
    startAt?: string;
    dueAt?: string;
    estimateMinutes?: number;
    assigneeIds: string[];
  }) => Promise<void>;
  onSubtaskStatusChange: (taskId: string, statusId: string) => Promise<void>;
  onCreateSubtaskTimeLog: (taskId: string, minutes: number, note?: string) => Promise<void>;
  onAddTaskAssignee: (taskId: string, userId: string) => Promise<void>;
  onMentionTaskUser: (taskId: string, userId: string) => Promise<void>;
  onCreateComment: (body: string, isInternal: boolean) => Promise<void>;
  onCreateTimeLog: (minutes: number, note?: string) => Promise<void>;
};

type DetailTab = "summary" | "plan" | "subtasks" | "events" | "comments" | "time";

type VisibleTimeLog = TimeLog & {
  sourceTitle: string;
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

function toDateInput(value?: string) {
  return value ? new Date(value).toISOString().slice(0, 10) : "";
}

function toIsoDate(dateValue: string) {
  return dateValue ? new Date(`${dateValue}T00:00:00.000Z`).toISOString() : undefined;
}

function getRemainingWorkLabel(estimateMinutes: number | undefined, loggedMinutes: number) {
  if (!estimateMinutes) {
    return "Falta estimar";
  }

  const remainingMinutes = estimateMinutes - loggedMinutes;

  if (remainingMinutes <= 0) {
    return "Estimado cubierto";
  }

  return `${formatMinutes(remainingMinutes)} restantes`;
}

function getTaskDoneState(task: Task, statuses: BoardStatus[]) {
  const currentStatus = statuses.find((status) => status.id === task.statusId);
  return Boolean(task.completedAt || currentStatus?.countsAsDone);
}

function getTaskLoggedMinutes(task: Task) {
  return (task.timeLogs ?? []).reduce((sum, log) => sum + log.minutes, 0);
}

function getAssigneeNames(task: Task) {
  const names = (task.assignees ?? []).map((assignee) => assignee.user.name);
  return names.length > 0 ? names.join(", ") : "Sin asignados";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function formatEventDate(value: string) {
  return new Intl.DateTimeFormat("es-MX", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

function getStatusName(statuses: BoardStatus[], statusId: unknown) {
  return typeof statusId === "string"
    ? statuses.find((status) => status.id === statusId)?.name ?? "Estado desconocido"
    : "Estado desconocido";
}

function getChangedFieldLabel(fieldName: string) {
  const labels: Record<string, string> = {
    title: "titulo",
    description: "descripcion",
    priority: "prioridad",
    startAt: "fecha inicio",
    dueAt: "fecha fin",
    estimateMinutes: "estimado",
    progress: "avance"
  };

  return labels[fieldName] ?? fieldName;
}

function getEventText(event: ActivityEvent, statuses: BoardStatus[]) {
  const after = isRecord(event.after) ? event.after : {};
  const before = isRecord(event.before) ? event.before : {};

  switch (event.action) {
    case "task.created":
      return {
        title: "Actividad creada",
        description: "Se registro la actividad en el tablero."
      };
    case "task.updated": {
      const changedFields = Object.keys(after)
        .filter((fieldName) => after[fieldName] !== undefined)
        .map(getChangedFieldLabel);
      return {
        title: "Actividad modificada",
        description: changedFields.length > 0 ? `Cambios en ${changedFields.join(", ")}.` : "Se actualizaron datos de la actividad."
      };
    }
    case "task.status_changed":
      return {
        title: "Estado actualizado",
        description: `${getStatusName(statuses, before.statusId)} -> ${getStatusName(statuses, after.statusId)}.`
      };
    case "task.completed":
      return {
        title: "Actividad terminada",
        description: `Se movio a ${getStatusName(statuses, after.statusId)}.`
      };
    case "task.reopened":
      return {
        title: "Actividad reabierta",
        description: `Regreso a ${getStatusName(statuses, after.statusId)}.`
      };
    case "task.assigned":
      return {
        title: "Asignado agregado",
        description: "Se agrego una persona responsable."
      };
    case "task.unassigned":
      return {
        title: "Asignado removido",
        description: "Se quito una persona responsable."
      };
    case "comment.created":
      return {
        title: "Comentario agregado",
        description: after.isInternal === true ? "Se agrego un comentario interno." : "Se agrego un comentario visible."
      };
    case "time.logged":
      return {
        title: "Tiempo registrado",
        description: typeof after.minutes === "number" ? `Se registraron ${formatMinutes(after.minutes)}.` : "Se registro tiempo trabajado."
      };
    default:
      return {
        title: event.action,
        description: "Evento registrado en la actividad."
      };
  }
}

export function TaskDetailPanel({
  task,
  subtasks,
  statuses,
  projectMembers,
  workspaceMembers,
  comments,
  timeLogs,
  events,
  isLoading,
  currentUserId,
  canCreateSubtasks,
  canMoveClosedTasks,
  canViewPlanning,
  canEditPlanning,
  canModifyCompletedTask,
  onClose,
  onUpdateTaskPlan,
  onCreateSubtask,
  onSubtaskStatusChange,
  onCreateSubtaskTimeLog,
  onAddTaskAssignee,
  onMentionTaskUser,
  onCreateComment,
  onCreateTimeLog
}: TaskDetailPanelProps) {
  const [activeTab, setActiveTab] = useState<DetailTab>("summary");
  const [commentError, setCommentError] = useState("");
  const [timeError, setTimeError] = useState("");
  const [planError, setPlanError] = useState("");
  const [subtaskError, setSubtaskError] = useState("");
  const [subtaskTimeError, setSubtaskTimeError] = useState("");
  const [accessError, setAccessError] = useState("");
  const [isSavingPlan, setIsSavingPlan] = useState(false);
  const [isCreatingSubtask, setIsCreatingSubtask] = useState(false);
  const currentStatus = statuses.find((status) => status.id === task?.statusId);
  const totalMinutes = timeLogs.reduce((sum, log) => sum + log.minutes, 0);
  const subtaskMinutes = subtasks.reduce((sum, subtask) => sum + getTaskLoggedMinutes(subtask), 0);
  const completeWorkMinutes = totalMinutes + subtaskMinutes;
  const visibleTimeLogs: VisibleTimeLog[] = [
    ...timeLogs.map((log) => ({
      ...log,
      sourceTitle: "Actividad principal"
    })),
    ...subtasks.flatMap((subtask) =>
      (subtask.timeLogs ?? []).map((log) => ({
        ...log,
        sourceTitle: subtask.title
      }))
    )
  ];
  const isCurrentTaskDone = Boolean(task?.completedAt || currentStatus?.countsAsDone);
  const isLockedForCurrentUser = isCurrentTaskDone && !canModifyCompletedTask;
  const isPlanningLocked = isLockedForCurrentUser || !canEditPlanning;
  const dueSummary = getDueSummary(task?.dueAt, isCurrentTaskDone);
  const rangeLabel = getRangeLabel(task?.startAt, task?.dueAt);
  const completedSubtasks = subtasks.filter((subtask) => getTaskDoneState(subtask, statuses)).length;
  const subtaskProgress = subtasks.length > 0 ? Math.round((completedSubtasks / subtasks.length) * 100) : 0;
  const participantNames = task ? getAssigneeNames(task) : "Sin asignados";
  const mentionedNames = task?.mentions?.map((mention) => mention.user.name).join(", ") || "Sin menciones";
  const currentAssigneeIds = new Set((task?.assignees ?? []).map((assignee) => assignee.userId));
  const currentMentionIds = new Set((task?.mentions ?? []).map((mention) => mention.userId));
  const projectAssignableMembers = projectMembers.filter((member) => !currentAssigneeIds.has(member.userId));
  const mentionableMembers = workspaceMembers.filter((member) =>
    member.status === "ACTIVE" &&
    !currentAssigneeIds.has(member.userId) &&
    !currentMentionIds.has(member.userId)
  );
  const timeByUser = Array.from(
    visibleTimeLogs.reduce((rows, log) => {
      const userName = log.user?.name ?? "Usuario sin nombre";
      const currentMinutes = rows.get(userName) ?? 0;
      rows.set(userName, currentMinutes + log.minutes);
      return rows;
    }, new Map<string, number>())
  ).map(([name, minutes]) => ({ name, minutes }));

  useEffect(() => {
    setActiveTab(task?.completedAt ? "events" : "summary");
    setCommentError("");
    setTimeError("");
    setPlanError("");
    setSubtaskError("");
    setSubtaskTimeError("");
    setAccessError("");
  }, [task?.id]);

  useEffect(() => {
    if (!canViewPlanning && activeTab === "plan") {
      setActiveTab("summary");
    }
  }, [activeTab, canViewPlanning]);

  async function handlePlanSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPlanError("");
    setIsSavingPlan(true);

    try {
      const form = event.currentTarget;
      const startAt = readFormString(form, "startAt");
      const dueAt = readFormString(form, "dueAt");
      const estimateText = readFormString(form, "estimateMinutes");

      if (startAt && dueAt && dueAt < startAt) {
        throw new Error("La fecha fin no puede ser anterior a la fecha inicio.");
      }

      await onUpdateTaskPlan({
        startAt: toIsoDate(startAt),
        dueAt: toIsoDate(dueAt),
        estimateMinutes: estimateText ? Number(estimateText) : undefined
      });
    } catch (error) {
      setPlanError(error instanceof Error ? error.message : "No se pudo guardar la planeacion.");
    } finally {
      setIsSavingPlan(false);
    }
  }

  async function handleCommentSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCommentError("");

    try {
      const form = event.currentTarget;
      await onCreateComment(readFormString(form, "body"), readFormString(form, "isInternal") === "yes");
      form.reset();
    } catch (error) {
      setCommentError(error instanceof Error ? error.message : "No se pudo guardar el comentario.");
    }
  }

  async function handleSubtaskSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubtaskError("");
    setIsCreatingSubtask(true);

    try {
      const form = event.currentTarget;
      const title = readFormString(form, "title");
      const description = readFormString(form, "description");
      const startAt = readFormString(form, "startAt");
      const dueAt = readFormString(form, "dueAt");
      const estimateText = readFormString(form, "estimateMinutes");

      if (startAt && dueAt && dueAt < startAt) {
        throw new Error("La fecha fin no puede ser anterior a la fecha inicio.");
      }

      await onCreateSubtask({
        title,
        description: description || undefined,
        priority: readFormString(form, "priority") as TaskPriority,
        startAt: toIsoDate(startAt),
        dueAt: toIsoDate(dueAt),
        estimateMinutes: estimateText ? Number(estimateText) : undefined,
        assigneeIds: readFormStrings(form, "assigneeIds")
      });

      form.reset();
    } catch (error) {
      setSubtaskError(error instanceof Error ? error.message : "No se pudo crear la subtarea.");
    } finally {
      setIsCreatingSubtask(false);
    }
  }

  async function handleSubtaskTimeSubmit(event: FormEvent<HTMLFormElement>, subtaskId: string) {
    event.preventDefault();
    setSubtaskTimeError("");

    try {
      const form = event.currentTarget;
      const minutes = Number(readFormString(form, "minutes"));
      const note = readFormString(form, "note");
      await onCreateSubtaskTimeLog(subtaskId, minutes, note || undefined);
      form.reset();
    } catch (error) {
      setSubtaskTimeError(error instanceof Error ? error.message : "No se pudo registrar tiempo en la subtarea.");
    }
  }

  async function handleTimeSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setTimeError("");

    try {
      const form = event.currentTarget;
      const minutes = Number(readFormString(form, "minutes"));
      const note = readFormString(form, "note");
      await onCreateTimeLog(minutes, note || undefined);
      form.reset();
    } catch (error) {
      setTimeError(error instanceof Error ? error.message : "No se pudo registrar el tiempo.");
    }
  }

  async function handleAddAssigneeSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAccessError("");
    const form = event.currentTarget;

    try {
      const userId = readFormString(form, "userId");
      await onAddTaskAssignee(task?.id ?? "", userId);
      form.reset();
    } catch (error) {
      setAccessError(error instanceof Error ? error.message : "No se pudo asignar a la persona.");
    }
  }

  async function handleMentionSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAccessError("");
    const form = event.currentTarget;

    try {
      const userId = readFormString(form, "userId");
      await onMentionTaskUser(task?.id ?? "", userId);
      form.reset();
    } catch (error) {
      setAccessError(error instanceof Error ? error.message : "No se pudo mencionar a la persona.");
    }
  }

  if (!task) {
    return <></>;
  }

  return (
    <div className="modal-backdrop detail-backdrop" role="dialog" aria-modal="true" aria-labelledby="task-detail-title">
      <aside className="detail-modal">
        <header className="modal-header">
          <div>
            <p className="eyebrow">Detalle</p>
            <h2 id="task-detail-title">{task.title}</h2>
          </div>
          <button className="icon-button" type="button" onClick={onClose} title="Cerrar detalle">
            <PanelRightClose size={18} />
          </button>
        </header>

        <nav className="detail-tabs" aria-label="Secciones de actividad">
          <button className={activeTab === "summary" ? "active" : ""} type="button" onClick={() => setActiveTab("summary")}>Resumen</button>
          {canViewPlanning ? (
            <button className={activeTab === "plan" ? "active" : ""} type="button" onClick={() => setActiveTab("plan")}>Planeacion</button>
          ) : undefined}
          <button className={activeTab === "subtasks" ? "active" : ""} data-guide="task-subtasks-tab" type="button" onClick={() => setActiveTab("subtasks")}>Subtareas</button>
          <button className={activeTab === "events" ? "active" : ""} type="button" onClick={() => setActiveTab("events")}>Eventos</button>
          <button className={activeTab === "comments" ? "active" : ""} type="button" onClick={() => setActiveTab("comments")}>Comentarios</button>
          <button className={activeTab === "time" ? "active" : ""} type="button" onClick={() => setActiveTab("time")}>Tiempo</button>
        </nav>

        <div className="detail-body">
          {isLockedForCurrentUser ? (
            <div className="locked-note">
              <ShieldAlert size={17} />
              <span>Actividad terminada. Puedes revisarla, pero solo Admin/Admin TI puede reabrir o editar datos bloqueados.</span>
            </div>
          ) : undefined}

          {activeTab === "summary" ? (
            <section className="detail-section">
            <div className={`planning-callout due-${dueSummary.tone}`}>
              <CalendarClock size={20} />
              <div>
                <span>Vencimiento</span>
                <strong>{dueSummary.label}</strong>
                <small>{rangeLabel}</small>
              </div>
            </div>
            <div className="detail-grid">
              <span>
                Estado
                <strong>{currentStatus?.name ?? "Sin estado"}</strong>
              </span>
              <span>
                Prioridad
                <strong>{task.priority}</strong>
              </span>
              <span>
                Fecha inicio
                <strong>{formatDate(task.startAt)}</strong>
              </span>
              <span>
                Fecha fin
                <strong>{formatDate(task.dueAt)}</strong>
              </span>
              <span>
                Estimado
                <strong>{task.estimateMinutes ? formatMinutes(task.estimateMinutes) : "Falta estimar"}</strong>
              </span>
              <span>
                Trabajo pendiente
                <strong>{getRemainingWorkLabel(task.estimateMinutes, totalMinutes)}</strong>
              </span>
              <span>
                Tiempo total
                <strong>{formatMinutes(completeWorkMinutes)}</strong>
              </span>
              <span>
                Participantes
                <strong>{(task.assignees ?? []).length}</strong>
              </span>
            </div>
            <p className="description-text">{task.description || "Sin descripcion."}</p>
            <div className="participant-panel">
              <span>Participantes asignados</span>
              <strong>{participantNames}</strong>
              <span>Mencionados con visibilidad</span>
              <strong>{mentionedNames}</strong>
            </div>
            {canEditPlanning && !isLockedForCurrentUser ? (
              <div className="task-access-panel" data-guide="task-access-panel">
                <form onSubmit={handleAddAssigneeSubmit}>
                  <label>
                    Asignar responsable
                    <select name="userId" required defaultValue="">
                      <option value="" disabled>Persona del proyecto</option>
                      {projectAssignableMembers.map((member) => (
                        <option key={member.userId} value={member.userId}>{member.user.name} · {member.user.email}</option>
                      ))}
                    </select>
                  </label>
                  <Button variant="secondary" type="submit" disabled={projectAssignableMembers.length === 0}>Asignar</Button>
                </form>
                <form onSubmit={handleMentionSubmit}>
                  <label>
                    Mencionar para dar visibilidad
                    <select name="userId" required defaultValue="">
                      <option value="" disabled>Usuario activo del workspace</option>
                      {mentionableMembers.map((member) => (
                        <option key={member.userId} value={member.userId}>{member.user.name} · {member.user.email}</option>
                      ))}
                    </select>
                  </label>
                  <Button variant="secondary" type="submit" disabled={mentionableMembers.length === 0}>Mencionar</Button>
                </form>
                {accessError ? <p className="form-error">{accessError}</p> : undefined}
              </div>
            ) : undefined}
            <div className="subtask-summary-card" data-guide="task-subtasks-summary">
              <div>
                <GitBranch size={18} />
                <span>
                  <strong>{completedSubtasks}/{subtasks.length}</strong>
                  subtareas terminadas
                </span>
              </div>
              <div className="progress-track">
                <span style={{ width: `${subtaskProgress}%` }} />
              </div>
              <small>{subtasks.length > 0 ? `${subtaskProgress}% de avance en subtareas` : "Agrega subtareas para dividir el trabajo."}</small>
            </div>
            <div className="avatar-line">
              {(task.assignees ?? []).map((assignee) => (
                <span key={assignee.id} title={`${assignee.user.name} · ${assignee.user.email}`}>{initials(assignee.user.name)}</span>
              ))}
            </div>
          </section>
          ) : undefined}

          {activeTab === "subtasks" ? (
            <section className="detail-section" data-guide="task-subtasks">
              <h3><GitBranch size={17} /> Subtareas</h3>
              <div className="subtask-progress">
                <span>{completedSubtasks}/{subtasks.length} terminadas</span>
                <div className="progress-track">
                  <span style={{ width: `${subtaskProgress}%` }} />
                </div>
                <strong>{subtaskProgress}%</strong>
              </div>

              <div className="subtask-list">
                {subtasks.map((subtask) => {
                  const done = getTaskDoneState(subtask, statuses);
                  const assignedToUser = Boolean((subtask.assignees ?? []).some((assignee) => assignee.userId === currentUserId));
                  const canMoveSubtask = (assignedToUser || canMoveClosedTasks) && (!done || canMoveClosedTasks);
                  const loggedMinutes = getTaskLoggedMinutes(subtask);

                  return (
                    <article className={done ? "subtask-item done" : "subtask-item"} key={subtask.id}>
                      <span>{done ? <CheckCircle2 size={16} /> : <GitBranch size={16} />}</span>
                      <div>
                        <strong>{subtask.title}</strong>
                        <small>{subtask.description || "Sin descripcion"}</small>
                        <div className="subtask-metrics">
                          <span>Inicio <strong>{formatDate(subtask.startAt)}</strong></span>
                          <span>Fin plan <strong>{formatDate(subtask.dueAt)}</strong></span>
                          <span>Fin real <strong>{formatDate(subtask.completedAt)}</strong></span>
                          <span>Estimado <strong>{subtask.estimateMinutes ? formatMinutes(subtask.estimateMinutes) : "Sin estimar"}</strong></span>
                          <span>Invertido <strong>{formatMinutes(loggedMinutes)}</strong></span>
                          <span>Asignados <strong>{getAssigneeNames(subtask)}</strong></span>
                        </div>
                        {!done && !isLockedForCurrentUser ? (
                          <form className="subtask-time-form" onSubmit={(event) => void handleSubtaskTimeSubmit(event, subtask.id)}>
                            <input name="minutes" type="number" min={1} max={1440} required placeholder="Min" />
                            <input name="note" placeholder="Nota de avance" />
                            <Button variant="ghost" type="submit">Registrar tiempo</Button>
                          </form>
                        ) : undefined}
                      </div>
                      <select
                        value={subtask.statusId}
                        disabled={!canMoveSubtask}
                        title={canMoveSubtask ? "Cambiar estado de subtarea" : "Solo asignados pueden moverla; cerradas solo admin o gerente."}
                        onChange={(event) => void onSubtaskStatusChange(subtask.id, event.target.value)}
                      >
                        {statuses.map((status) => (
                          <option key={status.id} value={status.id}>{status.name}</option>
                        ))}
                      </select>
                    </article>
                  );
                })}
                {subtaskTimeError ? <p className="form-error">{subtaskTimeError}</p> : undefined}
                {!isLoading && subtasks.length === 0 ? (
                  <EmptyState title="Sin subtareas" description="Divide una actividad grande en pasos concretos para que el avance sea mas claro." />
                ) : undefined}
              </div>

              {isLockedForCurrentUser || !canCreateSubtasks ? (
                <p className="locked-inline">Solo gerencia/admin puede crear subtareas y las actividades terminadas quedan bloqueadas.</p>
              ) : (
                <form className="subtask-form" onSubmit={handleSubtaskSubmit}>
                  <label className="subtask-title-field">
                    Subtarea
                    <input name="title" minLength={2} required placeholder="Paso concreto dentro de esta actividad" />
                  </label>
                  <label>
                    Prioridad
                    <select name="priority" defaultValue={task.priority}>
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
                  <label className="subtask-assignee-field">
                    Asignados
                    <select name="assigneeIds" multiple>
                      {projectMembers.map((member) => (
                        <option key={member.userId} value={member.userId}>{member.user.name}</option>
                      ))}
                    </select>
                  </label>
                  <label className="subtask-description-field">
                    Descripcion
                    <textarea name="description" rows={3} placeholder="Criterio para marcar esta subtarea como lista" />
                  </label>
                  {subtaskError ? <p className="form-error">{subtaskError}</p> : undefined}
                  <Button icon={<Plus size={17} />} variant="secondary" type="submit" disabled={isCreatingSubtask}>
                    {isCreatingSubtask ? "Creando..." : "Crear subtarea"}
                  </Button>
                </form>
              )}
            </section>
          ) : undefined}

          {canViewPlanning && activeTab === "plan" ? (
            <section className="detail-section">
              <div className={`planning-callout due-${dueSummary.tone}`}>
                <CalendarClock size={20} />
                <div>
                  <span>Planeacion</span>
                  <strong>{dueSummary.label}</strong>
                  <small>{rangeLabel}</small>
                </div>
              </div>
              <form className="plan-form" key={task.id} onSubmit={handlePlanSubmit}>
              <label>
                Inicio
                <input name="startAt" type="date" defaultValue={toDateInput(task.startAt)} disabled={isPlanningLocked} />
              </label>
              <label>
                Fin
                <input name="dueAt" type="date" defaultValue={toDateInput(task.dueAt)} disabled={isPlanningLocked} />
              </label>
              <label>
                Estimado
                <input name="estimateMinutes" type="number" min={1} placeholder="Minutos" defaultValue={task.estimateMinutes ?? ""} disabled={isPlanningLocked} />
              </label>
              {planError ? <p className="form-error">{planError}</p> : undefined}
              {isPlanningLocked ? (
                <p className="locked-inline">La planeacion solo la modifica gerencia/admin; si esta terminada queda congelada salvo reapertura autorizada.</p>
              ) : (
                <Button variant="secondary" type="submit" disabled={isSavingPlan}>
                  {isSavingPlan ? "Guardando..." : "Guardar planeacion"}
                </Button>
              )}
            </form>
          </section>
          ) : undefined}

          {activeTab === "events" ? (
            <section className="detail-section">
              <h3><TimerReset size={17} /> Eventos y cambios</h3>
              {isLoading ? <LoadingState label="Cargando eventos..." rows={3} /> : undefined}
              <div className="event-timeline">
                {events.map((event) => {
                  const eventText = getEventText(event, statuses);

                  return (
                    <article key={event.id} className="event-card">
                      <span />
                      <div>
                        <header>
                          <strong>{eventText.title}</strong>
                          <small>{formatEventDate(event.createdAt)}</small>
                        </header>
                        <p>{eventText.description}</p>
                        <small>{event.actor?.name ?? "Sistema"}</small>
                      </div>
                    </article>
                  );
                })}
              </div>
              {!isLoading && events.length === 0 ? <EmptyState title="Sin eventos registrados" description="Los cambios importantes de la actividad apareceran aqui." /> : undefined}
            </section>
          ) : undefined}

          {activeTab === "comments" ? (
            <section className="detail-section">
            <h3><MessageSquareText size={17} /> Comentarios</h3>
            {isLoading ? <LoadingState label="Cargando comentarios..." rows={2} /> : undefined}
            <div className="comment-list">
              {comments.map((comment) => (
                <article key={comment.id} className="comment-card">
                  <div>
                    <strong>{comment.user.name}</strong>
                    {comment.isInternal ? <span><ShieldAlert size={13} /> Interno</span> : undefined}
                  </div>
                  <p>{comment.body}</p>
                  <small>{formatDate(comment.createdAt)}</small>
                </article>
              ))}
            </div>
            {isLockedForCurrentUser ? (
              <p className="locked-inline">Comentarios cerrados porque la actividad ya fue terminada.</p>
            ) : (
              <form className="form-stack" onSubmit={handleCommentSubmit}>
                <textarea name="body" rows={3} required placeholder="Escribe un comentario" />
                <label className="inline-check">
                  <input type="checkbox" name="isInternal" value="yes" />
                  Comentario interno
                </label>
                {commentError ? <p className="form-error">{commentError}</p> : undefined}
                <Button variant="secondary" type="submit">Comentar</Button>
              </form>
            )}
          </section>
          ) : undefined}

          {activeTab === "time" ? (
            <section className="detail-section">
            <h3><Clock3 size={17} /> Tiempo trabajado</h3>
            <div className="time-total">
              <TimerReset size={17} />
              <strong>{formatMinutes(totalMinutes)} registrados</strong>
              <span>{getRemainingWorkLabel(task.estimateMinutes, totalMinutes)}</span>
            </div>
            <div className="time-summary-grid">
              <span>
                Actividad principal
                <strong>{formatMinutes(totalMinutes)}</strong>
              </span>
              <span>
                Subtareas
                <strong>{formatMinutes(subtaskMinutes)}</strong>
              </span>
              <span>
                Total real
                <strong>{formatMinutes(completeWorkMinutes)}</strong>
              </span>
              <span>
                Estimado
                <strong>{task.estimateMinutes ? formatMinutes(task.estimateMinutes) : "Falta estimar"}</strong>
              </span>
            </div>
            <div className="time-by-user">
              <strong>Tiempo por participante</strong>
              {timeByUser.map((row) => (
                <span key={row.name}>
                  {row.name}
                  <b>{formatMinutes(row.minutes)}</b>
                </span>
              ))}
              {timeByUser.length === 0 ? <small>Aun no hay tiempo por persona.</small> : undefined}
            </div>
            <div className="time-list">
              {visibleTimeLogs.map((log) => (
                <article key={`${log.sourceTitle}-${log.id}`}>
                  <strong>{formatMinutes(log.minutes)}</strong>
                  <span>{log.note || "Sin nota"}</span>
                  <em>{log.user?.name ?? "Usuario sin nombre"}</em>
                  <small>{log.sourceTitle} · {formatDate(log.logDate)}</small>
                </article>
              ))}
              {!isLoading && visibleTimeLogs.length === 0 ? <EmptyState title="Sin tiempo registrado" description="Registra minutos trabajados para alimentar reportes y estimado real." /> : undefined}
            </div>
            {isLockedForCurrentUser ? (
              <p className="locked-inline">Tiempo cerrado porque la actividad ya fue terminada.</p>
            ) : (
              <form className="time-form" onSubmit={handleTimeSubmit}>
                <input name="minutes" type="number" min={1} max={1440} required placeholder="Min" />
                <input name="note" placeholder="Nota opcional" />
                {timeError ? <p className="form-error">{timeError}</p> : undefined}
                <Button variant="secondary" type="submit">Registrar</Button>
              </form>
            )}
          </section>
          ) : undefined}
        </div>
      </aside>
    </div>
  );
}
