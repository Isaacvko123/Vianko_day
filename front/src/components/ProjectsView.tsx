import { FormEvent, useState } from "react";
import { Archive, CalendarDays, CirclePlus, Edit3, FolderKanban, Lock, RefreshCw, TimerReset, Users, X } from "lucide-react";
import { Badge, Button, EmptyState, LoadingState, PageHeader, StatCard } from "./ui";
import type { Area, Locality, Project } from "../types";
import { formatDate, getDueSummary } from "../lib/format";

type ProjectsViewProps = {
  projects: Project[];
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
    localityId?: string;
    name?: string;
    description?: string;
    visibility?: "WORKSPACE" | "PRIVATE";
    color?: string;
    startDate?: string;
    endDate?: string;
  }) => Promise<void>;
  onArchiveProject: (projectId: string) => Promise<void>;
};

function readFormString(form: HTMLFormElement, fieldName: string) {
  const value = new FormData(form).get(fieldName);
  return typeof value === "string" ? value.trim() : "";
}

function toIsoDate(dateValue: string) {
  return dateValue ? new Date(`${dateValue}T00:00:00.000Z`).toISOString() : undefined;
}

function toDateInput(value?: string) {
  return value ? new Date(value).toISOString().slice(0, 10) : "";
}

export function ProjectsView({
  projects,
  areas,
  localities,
  activeProjectId,
  isLoading,
  canCreateProjects,
  canDeleteProjects,
  onRefresh,
  onSelectProject,
  onCreateProject,
  onUpdateProject,
  onArchiveProject
}: ProjectsViewProps) {
  const [isCreating, setIsCreating] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [isArchiving, setIsArchiving] = useState(false);
  const [isProjectModalOpen, setIsProjectModalOpen] = useState(false);
  const [projectToEdit, setProjectToEdit] = useState<Project>();
  const [selectedAreaId, setSelectedAreaId] = useState("");
  const [editAreaId, setEditAreaId] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const projectLocalities = selectedAreaId
    ? localities.filter((locality) => locality.areaId === selectedAreaId)
    : localities;
  const editProjectLocalities = editAreaId
    ? localities.filter((locality) => locality.areaId === editAreaId)
    : localities;
  const privateProjects = projects.filter((project) => project.visibility === "PRIVATE").length;
  const workspaceProjects = projects.length - privateProjects;
  const projectsWithDates = projects.filter((project) => project.startDate || project.endDate).length;
  const overdueProjects = projects.filter((project) => getDueSummary(project.endDate, false).tone === "overdue").length;

  async function handleCreateProject(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage("");
    setIsCreating(true);

    try {
      const form = event.currentTarget;
      const description = readFormString(form, "description");
      const startDate = readFormString(form, "startDate");
      const endDate = readFormString(form, "endDate");

      if (startDate && endDate && endDate < startDate) {
        throw new Error("La fecha fin no puede ser anterior a la fecha inicio.");
      }

      await onCreateProject({
        areaId: selectedAreaId || undefined,
        localityId: readFormString(form, "localityId") || undefined,
        name: readFormString(form, "name"),
        description: description || undefined,
        visibility: readFormString(form, "visibility") === "PRIVATE" ? "PRIVATE" : "WORKSPACE",
        color: readFormString(form, "color") || undefined,
        startDate: toIsoDate(startDate),
        endDate: toIsoDate(endDate)
      });

      form.reset();
      setSelectedAreaId("");
      setIsProjectModalOpen(false);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "No se pudo crear el proyecto.");
    } finally {
      setIsCreating(false);
    }
  }

  async function handleUpdateProject(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage("");

    if (!projectToEdit) {
      setErrorMessage("Selecciona un proyecto para editar.");
      return;
    }

    setIsUpdating(true);

    try {
      const form = event.currentTarget;
      const description = readFormString(form, "description");
      const startDate = readFormString(form, "startDate");
      const endDate = readFormString(form, "endDate");

      if (startDate && endDate && endDate < startDate) {
        throw new Error("La fecha fin no puede ser anterior a la fecha inicio.");
      }

      await onUpdateProject(projectToEdit.id, {
        areaId: editAreaId || undefined,
        localityId: readFormString(form, "localityId") || undefined,
        name: readFormString(form, "name"),
        description: description || undefined,
        visibility: readFormString(form, "visibility") === "PRIVATE" ? "PRIVATE" : "WORKSPACE",
        color: readFormString(form, "color") || undefined,
        startDate: toIsoDate(startDate),
        endDate: toIsoDate(endDate)
      });

      setProjectToEdit(undefined);
      setEditAreaId("");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "No se pudo actualizar el proyecto.");
    } finally {
      setIsUpdating(false);
    }
  }

  async function handleArchiveProject() {
    setErrorMessage("");

    if (!projectToEdit) {
      setErrorMessage("Selecciona un proyecto para archivar.");
      return;
    }

    const shouldArchive = window.confirm(`Archivar "${projectToEdit.name}" lo quitara de la operacion activa, tableros y reportes vigentes. El historial queda guardado para auditoria. ¿Continuar?`);

    if (!shouldArchive) {
      return;
    }

    setIsArchiving(true);

    try {
      await onArchiveProject(projectToEdit.id);
      setProjectToEdit(undefined);
      setEditAreaId("");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "No se pudo archivar el proyecto.");
    } finally {
      setIsArchiving(false);
    }
  }

  return (
    <section className="page projects-page">
      <PageHeader
        eyebrow="Proyectos"
        title="Trabajo organizado por alcance"
        description="Cada proyecto define area, localidad, fechas, privacidad y el equipo que puede trabajar dentro."
        actions={(
          <>
            <Button icon={<RefreshCw size={17} />} variant="secondary" onClick={onRefresh}>Actualizar</Button>
            {canCreateProjects ? (
              <Button icon={<CirclePlus size={18} />} variant="primary" data-guide="projects-new" onClick={() => {
                setErrorMessage("");
                setIsProjectModalOpen(true);
              }}>
                Nuevo proyecto
              </Button>
            ) : undefined}
          </>
        )}
      />

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5" data-guide="projects-stats">
        <StatCard icon={<FolderKanban size={18} />} label="Total" value={projects.length} />
        <StatCard icon={<Lock size={18} />} label="Privados" value={privateProjects} tone="slate" />
        <StatCard icon={<Users size={18} />} label="Area" value={workspaceProjects} tone="green" />
        <StatCard icon={<TimerReset size={18} />} label="Vencidos" value={overdueProjects} tone={overdueProjects > 0 ? "red" : "slate"} />
        <StatCard icon={<CalendarDays size={18} />} label="Con fechas" value={projectsWithDates} tone="blue" />
      </section>

      <section className="project-list project-grid">
          {isLoading ? <LoadingState className="col-span-full" label="Cargando proyectos..." rows={4} /> : undefined}
          {projects.map((project) => (
            <article
              key={project.id}
              className={activeProjectId === project.id ? "project-card active" : "project-card"}
              data-guide="projects-card"
            >
              <button className="project-card-main" type="button" onClick={() => onSelectProject(project.id)}>
                <span className="project-color" style={{ background: project.color ?? "#2563eb" }} />
                <span>
                  <span className="project-card-header">
                    <strong>{project.name}</strong>
                    <Badge tone={project.visibility === "PRIVATE" ? "slate" : "blue"}>{project.visibility === "PRIVATE" ? "Privado" : "Workspace"}</Badge>
                  </span>
                  <small>{project.description || "Sin descripcion"}</small>
                  <span className="project-dates">
                    <CalendarDays size={14} />
                    Inicio {formatDate(project.startDate)} · Fin {formatDate(project.endDate)}
                  </span>
                  <span className="meta-row">
                    {project.visibility === "PRIVATE" ? <Lock size={14} /> : <Users size={14} />}
                    {project.visibility === "PRIVATE" ? "Privado" : "Workspace"}
                    {project.area ? <span>{project.area.name}</span> : undefined}
                    {project.locality ? <span>{project.locality.name}</span> : undefined}
                    <span>Creado {formatDate(project.createdAt)}</span>
                  </span>
                </span>
              </button>
              {canCreateProjects ? (
                <button className="project-edit-button" type="button" onClick={() => {
                  setErrorMessage("");
                  setProjectToEdit(project);
                  setEditAreaId(project.areaId ?? "");
                }}>
                  <Edit3 size={15} />
                  Editar
                </button>
              ) : undefined}
            </article>
          ))}
          {!isLoading && projects.length === 0 ? (
            <EmptyState
              className="col-span-full"
              icon={<FolderKanban size={24} />}
              title="Aun no hay proyectos"
              description="Crea el primer proyecto para activar tablero, asignados y seguimiento."
              action={canCreateProjects ? <Button icon={<CirclePlus size={18} />} variant="primary" onClick={() => setIsProjectModalOpen(true)}>Crear proyecto</Button> : undefined}
            />
          ) : undefined}
      </section>

      {isProjectModalOpen ? (
        <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="create-project-title">
          <section className="task-modal admin-modal">
            <header className="modal-header">
              <div>
                <p className="eyebrow">Proyecto</p>
                <h2 id="create-project-title">Crear proyecto</h2>
              </div>
              <button className="icon-button" type="button" onClick={() => setIsProjectModalOpen(false)} title="Cerrar">
                <X size={18} />
              </button>
            </header>

            <form className="form-stack admin-modal-form" onSubmit={handleCreateProject}>
              <label>
                Nombre
                <input name="name" minLength={2} required placeholder="Implementacion cliente A" />
              </label>
              <label>
                Visibilidad
                <select name="visibility" defaultValue="PRIVATE">
                  <option value="PRIVATE">Privado</option>
                  <option value="WORKSPACE">Visible para gerencia del area</option>
                </select>
              </label>
              <label className="wide-field">
                Descripcion
                <textarea name="description" rows={4} placeholder="Objetivo, alcance o notas del proyecto" />
              </label>
              <label>
                Area
                <select name="areaId" value={selectedAreaId} onChange={(event) => setSelectedAreaId(event.currentTarget.value)}>
                  <option value="">Mi area</option>
                  {areas.map((area) => (
                    <option key={area.id} value={area.id}>{area.name}</option>
                  ))}
                </select>
              </label>
              <label>
                Localidad
                <select name="localityId" key={selectedAreaId} defaultValue="">
                  <option value="">Mi localidad</option>
                  {projectLocalities.map((locality) => (
                    <option key={locality.id} value={locality.id}>{locality.name}</option>
                  ))}
                </select>
              </label>
              <label>
                Fecha inicio
                <input name="startDate" type="date" />
              </label>
              <label>
                Fecha fin
                <input name="endDate" type="date" />
              </label>
              <label>
                Color
                <input name="color" type="color" defaultValue="#2563eb" />
              </label>
              {errorMessage ? <p className="form-error wide-field">{errorMessage}</p> : undefined}
              <div className="modal-actions">
                <button className="ghost-button" type="button" onClick={() => setIsProjectModalOpen(false)}>Cancelar</button>
                <button className="primary-action" type="submit" disabled={isCreating}>
                  <CirclePlus size={18} />
                  {isCreating ? "Creando..." : "Crear proyecto"}
                </button>
              </div>
            </form>
          </section>
        </div>
      ) : undefined}

      {projectToEdit ? (
        <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="edit-project-title">
          <section className="task-modal admin-modal">
            <header className="modal-header">
              <div>
                <p className="eyebrow">Proyecto</p>
                <h2 id="edit-project-title">Editar proyecto</h2>
              </div>
              <button className="icon-button" type="button" onClick={() => setProjectToEdit(undefined)} title="Cerrar">
                <X size={18} />
              </button>
            </header>

            <form className="form-stack admin-modal-form" onSubmit={handleUpdateProject}>
              <label>
                Nombre
                <input name="name" minLength={2} required defaultValue={projectToEdit.name} />
              </label>
              <label>
                Visibilidad
                <select name="visibility" defaultValue={projectToEdit.visibility}>
                  <option value="PRIVATE">Privado</option>
                  <option value="WORKSPACE">Visible para gerencia del area</option>
                </select>
              </label>
              <label className="wide-field">
                Descripcion
                <textarea name="description" rows={4} defaultValue={projectToEdit.description ?? ""} />
              </label>
              <label>
                Area
                <select name="areaId" value={editAreaId} onChange={(event) => setEditAreaId(event.currentTarget.value)}>
                  <option value="">Mi area</option>
                  {areas.map((area) => (
                    <option key={area.id} value={area.id}>{area.name}</option>
                  ))}
                </select>
              </label>
              <label>
                Localidad
                <select name="localityId" key={editAreaId} defaultValue={projectToEdit.localityId ?? ""}>
                  <option value="">Mi localidad</option>
                  {editProjectLocalities.map((locality) => (
                    <option key={locality.id} value={locality.id}>{locality.name}</option>
                  ))}
                </select>
              </label>
              <label>
                Fecha inicio
                <input name="startDate" type="date" defaultValue={toDateInput(projectToEdit.startDate)} />
              </label>
              <label>
                Fecha fin
                <input name="endDate" type="date" defaultValue={toDateInput(projectToEdit.endDate)} />
              </label>
              <label>
                Color
                <input name="color" type="color" defaultValue={projectToEdit.color ?? "#2563eb"} />
              </label>
              {errorMessage ? <p className="form-error wide-field">{errorMessage}</p> : undefined}
              {canDeleteProjects ? (
                <section className="project-danger-zone wide-field">
                  <span>
                    <strong>Archivar proyecto</strong>
                    <small>Quita el proyecto de la operacion activa sin borrar auditoria, actividades ni tiempos historicos.</small>
                  </span>
                  <button className="secondary-action danger-soft" type="button" disabled={isArchiving} onClick={() => void handleArchiveProject()}>
                    <Archive size={18} />
                    {isArchiving ? "Archivando..." : "Archivar"}
                  </button>
                </section>
              ) : undefined}
              <div className="modal-actions">
                <button className="ghost-button" type="button" onClick={() => setProjectToEdit(undefined)}>Cancelar</button>
                <button className="primary-action" type="submit" disabled={isUpdating}>
                  <Edit3 size={18} />
                  {isUpdating ? "Guardando..." : "Guardar cambios"}
                </button>
              </div>
            </form>
          </section>
        </div>
      ) : undefined}
    </section>
  );
}
