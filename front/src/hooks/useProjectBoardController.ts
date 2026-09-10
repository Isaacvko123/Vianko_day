import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  addProjectMember,
  addTaskAssignee,
  archiveProject,
  changeTaskStatus,
  createComment,
  createProject,
  createTask,
  createTimeLog,
  getProject,
  listComments,
  listTaskEvents,
  listProjects,
  listSubtasks,
  listTasks,
  listTimeLogs,
  mentionTaskUser,
  updateProject,
  updateTask
} from "../api/endpoints";
import type { UpdateTaskInput } from "../api/endpoints";
import { isTaskDone, mergeTaskUpdate } from "../lib/tasks";
import { queryKeys } from "../lib/queryKeys";
import type { ActivityEvent, Board, BoardMode, Project, Task, TaskComment, TaskPriority, TimeLog } from "../types";

type LoadOptions = {
  silent?: boolean;
};

type UseProjectBoardControllerOptions = {
  token?: string;
  workspaceId?: string;
  onError: (message: string) => void;
  clearError: () => void;
};

type ProjectContextData = {
  project: Project;
  boards: Board[];
  activeTasks: Task[];
  completedTasks: Task[];
};

type TaskDetailData = {
  taskId: string;
  comments: TaskComment[];
  timeLogs: TimeLog[];
  subtasks: Task[];
  events: ActivityEvent[];
};

export type CompletedProjectArchive = {
  project: Project;
  tasks: Task[];
};

export function useProjectBoardController({ token, workspaceId, onError, clearError }: UseProjectBoardControllerOptions) {
  const queryClient = useQueryClient();
  const workspaceRef = useRef(workspaceId);
  workspaceRef.current = workspaceId;
  const [projects, setProjects] = useState<Project[]>([]);
  const [activeProjectId, setActiveProjectId] = useState<string>();
  const [activeProject, setActiveProject] = useState<Project>();
  const [boards, setBoards] = useState<Board[]>([]);
  const [activeBoardId, setActiveBoardId] = useState<string>();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [completedTasks, setCompletedTasks] = useState<Task[]>([]);
  const [completedArchive, setCompletedArchive] = useState<CompletedProjectArchive[]>([]);
  const [selectedTaskId, setSelectedTaskId] = useState<string>();
  const [detailTaskId, setDetailTaskId] = useState<string>();
  const [subtasks, setSubtasks] = useState<Task[]>([]);
  const [comments, setComments] = useState<TaskComment[]>([]);
  const [timeLogs, setTimeLogs] = useState<TimeLog[]>([]);
  const [taskEvents, setTaskEvents] = useState<ActivityEvent[]>([]);
  const [boardMode, setBoardMode] = useState<BoardMode>("kanban");
  const activeProjectIdRef = useRef<string>();
  const selectedTaskIdRef = useRef<string>();

  const projectBoards = boards.filter((board) => board.projectId === activeProjectId);
  const activeBoard = projectBoards.find((board) => board.id === activeBoardId) ?? projectBoards[0];
  const archivedCompletedTasks = completedArchive.flatMap((projectArchive) => projectArchive.tasks);
  const selectedTask = tasks.find((task) => task.id === selectedTaskId)
    ?? completedTasks.find((task) => task.id === selectedTaskId)
    ?? archivedCompletedTasks.find((task) => task.id === selectedTaskId);
  const boardStatuses = boards.find((board) => board.id === selectedTask?.boardId)?.statuses ?? activeBoard?.statuses ?? [];
  const visibleProjects = useMemo(() => projects, [projects]);

  function applyProjects(nextProjects: Project[]) {
    setProjects(nextProjects);

    const currentProjectId = activeProjectIdRef.current;
    const currentProjectStillExists = currentProjectId
      ? nextProjects.some((project) => project.id === currentProjectId)
      : false;

    if (!currentProjectStillExists) {
      setActiveProjectId(nextProjects[0]?.id);
    }
  }

  function applyProjectContext(context: ProjectContextData) {
    const firstBoard = context.boards[0];
    const allLoadedTasks = [...context.activeTasks, ...context.completedTasks];
    const preferredTaskId = selectedTaskIdRef.current;
    const nextSelectedTaskId = preferredTaskId && allLoadedTasks.some((task) => task.id === preferredTaskId)
      ? preferredTaskId
      : undefined;

    setActiveProject(context.project);
    setBoards(context.boards);
    setActiveBoardId((currentId) => context.boards.some((board) => board.id === currentId) ? currentId : firstBoard?.id);
    setTasks(context.activeTasks);
    setCompletedTasks(context.completedTasks);
    setSelectedTaskId(firstBoard ? nextSelectedTaskId : undefined);

    if (!firstBoard) {
      setSubtasks([]);
    }
  }

  function applyTaskDetail(detail: TaskDetailData) {
    if (detail.taskId !== selectedTaskIdRef.current) return;
    setDetailTaskId(detail.taskId);
    setComments(detail.comments);
    setTimeLogs(detail.timeLogs);
    setSubtasks(detail.subtasks);
    setTaskEvents(detail.events);
  }

  async function fetchProjectContext(projectId: string): Promise<ProjectContextData> {
    if (!token) {
      throw new Error("Sesion no disponible.");
    }

    const projectResponse = await getProject(token, projectId);
    const projectBoards = projectResponse.project.boards ?? [];
    const firstBoard = projectBoards[0];

    if (!firstBoard) {
      return {
        project: projectResponse.project,
        boards: projectBoards,
        activeTasks: [],
        completedTasks: []
      };
    }

    const boardTasks = await Promise.all(projectBoards.map(async (board) => {
      const [active, completed] = await Promise.all([
        listTasks(token, board.id, "active"), listTasks(token, board.id, "completed")
      ]);
      return { active: active.tasks, completed: completed.tasks };
    }));
    return {
      project: projectResponse.project,
      boards: projectBoards,
      activeTasks: boardTasks.flatMap((board) => board.active),
      completedTasks: boardTasks.flatMap((board) => board.completed)
    };
  }

  async function fetchTaskDetail(taskId: string): Promise<TaskDetailData> {
    if (!token) {
      throw new Error("Sesion no disponible.");
    }

    const [commentResponse, timeResponse, subtaskResponse] = await Promise.all([
      listComments(token, taskId),
      listTimeLogs(token, taskId),
      listSubtasks(token, taskId)
    ]);

    try {
      const eventResponse = await listTaskEvents(token, taskId);

      return {
        taskId,
        comments: commentResponse.comments,
        timeLogs: timeResponse.timeLogs,
        subtasks: subtaskResponse.subtasks,
        events: eventResponse.events
      };
    } catch {
      return {
        taskId,
        comments: commentResponse.comments,
        timeLogs: timeResponse.timeLogs,
        subtasks: subtaskResponse.subtasks,
        events: []
      };
    }
  }

  async function fetchCompletedArchive(): Promise<CompletedProjectArchive[]> {
    if (!token || !workspaceId) {
      throw new Error("Sesion o workspace no disponible.");
    }

    const projectsResponse = await listProjects(token, workspaceId);
    const archiveGroups = await Promise.all(projectsResponse.projects.map(async (project) => {
      const projectResponse = await getProject(token, project.id);
      const projectBoards = projectResponse.project.boards ?? [];
      const taskResponses = await Promise.all(projectBoards.map((board) => listTasks(token, board.id, "completed")));
      const completedProjectTasks = taskResponses
        .flatMap((response) => response.tasks)
        .filter((task) => !task.parentTaskId)
        .sort((leftTask, rightTask) => {
          const leftDate = leftTask.completedAt ?? leftTask.dueAt ?? leftTask.updatedAt;
          const rightDate = rightTask.completedAt ?? rightTask.dueAt ?? rightTask.updatedAt;
          return new Date(rightDate).getTime() - new Date(leftDate).getTime();
        });

      return {
        project: {
          ...project,
          boards: projectBoards
        },
        tasks: completedProjectTasks
      };
    }));

    return archiveGroups.filter((group) => group.tasks.length > 0);
  }

  const projectsQuery = useQuery({
    queryKey: queryKeys.projects(workspaceId),
    queryFn: async () => {
      if (!token || !workspaceId) {
        throw new Error("Sesion o workspace no disponible.");
      }

      return listProjects(token, workspaceId);
    },
    enabled: Boolean(token && workspaceId),
    refetchOnMount: "always"
  });

  const projectContextQuery = useQuery({
    queryKey: queryKeys.projectContext(activeProjectId),
    queryFn: () => fetchProjectContext(activeProjectId!),
    enabled: Boolean(token && activeProjectId),
    refetchOnMount: "always"
  });

  const taskDetailQuery = useQuery({
    queryKey: queryKeys.taskDetail(selectedTaskId),
    queryFn: () => fetchTaskDetail(selectedTaskId!),
    enabled: Boolean(token && selectedTaskId),
    refetchOnMount: "always"
  });

  const completedArchiveQuery = useQuery({
    queryKey: queryKeys.completedArchive(workspaceId),
    queryFn: fetchCompletedArchive,
    enabled: false
  });

  async function loadProjects(options: LoadOptions = {}) {
    if (!token || !workspaceId) {
      return;
    }

    if (!options.silent) {
      clearError();
    }

    try {
      const response = await queryClient.fetchQuery({
        queryKey: queryKeys.projects(workspaceId),
        queryFn: () => listProjects(token, workspaceId),
        staleTime: 0
      });
      if (workspaceRef.current === workspaceId) applyProjects(response.projects);
    } catch (error) {
      if (!options.silent) {
        onError(error instanceof Error ? error.message : "No se pudieron cargar proyectos.");
      }
    }
  }

  async function loadProjectContext(projectId: string, options: LoadOptions = {}) {
    if (!token) {
      return;
    }

    if (!options.silent) {
      clearError();
    }

    try {
      const context = await queryClient.fetchQuery({
        queryKey: queryKeys.projectContext(projectId),
        queryFn: () => fetchProjectContext(projectId),
        staleTime: 0
      });
      if (activeProjectIdRef.current === projectId) applyProjectContext(context);
    } catch (error) {
      if (!options.silent) {
        onError(error instanceof Error ? error.message : "No se pudo cargar el tablero.");
      }
    }
  }

  async function loadSelectedTaskDetail(taskId: string, options: LoadOptions = {}) {
    if (!token) {
      return;
    }

    if (!options.silent) {
      clearError();
    }

    try {
      const detail = await queryClient.fetchQuery({
        queryKey: queryKeys.taskDetail(taskId),
        queryFn: () => fetchTaskDetail(taskId),
        staleTime: 0
      });
      if (selectedTaskIdRef.current === taskId) applyTaskDetail(detail);
    } catch (error) {
      if (!options.silent) {
        onError(error instanceof Error ? error.message : "No se pudo cargar el detalle de actividad.");
      }
    }
  }

  async function loadCompletedArchive(options: LoadOptions = {}) {
    if (!token || !workspaceId) {
      return;
    }

    if (!options.silent) {
      clearError();
    }

    try {
      const archive = await queryClient.fetchQuery({
        queryKey: queryKeys.completedArchive(workspaceId),
        queryFn: fetchCompletedArchive,
        staleTime: 0
      });
      setCompletedArchive(archive);
    } catch (error) {
      if (!options.silent) {
        onError(error instanceof Error ? error.message : "No se pudo cargar el archivo de terminadas.");
      }
    }
  }

  async function handleCreateProject(input: {
    areaId?: string;
    localityId?: string;
    name: string;
    description?: string;
    visibility: "WORKSPACE" | "PRIVATE";
    color?: string;
    startDate?: string;
    endDate?: string;
  }) {
    if (!token || !workspaceId) {
      throw new Error("Sesion o workspace no disponible.");
    }

    const response = await createProject(token, {
      workspaceId,
      ...input
    });

    queryClient.setQueryData<{ projects: Project[] }>(queryKeys.projects(workspaceId), (currentData) => ({
      projects: [...(currentData?.projects ?? []), response.project]
    }));
    setProjects((currentProjects) => [...currentProjects, response.project]);
    setActiveProjectId(response.project.id);
  }

  async function handleUpdateProject(projectId: string, input: {
    areaId?: string;
    localityId?: string | null;
    expectedUpdatedAt?: string;
    name?: string;
    description?: string;
    visibility?: "WORKSPACE" | "PRIVATE";
    color?: string;
    startDate?: string | null;
    endDate?: string | null;
  }) {
    if (!token) {
      throw new Error("Sesion no disponible.");
    }

    const response = await updateProject(token, projectId, input);
    queryClient.setQueryData<{ projects: Project[] }>(queryKeys.projects(workspaceId), (currentData) => ({
      projects: (currentData?.projects ?? []).map((project) => project.id === projectId ? response.project : project)
    }));
    void queryClient.invalidateQueries({ queryKey: queryKeys.projectContext(projectId) });
    setProjects((currentProjects) => currentProjects.map((project) => project.id === projectId ? response.project : project));

    if (activeProjectId === projectId) {
      setActiveProject(response.project);
    }
  }

  async function handleArchiveProject(projectId: string) {
    if (!token || !workspaceId) {
      throw new Error("Sesion o workspace no disponible.");
    }

    await archiveProject(token, projectId);
    void queryClient.invalidateQueries({ queryKey: queryKeys.projects(workspaceId) });
    void queryClient.invalidateQueries({ queryKey: queryKeys.reports(workspaceId) });
    setProjects((currentProjects) => {
      const nextProjects = currentProjects.filter((project) => project.id !== projectId);

      if (activeProjectIdRef.current === projectId) {
        setActiveProjectId(nextProjects[0]?.id);
        setSelectedTaskId(undefined);
      }

      return nextProjects;
    });
    setCompletedArchive((currentArchive) => currentArchive.filter((group) => group.project.id !== projectId));
  }

  async function handleCreateTask(input: {
    title: string;
    description?: string;
    priority: "LOW" | "MEDIUM" | "HIGH" | "URGENT";
    startAt?: string;
    dueAt?: string;
    estimateMinutes?: number;
    statusId?: string;
    assigneeIds: string[];
  }) {
    if (!token || !activeBoard) {
      throw new Error("Tablero no disponible.");
    }

    const response = await createTask(token, {
      boardId: activeBoard.id,
      ...input
    });

    void queryClient.invalidateQueries({ queryKey: queryKeys.projectContext(activeProjectId) });
    setTasks((currentTasks) => [response.task, ...currentTasks]);
    if (isTaskDone(response.task)) setCompletedTasks((currentTasks) => [response.task, ...currentTasks.filter((task) => task.id !== response.task.id)]);
    selectedTaskIdRef.current = response.task.id;
    setSelectedTaskId(response.task.id);
  }

  async function handleCreateSubtask(input: {
    title: string;
    description?: string;
    priority: TaskPriority;
    startAt?: string;
    dueAt?: string;
    estimateMinutes?: number;
    assigneeIds: string[];
  }) {
    if (!token || !selectedTask) {
      throw new Error("Selecciona una actividad principal.");
    }

    if (selectedTask.completedAt) {
      throw new Error("No se pueden crear subtareas en una actividad terminada.");
    }

    const defaultStatusId = boardStatuses.find((status) => status.isDefault)?.id ?? boardStatuses[0]?.id;
    const response = await createTask(token, {
      boardId: selectedTask.boardId,
      parentTaskId: selectedTask.id,
      statusId: defaultStatusId,
      title: input.title,
      description: input.description,
      priority: input.priority,
      startAt: input.startAt,
      dueAt: input.dueAt,
      estimateMinutes: input.estimateMinutes,
      assigneeIds: input.assigneeIds
    });

    void queryClient.invalidateQueries({ queryKey: queryKeys.projectContext(activeProjectId) });
    void queryClient.invalidateQueries({ queryKey: queryKeys.taskDetail(selectedTask.id) });
    setTasks((currentTasks) => [response.task, ...currentTasks]);
    setSubtasks((currentSubtasks) => [response.task, ...currentSubtasks.filter((task) => task.id !== response.task.id)]);
    setTasks((currentTasks) => currentTasks.map((task) => {
      if (task.id !== selectedTask.id) {
        return task;
      }

      return {
        ...task,
        _count: {
          comments: task._count?.comments ?? 0,
          timeLogs: task._count?.timeLogs ?? 0,
          subtasks: (task._count?.subtasks ?? 0) + 1
        }
      };
    }));
  }

  async function handleAddProjectMember(input: { projectId: string; userId: string; roleId?: string }) {
    if (!token) {
      throw new Error("Sesion no disponible.");
    }

    const response = await addProjectMember(token, input);
    void queryClient.invalidateQueries({ queryKey: queryKeys.projectContext(input.projectId) });
    void queryClient.invalidateQueries({ queryKey: queryKeys.projects(workspaceId) });
    setActiveProject((currentProject) => currentProject && currentProject.id === input.projectId
      ? {
          ...currentProject,
          members: [
            ...(currentProject.members ?? []).filter((member) => member.userId !== response.member.userId),
            response.member
          ]
        }
      : currentProject);
    setProjects((currentProjects) => currentProjects.map((project) => project.id === input.projectId
      ? {
          ...project,
          members: [
            ...(project.members ?? []).filter((member) => member.userId !== response.member.userId),
            response.member
          ]
        }
      : project));
  }

  async function handleAddTaskAssignee(taskId: string, userId: string) {
    if (!token) {
      throw new Error("Sesion no disponible.");
    }

    await addTaskAssignee(token, taskId, userId);
    void queryClient.invalidateQueries({ queryKey: queryKeys.projectContext(activeProjectIdRef.current) });
    void queryClient.invalidateQueries({ queryKey: queryKeys.taskDetail(selectedTaskIdRef.current) });
    refreshActiveContext();
  }

  async function handleMentionTaskUser(taskId: string, userId: string) {
    if (!token) {
      throw new Error("Sesion no disponible.");
    }

    await mentionTaskUser(token, taskId, userId);
    void queryClient.invalidateQueries({ queryKey: queryKeys.projectContext(activeProjectIdRef.current) });
    void queryClient.invalidateQueries({ queryKey: queryKeys.taskDetail(selectedTaskIdRef.current) });
    refreshActiveContext();
  }

  async function handleTaskStatusChange(taskId: string, statusId: string) {
    if (!token) {
      throw new Error("Sesión no disponible.");
    }

    const response = await changeTaskStatus(token, taskId, statusId);
    void queryClient.invalidateQueries({ queryKey: queryKeys.projectContext(activeProjectIdRef.current) });
    void queryClient.invalidateQueries({ queryKey: queryKeys.taskDetail(taskId) });
    const updatedTask = response.task;
    const knownTask = tasks.find((task) => task.id === taskId) ?? completedTasks.find((task) => task.id === taskId) ?? subtasks.find((task) => task.id === taskId) ?? updatedTask;
    const mergedTask = mergeTaskUpdate(knownTask, updatedTask);
    const isSelectedSubtask = mergedTask.parentTaskId === selectedTaskIdRef.current;

    if (isTaskDone(updatedTask)) {
      setTasks((currentTasks) => currentTasks.some((task) => task.id === taskId)
        ? currentTasks.map((task) => task.id === taskId ? mergedTask : task)
        : [mergedTask, ...currentTasks]);
      setCompletedTasks((currentTasks) => [
        mergedTask,
        ...currentTasks.filter((task) => task.id !== taskId)
      ]);
    } else {
      setCompletedTasks((currentTasks) => currentTasks.filter((task) => task.id !== taskId));
      setCompletedArchive((currentArchive) =>
        currentArchive
          .map((group) => ({
            ...group,
            tasks: group.tasks.filter((task) => task.id !== taskId)
          }))
          .filter((group) => group.tasks.length > 0)
      );
      setTasks((currentTasks) => {
        const existingTask = currentTasks.find((task) => task.id === taskId);

        return existingTask
          ? currentTasks.map((task) => (task.id === taskId ? mergedTask : task))
          : [mergedTask, ...currentTasks];
      });
    }

    void queryClient.invalidateQueries({ queryKey: queryKeys.reports(workspaceId) });
    void queryClient.invalidateQueries({ queryKey: queryKeys.completedArchive(workspaceId) });
    if (selectedTaskIdRef.current === taskId) {
      void loadSelectedTaskDetail(taskId);
    } else if (isSelectedSubtask) {
      void queryClient.invalidateQueries({ queryKey: queryKeys.taskDetail(selectedTaskIdRef.current) });
      setSubtasks((currentSubtasks) => {
        const subtaskExists = currentSubtasks.some((subtask) => subtask.id === taskId);
        return subtaskExists
          ? currentSubtasks.map((subtask) => subtask.id === taskId ? mergedTask : subtask)
          : [mergedTask, ...currentSubtasks];
      });
    }
  }

  async function handleCreateSubtaskTimeLog(taskId: string, minutes: number, note?: string) {
    if (!token) {
      throw new Error("Sesion no disponible.");
    }

    const response = await createTimeLog(token, taskId, minutes, note);
    void queryClient.invalidateQueries({ queryKey: queryKeys.taskDetail(selectedTaskIdRef.current) });
    setSubtasks((currentSubtasks) =>
      currentSubtasks.map((subtask) => {
        if (subtask.id !== taskId) {
          return subtask;
        }

        return {
          ...subtask,
          timeLogs: [response.timeLog, ...(subtask.timeLogs ?? [])],
          _count: {
            comments: subtask._count?.comments ?? 0,
            subtasks: subtask._count?.subtasks ?? 0,
            timeLogs: (subtask._count?.timeLogs ?? 0) + 1
          }
        };
      })
    );

    if (selectedTaskIdRef.current) {
      void loadSelectedTaskDetail(selectedTaskIdRef.current, { silent: true });
    }
  }

  async function handleUpdateTaskPlan(input: UpdateTaskInput) {
    if (!token || !selectedTaskId) {
      throw new Error("Selecciona una actividad.");
    }

    const response = await updateTask(token, selectedTaskId, input);
    void queryClient.invalidateQueries({ queryKey: queryKeys.projectContext(activeProjectIdRef.current) });
    void queryClient.invalidateQueries({ queryKey: queryKeys.taskDetail(selectedTaskId) });
    setTasks((currentTasks) => currentTasks.map((task) => (task.id === selectedTaskId ? mergeTaskUpdate(task, response.task) : task)));
    setCompletedTasks((currentTasks) => currentTasks.map((task) => (task.id === selectedTaskId ? mergeTaskUpdate(task, response.task) : task)));
    setCompletedArchive((archive) => archive.map((group) => ({ ...group,
      tasks: group.tasks.map((task) => task.id === selectedTaskId ? mergeTaskUpdate(task, response.task) : task)
    })));
    void queryClient.invalidateQueries({ queryKey: queryKeys.reports(workspaceId) });
    void queryClient.invalidateQueries({ queryKey: queryKeys.completedArchive(workspaceId) });
    void loadSelectedTaskDetail(selectedTaskId);
  }

  async function handleCreateComment(body: string, isInternal: boolean) {
    if (!token || !selectedTaskId) {
      throw new Error("Selecciona una actividad.");
    }

    const response = await createComment(token, selectedTaskId, body, isInternal);
    void queryClient.invalidateQueries({ queryKey: queryKeys.taskDetail(selectedTaskId) });
    setComments((currentComments) => currentComments.some(comment => comment.id === response.comment.id) ? currentComments : [...currentComments, response.comment]);
    void loadSelectedTaskDetail(selectedTaskId);
  }

  async function handleCreateTimeLog(minutes: number, note?: string) {
    if (!token || !selectedTaskId) {
      throw new Error("Selecciona una actividad.");
    }

    const response = await createTimeLog(token, selectedTaskId, minutes, note);
    void queryClient.invalidateQueries({ queryKey: queryKeys.taskDetail(selectedTaskId) });
    setTimeLogs((currentLogs) => [response.timeLog, ...currentLogs]);
    void loadSelectedTaskDetail(selectedTaskId);
  }

  function refreshActiveContext() {
    if (activeProjectIdRef.current) {
      void loadProjectContext(activeProjectIdRef.current, { silent: true });
    }

    if (selectedTaskIdRef.current) {
      void loadSelectedTaskDetail(selectedTaskIdRef.current, { silent: true });
    }
  }

  function handleOpenArchivedTask(projectId: string, taskId: string) {
    activeProjectIdRef.current = projectId;
    selectedTaskIdRef.current = taskId;
    setActiveProjectId(projectId);
    setSelectedTaskId(taskId);
    void loadProjectContext(projectId, { silent: true });
    void loadSelectedTaskDetail(taskId, { silent: true });
  }

  function initializeWorkspaceProject(project: Project, board: Board) {
    setProjects([project]);
    setActiveProject(project);
    setActiveProjectId(project.id);
    setBoards([board]);
    setActiveBoardId(board.id);
    setTasks([]);
    setCompletedTasks([]);
    setCompletedArchive([]);
    setSelectedTaskId(undefined);
  }

  function resetProjectBoardState() {
    activeProjectIdRef.current = undefined;
    selectedTaskIdRef.current = undefined;
    setCompletedArchive([]);
    setDetailTaskId(undefined);
    setProjects([]);
    setActiveProject(undefined);
    setActiveProjectId(undefined);
    setBoards([]);
    setActiveBoardId(undefined);
    setTasks([]);
    setCompletedTasks([]);
    setSubtasks([]);
    setSelectedTaskId(undefined);
    setComments([]);
    setTimeLogs([]);
    setTaskEvents([]);
  }

  useEffect(() => {
    activeProjectIdRef.current = activeProjectId;
    selectedTaskIdRef.current = selectedTaskId;
  }, [activeProjectId, selectedTaskId]);

  useEffect(() => {
    if (projectsQuery.data) {
      applyProjects(projectsQuery.data.projects);
    }
  }, [projectsQuery.data, projectsQuery.dataUpdatedAt]);

  useEffect(() => {
    if (projectsQuery.error) {
      onError(projectsQuery.error instanceof Error ? projectsQuery.error.message : "No se pudieron cargar proyectos.");
    }
  }, [projectsQuery.error]);

  useEffect(() => {
    if (projectContextQuery.data) {
      if (projectContextQuery.data.project.id === activeProjectIdRef.current) applyProjectContext(projectContextQuery.data);
    }
  }, [projectContextQuery.data, projectContextQuery.dataUpdatedAt]);

  useEffect(() => {
    if (projectContextQuery.error) {
      onError(projectContextQuery.error instanceof Error ? projectContextQuery.error.message : "No se pudo cargar el tablero.");
    }
  }, [projectContextQuery.error]);

  useEffect(() => {
    if (taskDetailQuery.data) {
      applyTaskDetail(taskDetailQuery.data);
    }
  }, [taskDetailQuery.data, taskDetailQuery.dataUpdatedAt]);

  useEffect(() => {
    if (taskDetailQuery.error) {
      onError(taskDetailQuery.error instanceof Error ? taskDetailQuery.error.message : "No se pudo cargar el detalle de actividad.");
    }
  }, [taskDetailQuery.error]);

  useEffect(() => {
    if (completedArchiveQuery.data) {
      setCompletedArchive(completedArchiveQuery.data);
    }
  }, [completedArchiveQuery.data, completedArchiveQuery.dataUpdatedAt]);

  useEffect(() => {
    if (!activeProjectId) {
      setActiveProject(undefined);
      setBoards([]);
      setActiveBoardId(undefined);
      setTasks([]);
      setCompletedTasks([]);
      setSelectedTaskId(undefined);
    } else {
      setActiveProject((current) => current?.id === activeProjectId ? current : undefined);
      setTasks((current) => current.filter((task) => task.projectId === activeProjectId));
      setCompletedTasks((current) => current.filter((task) => task.projectId === activeProjectId));
    }
  }, [activeProjectId, token, queryClient]);

  return {
    projects,
    visibleProjects,
    activeProjectId,
    activeProject,
    activeBoard,
    boards: projectBoards,
    boardStatuses,
    tasks,
    completedTasks,
    completedArchive,
    selectedTaskId,
    selectedTask,
    subtasks: detailTaskId === selectedTaskId ? subtasks : [],
    comments: detailTaskId === selectedTaskId ? comments : [],
    timeLogs: detailTaskId === selectedTaskId ? timeLogs : [],
    taskEvents: detailTaskId === selectedTaskId ? taskEvents : [],
    boardMode,
    isLoadingProjects: projectsQuery.isFetching,
    isLoadingBoard: projectContextQuery.isFetching,
    isLoadingCompletedArchive: completedArchiveQuery.isFetching,
    isLoadingDetail: taskDetailQuery.isFetching,
    actions: {
      setActiveProjectId: (projectId: string | undefined) => {
        activeProjectIdRef.current = projectId;
        selectedTaskIdRef.current = undefined;
        setSelectedTaskId(undefined);
        setActiveProjectId(projectId);
      },
      setActiveBoardId: (boardId: string) => { selectedTaskIdRef.current = undefined; setActiveBoardId(boardId); setSelectedTaskId(undefined); },
      setBoardMode,
      setSelectedTaskId: (taskId: string | undefined) => {
        selectedTaskIdRef.current = taskId;
        setSelectedTaskId(taskId);
      },
      loadProjects,
      loadProjectContext,
      loadSelectedTaskDetail,
      loadCompletedArchive,
      handleCreateProject,
      handleUpdateProject,
      handleArchiveProject,
      handleCreateTask,
      handleCreateSubtask,
      handleAddProjectMember,
      handleAddTaskAssignee,
      handleMentionTaskUser,
      handleTaskStatusChange,
      handleOpenArchivedTask,
      handleCreateSubtaskTimeLog,
      handleUpdateTaskPlan,
      handleCreateComment,
      handleCreateTimeLog,
      initializeWorkspaceProject,
      resetProjectBoardState
    }
  };
}

export type ProjectBoardController = ReturnType<typeof useProjectBoardController>;
