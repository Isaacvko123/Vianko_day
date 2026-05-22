import { useEffect, useMemo, useState } from "react";
import { Archive, CalendarClock, ChevronLeft, ChevronRight, RefreshCw, Search, Users } from "lucide-react";
import { Button, EmptyState, LoadingState, StatCard } from "./ui";
import { formatDate, formatMinutes } from "../lib/format";
import type { CompletedProjectArchive } from "../hooks/useProjectBoardController";
import type { Project, Task } from "../types";

type CompletedTasksViewProps = {
  archive: CompletedProjectArchive[];
  isLoading: boolean;
  selectedTaskId?: string;
  onRefresh: () => void;
  onOpenTask: (projectId: string, taskId: string) => void;
};

type CompletedTaskRow = {
  project: Project;
  task: Task;
};

const completedPageSizeOptions = [10, 25, 50] as const;

function getDateInputValue(value?: string) {
  return value ? value.slice(0, 10) : "";
}

function getTaskActualMinutes(task: Task) {
  return (task.timeLogs ?? []).reduce((sum, log) => sum + log.minutes, 0);
}

function getTaskEstimateLabel(task: Task) {
  return task.estimateMinutes ? formatMinutes(task.estimateMinutes) : "Falta estimar";
}

function getTaskAssigneeNames(task: Task) {
  const names = (task.assignees ?? []).map((assignee) => {
    const fullName = assignee.user.name.trim();
    return fullName || assignee.user.email;
  });

  return names.length > 0 ? names : ["Sin asignados"];
}

function getPageSize(value: string) {
  const numericValue = Number(value);
  return completedPageSizeOptions.find((option) => option === numericValue) ?? completedPageSizeOptions[0];
}

function matchesDateRange(value: string, from: string, to: string) {
  if (from && (!value || value < from)) {
    return false;
  }

  if (to && (!value || value > to)) {
    return false;
  }

  return true;
}

export function CompletedTasksView({ archive, isLoading, selectedTaskId, onRefresh, onOpenTask }: CompletedTasksViewProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [projectId, setProjectId] = useState("");
  const [startFrom, setStartFrom] = useState("");
  const [startTo, setStartTo] = useState("");
  const [dueFrom, setDueFrom] = useState("");
  const [dueTo, setDueTo] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState<(typeof completedPageSizeOptions)[number]>(10);

  const filteredRows = useMemo<CompletedTaskRow[]>(() => {
    const normalizedSearch = searchTerm.trim().toLowerCase();

    return archive
      .filter((group) => !projectId || group.project.id === projectId)
      .flatMap((group) =>
        group.tasks
          .filter((task) => {
          const assigneeSearch = getTaskAssigneeNames(task).join(" ");
          const searchableText = `${task.title} ${task.description ?? ""} ${assigneeSearch}`.toLowerCase();
          const taskStart = getDateInputValue(task.startAt);
          const taskDue = getDateInputValue(task.dueAt);

          return (
            (!normalizedSearch || searchableText.includes(normalizedSearch)) &&
            matchesDateRange(taskStart, startFrom, startTo) &&
            matchesDateRange(taskDue, dueFrom, dueTo)
          );
        })
          .map((task) => ({
            project: group.project,
            task
          }))
      );
  }, [archive, dueFrom, dueTo, projectId, searchTerm, startFrom, startTo]);

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / pageSize));
  const activePage = Math.min(currentPage, totalPages);
  const pageStartIndex = (activePage - 1) * pageSize;
  const pageRows = useMemo(
    () => filteredRows.slice(pageStartIndex, pageStartIndex + pageSize),
    [filteredRows, pageSize, pageStartIndex]
  );

  const paginatedArchive = useMemo(() => {
    const groups: CompletedProjectArchive[] = [];
    const groupsByProjectId = new Map<string, CompletedProjectArchive>();

    pageRows.forEach(({ project, task }) => {
      const existingGroup = groupsByProjectId.get(project.id);

      if (existingGroup) {
        existingGroup.tasks.push(task);
        return;
      }

      const nextGroup = {
        project,
        tasks: [task]
      };

      groupsByProjectId.set(project.id, nextGroup);
      groups.push(nextGroup);
    });

    return groups;
  }, [pageRows]);

  const totalTasks = filteredRows.length;
  const totalMinutes = filteredRows.reduce(
    (sum, row) => sum + getTaskActualMinutes(row.task),
    0
  );
  const totalEstimatedMinutes = filteredRows.reduce(
    (sum, row) => sum + (row.task.estimateMinutes ?? 0),
    0
  );
  const firstVisibleItem = totalTasks === 0 ? 0 : pageStartIndex + 1;
  const lastVisibleItem = Math.min(pageStartIndex + pageSize, totalTasks);

  useEffect(() => {
    setCurrentPage(1);
  }, [dueFrom, dueTo, pageSize, projectId, searchTerm, startFrom, startTo]);

  useEffect(() => {
    setCurrentPage((activePage) => Math.min(activePage, totalPages));
  }, [totalPages]);

  return (
    <section className="page completed-page">
      <header className="page-heading completed-hero">
        <div>
          <p className="eyebrow">Archivo</p>
          <h1>Actividades terminadas</h1>
          <p className="hero-copy">Consulta cierres por proyecto, filtra por fecha y abre el historial completo cuando necesites auditar una actividad.</p>
        </div>
        <Button icon={<RefreshCw size={17} />} variant="secondary" onClick={onRefresh}>Actualizar</Button>
      </header>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" data-guide="completed-kpis">
        <StatCard icon={<Archive size={18} />} label="Terminadas" value={totalTasks} tone="green" />
        <StatCard icon={<CalendarClock size={18} />} label="Tiempo real" value={formatMinutes(totalMinutes)} tone="blue" />
        <StatCard icon={<CalendarClock size={18} />} label="Estimado" value={formatMinutes(totalEstimatedMinutes)} tone="slate" />
        <StatCard icon={<Users size={18} />} label="Mostrando" value={`${firstVisibleItem}-${lastVisibleItem}`} tone="slate" />
      </section>

      <section className="completed-filters" data-guide="completed-filters">
        <label className="completed-search">
          Buscar
          <span>
            <Search size={16} />
            <input value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} placeholder="Actividad o descripcion" />
          </span>
        </label>
        <label>
          Proyecto
          <select value={projectId} onChange={(event) => setProjectId(event.target.value)}>
            <option value="">Todos</option>
            {archive.map((group) => (
              <option key={group.project.id} value={group.project.id}>{group.project.name}</option>
            ))}
          </select>
        </label>
        <label>
          Inicio desde
          <input type="date" value={startFrom} onChange={(event) => setStartFrom(event.target.value)} />
        </label>
        <label>
          Inicio hasta
          <input type="date" value={startTo} onChange={(event) => setStartTo(event.target.value)} />
        </label>
        <label>
          Fin desde
          <input type="date" value={dueFrom} onChange={(event) => setDueFrom(event.target.value)} />
        </label>
        <label>
          Fin hasta
          <input type="date" value={dueTo} onChange={(event) => setDueTo(event.target.value)} />
        </label>
        <label>
          Por pagina
          <select
            value={pageSize}
            onChange={(event) => setPageSize(getPageSize(event.target.value))}
          >
            {completedPageSizeOptions.map((option) => (
              <option key={option} value={option}>{option}</option>
            ))}
          </select>
        </label>
      </section>

      {isLoading ? <LoadingState label="Cargando terminadas..." rows={4} /> : undefined}

      <nav className="completed-pagination" aria-label="Paginacion de actividades terminadas">
        <span>
          Pagina {activePage} de {totalPages}
          <small>{totalTasks} actividades encontradas</small>
        </span>
        <div>
          <Button
            icon={<ChevronLeft size={16} />}
            variant="secondary"
            size="sm"
            disabled={currentPage <= 1}
            onClick={() => setCurrentPage((activePage) => Math.max(1, activePage - 1))}
          >
            Anterior
          </Button>
          <Button
            icon={<ChevronRight size={16} />}
            variant="secondary"
            size="sm"
            disabled={currentPage >= totalPages}
            onClick={() => setCurrentPage((activePage) => Math.min(totalPages, activePage + 1))}
          >
            Siguiente
          </Button>
        </div>
      </nav>

      <section className="completed-project-list" data-guide="completed-projects">
        {paginatedArchive.map((group) => {
          const projectMinutes = group.tasks.reduce((sum, task) => sum + getTaskActualMinutes(task), 0);

          return (
            <article className="completed-project-block" key={group.project.id}>
              <header>
                <div>
                  <p className="eyebrow">Proyecto</p>
                  <h2>{group.project.name}</h2>
                  <span>{group.tasks.length} terminadas · {formatMinutes(projectMinutes)} registrados</span>
                </div>
              </header>

              <div className="completed-project-table">
                <span>Actividad</span>
                <span>Descripcion</span>
                <span>Asignados</span>
                <span>Inicio</span>
                <span>Fin</span>
                <span>Accion</span>
                {group.tasks.map((task) => {
                  const assigneeNames = getTaskAssigneeNames(task);

                  return (
                    <button
                      key={task.id}
                      className={selectedTaskId === task.id ? "completed-project-row selected" : "completed-project-row"}
                      type="button"
                      onClick={() => onOpenTask(group.project.id, task.id)}
                    >
                      <strong>{task.title}</strong>
                      <small>{task.description || "Sin descripcion"}</small>
                      <span className="completed-assignees">
                        {assigneeNames.map((name) => (
                          <small key={`${task.id}-${name}`}>{name}</small>
                        ))}
                      </span>
                      <span>{formatDate(task.startAt)}</span>
                      <span>
                        {formatDate(task.dueAt)}
                        <small>Cierre {formatDate(task.completedAt)}</small>
                      </span>
                      <em>
                        Ver historial
                        <small>{getTaskEstimateLabel(task)} · {formatMinutes(getTaskActualMinutes(task))}</small>
                      </em>
                    </button>
                  );
                })}
              </div>
            </article>
          );
        })}
      </section>

      {!isLoading && filteredRows.length === 0 ? (
        <EmptyState
          icon={<Archive size={24} />}
          title="No hay actividades terminadas con esos filtros"
          description="Ajusta fechas, proyecto o busqueda para revisar otros cierres."
        />
      ) : undefined}
    </section>
  );
}
