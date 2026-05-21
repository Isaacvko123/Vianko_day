import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  addProjectMember,
  addTaskAssignee,
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
  comments: TaskComment[];
  timeLogs: TimeLog[];
  subtasks: Task[];
  events: ActivityEvent[];
};

export function useProjectBoardController({ token, workspaceId, onError, clearError }: UseProjectBoardControllerOptions) {
  const queryClient = useQueryClient();
  const [projects, setProjects] = useState<Project[]>([]);
  const [activeProjectId, setActiveProjectId] = useState<string>();
  const [activeProject, setActiveProject] = useState<Project>();
  const [boards, setBoards] = useState<Board[]>([]);
  const [activeBoardId, setActiveBoardId] = useState<string>();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [completedTasks, setCompletedTasks] = useState<Task[]>([]);
  const [selectedTaskId, setSelectedTaskId] = useState<string>();
  const [subtasks, setSubtasks] = useState<Task[]>([]);
  const [comments, setComments] = useState<TaskComment[]>([]);
  const [timeLogs, setTimeLogs] = useState<TimeLog[]>([]);
  const [taskEvents, setTaskEvents] = useState<ActivityEvent[]>([]);
  const [boardMode, setBoardMode] = useState<BoardMode>("kanban");
  const activeProjectIdRef = useRef<string>();
  const selectedTaskIdRef = useRef<string>();

  const activeBoard = boards.find((board) => board.id === activeBoardId) ?? boards[0];
  const selectedTask = tasks.find((task) => task.id === selectedTaskId) ?? completedTasks.find((task) => task.id === selectedTaskId);
  const boardStatuses = activeBoard?.statuses ?? [];
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
      : context.activeTasks[0]?.id ?? context.completedTasks[0]?.id;

    setActiveProject(context.project);
    setBoards(context.boards);
    setActiveBoardId(firstBoard?.id);
    setTasks(context.activeTasks);
    setCompletedTasks(context.completedTasks);
    setSelectedTaskId(firstBoard ? nextSelectedTaskId : undefined);

    if (!firstBoard) {
      setSubtasks([]);
    }
  }

  function applyTaskDetail(detail: TaskDetailData) {
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

    const [taskResponse, completedTaskResponse] = await Promise.all([
      listTasks(token, firstBoard.id, "active"),
      listTasks(token, firstBoard.id, "completed")
    ]);

    return {
      project: projectResponse.project,
      boards: projectBoards,
      activeTasks: taskResponse.tasks,
      completedTasks: completedTaskResponse.tasks
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
        comments: commentResponse.comments,
        timeLogs: timeResponse.timeLogs,
        subtasks: subtaskResponse.subtasks,
        events: eventResponse.events
      };
    } catch {
      return {
        comments: commentResponse.comments,
        timeLogs: timeResponse.timeLogs,
        subtasks: subtaskResponse.subtasks,
        events: []
      };
    }
  }

  const projectsQuery = useQuery({
    queryKey: queryKeys.projects(workspaceId),
    queryFn: async () => {
      if (!token || !workspaceId) {
        throw new Error("Sesion o workspace no disponible.");
      }

      return listProjects(token, workspaceId);
    },
    enabled: Boolean(token && workspaceId)
  });

  const projectContextQuery = useQuery({
    queryKey: queryKeys.projectContext(activeProjectId),
    queryFn: () => fetchProjectContext(activeProjectId!),
    enabled: Boolean(token && activeProjectId)
  });

  const taskDetailQuery = useQuery({
    queryKey: queryKeys.taskDetail(selectedTaskId),
    queryFn: () => fetchTaskDetail(selectedTaskId!),
    enabled: Boolean(token && selectedTaskId)
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
      applyProjects(response.projects);
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
      applyProjectContext(context);
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
      applyTaskDetail(detail);
    } catch (error) {
      if (!options.silent) {
        onError(error instanceof Error ? error.message : "No se pudo cargar el detalle de actividad.");
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
    localityId?: string;
    name?: string;
    description?: string;
    visibility?: "WORKSPACE" | "PRIVATE";
    color?: string;
    startDate?: string;
    endDate?: string;
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
    setCompletedTasks((currentTasks) => currentTasks.filter((task) => task.id !== response.task.id));
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
      return;
    }

    const response = await changeTaskStatus(token, taskId, statusId);
    void queryClient.invalidateQueries({ queryKey: queryKeys.projectContext(activeProjectIdRef.current) });
    void queryClient.invalidateQueries({ queryKey: queryKeys.taskDetail(taskId) });
    const updatedTask = response.task;
    const knownTask = tasks.find((task) => task.id === taskId) ?? completedTasks.find((task) => task.id === taskId) ?? updatedTask;
    const mergedTask = { ...knownTask, ...updatedTask };
    const isSelectedSubtask = mergedTask.parentTaskId === selectedTaskIdRef.current;

    if (updatedTask.completedAt) {
      setTasks((currentTasks) => currentTasks.filter((task) => task.id !== taskId));
      setCompletedTasks((currentTasks) => [
        mergedTask,
        ...currentTasks.filter((task) => task.id !== taskId)
      ]);
    } else {
      setCompletedTasks((currentTasks) => currentTasks.filter((task) => task.id !== taskId));
      setTasks((currentTasks) => {
        const existingTask = currentTasks.find((task) => task.id === taskId);

        return existingTask
          ? currentTasks.map((task) => (task.id === taskId ? mergedTask : task))
          : [mergedTask, ...currentTasks];
      });
    }

    if (selectedTaskId === taskId) {
      void loadSelectedTaskDetail(taskId);
    } else if (isSelectedSubtask) {
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

  async function handleUpdateTaskPlan(input: { startAt?: string; dueAt?: string; estimateMinutes?: number }) {
    if (!token || !selectedTaskId) {
      throw new Error("Selecciona una actividad.");
    }

    const response = await updateTask(token, selectedTaskId, input);
    void queryClient.invalidateQueries({ queryKey: queryKeys.projectContext(activeProjectIdRef.current) });
    void queryClient.invalidateQueries({ queryKey: queryKeys.taskDetail(selectedTaskId) });
    setTasks((currentTasks) => currentTasks.map((task) => (task.id === selectedTaskId ? { ...task, ...response.task } : task)));
    setCompletedTasks((currentTasks) => currentTasks.map((task) => (task.id === selectedTaskId ? { ...task, ...response.task } : task)));
    void loadSelectedTaskDetail(selectedTaskId);
  }

  async function handleCreateComment(body: string, isInternal: boolean) {
    if (!token || !selectedTaskId) {
      throw new Error("Selecciona una actividad.");
    }

    const response = await createComment(token, selectedTaskId, body, isInternal);
    void queryClient.invalidateQueries({ queryKey: queryKeys.taskDetail(selectedTaskId) });
    setComments((currentComments) => [...currentComments, response.comment]);
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

  function initializeWorkspaceProject(project: Project, board: Board) {
    setProjects([project]);
    setActiveProject(project);
    setActiveProjectId(project.id);
    setBoards([board]);
    setActiveBoardId(board.id);
    setTasks([]);
    setCompletedTasks([]);
    setSelectedTaskId(undefined);
  }

  function resetProjectBoardState() {
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
  }, [projectsQuery.dataUpdatedAt]);

  useEffect(() => {
    if (projectsQuery.error) {
      onError(projectsQuery.error instanceof Error ? projectsQuery.error.message : "No se pudieron cargar proyectos.");
    }
  }, [projectsQuery.error]);

  useEffect(() => {
    if (projectContextQuery.data) {
      applyProjectContext(projectContextQuery.data);
    }
  }, [projectContextQuery.dataUpdatedAt]);

  useEffect(() => {
    if (projectContextQuery.error) {
      onError(projectContextQuery.error instanceof Error ? projectContextQuery.error.message : "No se pudo cargar el tablero.");
    }
  }, [projectContextQuery.error]);

  useEffect(() => {
    if (taskDetailQuery.data) {
      applyTaskDetail(taskDetailQuery.data);
    }
  }, [taskDetailQuery.dataUpdatedAt]);

  useEffect(() => {
    if (taskDetailQuery.error) {
      onError(taskDetailQuery.error instanceof Error ? taskDetailQuery.error.message : "No se pudo cargar el detalle de actividad.");
    }
  }, [taskDetailQuery.error]);

  useEffect(() => {
    if (!selectedTaskId) {
      queryClient.removeQueries({ queryKey: queryKeys.taskDetail() });
      setSubtasks([]);
      setComments([]);
      setTimeLogs([]);
      setTaskEvents([]);
    }
  }, [selectedTaskId, queryClient]);

  useEffect(() => {
    if (!activeProjectId) {
      setActiveProject(undefined);
      setBoards([]);
      setActiveBoardId(undefined);
      setTasks([]);
      setCompletedTasks([]);
      setSelectedTaskId(undefined);
    } else {
      void queryClient.invalidateQueries({ queryKey: queryKeys.projectContext(activeProjectId) });
    }
  }, [activeProjectId, queryClient]);

  return {
    projects,
    visibleProjects,
    activeProjectId,
    activeProject,
    activeBoard,
    boardStatuses,
    tasks,
    completedTasks,
    selectedTaskId,
    selectedTask,
    subtasks,
    comments,
    timeLogs,
    taskEvents,
    boardMode,
    isLoadingProjects: projectsQuery.isFetching,
    isLoadingBoard: projectContextQuery.isFetching,
    isLoadingDetail: taskDetailQuery.isFetching,
    actions: {
      setActiveProjectId,
      setBoardMode,
      setSelectedTaskId,
      loadProjects,
      loadProjectContext,
      loadSelectedTaskDetail,
      handleCreateProject,
      handleUpdateProject,
      handleCreateTask,
      handleCreateSubtask,
      handleAddProjectMember,
      handleAddTaskAssignee,
      handleMentionTaskUser,
      handleTaskStatusChange,
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
