import { useEffect, useMemo, useRef, useState } from "react";
import { AuthScreen } from "./components/AuthScreen";
import { BoardView } from "./components/BoardView";
import { MainLayout } from "./components/MainLayout";
import { MembersView } from "./components/MembersView";
import { ManagementView } from "./components/ManagementView";
import { ProjectsView } from "./components/ProjectsView";
import { RealtimeNotifications } from "./components/RealtimeNotifications";
import { ReportsView } from "./components/ReportsView";
import { TaskDetailPanel } from "./components/TaskDetailPanel";
import { WorkspaceSelect } from "./components/WorkspaceSelect";
import {
  addProjectMember,
  changeTaskStatus,
  approveStaffingRequest,
  approveWorkspaceMember,
  createComment,
  createProject,
  createStaffingRequest,
  createTask,
  createTimeLog,
  createWorkspaceArea,
  createWorkspaceLocality,
  createWorkspacePosition,
  getProject,
  getWorkspaceSummary,
  inviteUser,
  listComments,
  listTaskEvents,
  listStaffingRequests,
  listPendingWorkspaceMembers,
  listProjects,
  listSubtasks,
  listTasks,
  listTimeLogs,
  listWorkspaceAreas,
  listWorkspaceLocalities,
  listWorkspaces,
  listWorkspaceMembers,
  listWorkspacePositions,
  listWorkspaceRoles,
  logout,
  rejectStaffingRequest,
  updateProject,
  updateTask,
  updateWorkspaceMember
} from "./api/endpoints";
import { connectRealtime, type RealtimeClientError, type RealtimeEvent, type RealtimeSocket } from "./realtime/socket";
import {
  clearStoredSession,
  clearStoredWorkspace,
  readStoredSession,
  readStoredWorkspace,
  storeSession,
  storeWorkspace
} from "./lib/storage";
import type {
  AuthSession,
  ActivityEvent,
  Area,
  Board,
  BoardMode,
  Locality,
  Position,
  Project,
  Role,
  StaffingRequest,
  Task,
  TaskComment,
  TaskPriority,
  TimeLog,
  UserType,
  ViewKey,
  WorkspaceListItem,
  WorkspaceMember,
  WorkspaceSummary
} from "./types";

function canManageProjectMembers(roleName?: string) {
  return roleName === "Admin" || roleName === "Admin TI" || roleName === "Gerente";
}

type NotificationPermissionState = "default" | "denied" | "granted" | "unsupported";

type AppNotification = {
  id: string;
  title: string;
  message: string;
  createdAt: string;
};

function isLoginRoute() {
  const normalizedPath = window.location.pathname.replace(/\/+$/, "");
  return normalizedPath === "/login" || window.location.hash === "#/login";
}

function getBrowserNotificationPermission(): NotificationPermissionState {
  if (!("Notification" in window)) {
    return "unsupported";
  }

  return Notification.permission;
}

export function App() {
  const [forceAuthScreen, setForceAuthScreen] = useState(() => isLoginRoute());
  const [session, setSession] = useState<AuthSession | undefined>(() => readStoredSession());
  const [selectedWorkspace, setSelectedWorkspace] = useState<WorkspaceListItem | undefined>(() => readStoredWorkspace());
  const [workspaces, setWorkspaces] = useState<WorkspaceListItem[]>([]);
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
  const [members, setMembers] = useState<WorkspaceMember[]>([]);
  const [pendingMembers, setPendingMembers] = useState<WorkspaceMember[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [areas, setAreas] = useState<Area[]>([]);
  const [localities, setLocalities] = useState<Locality[]>([]);
  const [positions, setPositions] = useState<Position[]>([]);
  const [staffingRequests, setStaffingRequests] = useState<StaffingRequest[]>([]);
  const [summary, setSummary] = useState<WorkspaceSummary>();
  const [currentView, setCurrentView] = useState<ViewKey>("projects");
  const [boardMode, setBoardMode] = useState<BoardMode>("kanban");
  const [isLoadingWorkspaces, setIsLoadingWorkspaces] = useState(false);
  const [isLoadingProjects, setIsLoadingProjects] = useState(false);
  const [isLoadingBoard, setIsLoadingBoard] = useState(false);
  const [isLoadingDetail, setIsLoadingDetail] = useState(false);
  const [isLoadingMembers, setIsLoadingMembers] = useState(false);
  const [isLoadingManagement, setIsLoadingManagement] = useState(false);
  const [isLoadingReports, setIsLoadingReports] = useState(false);
  const [globalError, setGlobalError] = useState("");
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermissionState>(() => getBrowserNotificationPermission());
  const realtimeSocketRef = useRef<RealtimeSocket>();
  const activeProjectIdRef = useRef<string>();
  const selectedTaskIdRef = useRef<string>();
  const currentViewRef = useRef<ViewKey>("projects");
  const joinedWorkspaceIdRef = useRef<string>();
  const joinedProjectIdRef = useRef<string>();
  const joinedTaskIdRef = useRef<string>();

  const token = session?.tokens.accessToken;
  const activeBoard = boards.find((board) => board.id === activeBoardId) ?? boards[0];
  const selectedTask = tasks.find((task) => task.id === selectedTaskId) ?? completedTasks.find((task) => task.id === selectedTaskId);
  const boardStatuses = activeBoard?.statuses ?? [];

  const workspaceId = selectedWorkspace?.id;

  async function loadWorkspaces(nextSession?: AuthSession) {
    const sessionForRequest = nextSession ?? session;

    if (!sessionForRequest) {
      return;
    }

    setIsLoadingWorkspaces(true);
    setGlobalError("");

    try {
      const response = await listWorkspaces(sessionForRequest.tokens.accessToken);
      setWorkspaces(response.workspaces);

      if (selectedWorkspace && response.workspaces.some((workspace) => workspace.id === selectedWorkspace.id)) {
        return;
      }

      const firstWorkspace = response.workspaces[0];
      if (firstWorkspace) {
        setSelectedWorkspace(firstWorkspace);
        storeWorkspace(firstWorkspace);
      }
    } catch (error) {
      setGlobalError(error instanceof Error ? error.message : "No se pudieron cargar workspaces.");
    } finally {
      setIsLoadingWorkspaces(false);
    }
  }

  async function loadProjects() {
    if (!token || !workspaceId) {
      return;
    }

    setIsLoadingProjects(true);
    setGlobalError("");

    try {
      const response = await listProjects(token, workspaceId);
      setProjects(response.projects);

      const currentProjectStillExists = activeProjectId
        ? response.projects.some((project) => project.id === activeProjectId)
        : false;

      if (!currentProjectStillExists) {
        setActiveProjectId(response.projects[0]?.id);
      }
    } catch (error) {
      setGlobalError(error instanceof Error ? error.message : "No se pudieron cargar proyectos.");
    } finally {
      setIsLoadingProjects(false);
    }
  }

  async function loadProjectContext(projectId: string) {
    if (!token) {
      return;
    }

    setIsLoadingBoard(true);
    setGlobalError("");

    try {
      const projectResponse = await getProject(token, projectId);
      const projectBoards = projectResponse.project.boards ?? [];
      const firstBoard = projectBoards[0];

      setActiveProject(projectResponse.project);
      setBoards(projectBoards);
      setActiveBoardId(firstBoard?.id);

      if (firstBoard) {
        const [taskResponse, completedTaskResponse] = await Promise.all([
          listTasks(token, firstBoard.id, "active"),
          listTasks(token, firstBoard.id, "completed")
        ]);
        const allLoadedTasks = [...taskResponse.tasks, ...completedTaskResponse.tasks];
        const preferredTaskId = selectedTaskIdRef.current;
        const nextSelectedTaskId = preferredTaskId && allLoadedTasks.some((task) => task.id === preferredTaskId)
          ? preferredTaskId
          : taskResponse.tasks[0]?.id ?? completedTaskResponse.tasks[0]?.id;

        setTasks(taskResponse.tasks);
        setCompletedTasks(completedTaskResponse.tasks);
        setSelectedTaskId(nextSelectedTaskId);
      } else {
        setTasks([]);
        setCompletedTasks([]);
        setSubtasks([]);
        setSelectedTaskId(undefined);
      }
    } catch (error) {
      setGlobalError(error instanceof Error ? error.message : "No se pudo cargar el tablero.");
    } finally {
      setIsLoadingBoard(false);
    }
  }

  async function loadSelectedTaskDetail(taskId: string) {
    if (!token) {
      return;
    }

    setIsLoadingDetail(true);

    try {
      const [commentResponse, timeResponse, subtaskResponse] = await Promise.all([
        listComments(token, taskId),
        listTimeLogs(token, taskId),
        listSubtasks(token, taskId)
      ]);
      setComments(commentResponse.comments);
      setTimeLogs(timeResponse.timeLogs);
      setSubtasks(subtaskResponse.subtasks);

      try {
        const eventResponse = await listTaskEvents(token, taskId);
        setTaskEvents(eventResponse.events);
      } catch {
        setTaskEvents([]);
      }
    } catch (error) {
      setGlobalError(error instanceof Error ? error.message : "No se pudo cargar el detalle de actividad.");
    } finally {
      setIsLoadingDetail(false);
    }
  }

  async function loadMembers() {
    if (!token || !workspaceId) {
      return;
    }

    setIsLoadingMembers(true);

    try {
      const [memberResponse, pendingResponse, roleResponse, areaResponse, localityResponse, positionResponse] = await Promise.all([
        listWorkspaceMembers(token, workspaceId),
        listPendingWorkspaceMembers(token, workspaceId),
        listWorkspaceRoles(token, workspaceId),
        listWorkspaceAreas(token, workspaceId),
        listWorkspaceLocalities(token, workspaceId),
        listWorkspacePositions(token, workspaceId)
      ]);
      setMembers(memberResponse.members);
      setPendingMembers(pendingResponse.members);
      setRoles(roleResponse.roles);
      setAreas(areaResponse.areas);
      setLocalities(localityResponse.localities);
      setPositions(positionResponse.positions);
    } catch (error) {
      setGlobalError(error instanceof Error ? error.message : "No se pudieron cargar miembros.");
    } finally {
      setIsLoadingMembers(false);
    }
  }

  async function loadWorkspaceCatalog() {
    if (!token || !workspaceId) {
      return;
    }

    try {
      const [areaResponse, localityResponse, positionResponse] = await Promise.all([
        listWorkspaceAreas(token, workspaceId),
        listWorkspaceLocalities(token, workspaceId),
        listWorkspacePositions(token, workspaceId)
      ]);
      setAreas(areaResponse.areas);
      setLocalities(localityResponse.localities);
      setPositions(positionResponse.positions);

      if (canManageProjectMembers(selectedWorkspace?.member.role?.name)) {
        try {
          const [memberResponse, roleResponse] = await Promise.all([
            listWorkspaceMembers(token, workspaceId),
            listWorkspaceRoles(token, workspaceId)
          ]);
          setMembers(memberResponse.members);
          setRoles(roleResponse.roles);
        } catch {
          setMembers([]);
          setRoles([]);
        }
      }
    } catch (error) {
      setGlobalError(error instanceof Error ? error.message : "No se pudieron cargar areas y puestos.");
    }
  }

  async function loadReports() {
    if (!token || !workspaceId) {
      return;
    }

    setIsLoadingReports(true);

    try {
      setSummary(await getWorkspaceSummary(token, workspaceId));
    } catch (error) {
      setGlobalError(error instanceof Error ? error.message : "No se pudieron cargar reportes.");
    } finally {
      setIsLoadingReports(false);
    }
  }

  async function loadManagement() {
    if (!token || !workspaceId) {
      return;
    }

    setIsLoadingManagement(true);

    try {
      const [staffingResponse, memberResponse, areaResponse, localityResponse, positionResponse, roleResponse] = await Promise.all([
        listStaffingRequests(token, workspaceId),
        listWorkspaceMembers(token, workspaceId),
        listWorkspaceAreas(token, workspaceId),
        listWorkspaceLocalities(token, workspaceId),
        listWorkspacePositions(token, workspaceId),
        listWorkspaceRoles(token, workspaceId)
      ]);
      setStaffingRequests(staffingResponse.staffingRequests);
      setMembers(memberResponse.members);
      setAreas(areaResponse.areas);
      setLocalities(localityResponse.localities);
      setPositions(positionResponse.positions);
      setRoles(roleResponse.roles);
    } catch (error) {
      setGlobalError(error instanceof Error ? error.message : "No se pudo cargar gerencia.");
    } finally {
      setIsLoadingManagement(false);
    }
  }

  function dismissNotification(notificationId: string) {
    setNotifications((currentNotifications) => currentNotifications.filter((notification) => notification.id !== notificationId));
  }

  async function handleEnableBrowserNotifications() {
    if (!("Notification" in window)) {
      setNotificationPermission("unsupported");
      return;
    }

    const permission = await Notification.requestPermission();
    setNotificationPermission(permission);
  }

  function pushRealtimeNotification(event: RealtimeEvent) {
    if (event.actorId === session?.user.id) {
      return;
    }

    const notification = {
      id: event.id,
      title: event.title,
      message: event.message,
      createdAt: event.createdAt
    };

    setNotifications((currentNotifications) => [notification, ...currentNotifications].slice(0, 5));

    if (notificationPermission === "granted") {
      new Notification(event.title, {
        body: event.message,
        tag: event.id
      });
    }
  }

  function handleRealtimeEvent(event: RealtimeEvent) {
    pushRealtimeNotification(event);

    if (event.type.startsWith("project.") || event.type.startsWith("board.")) {
      void loadProjects();
    }

    if (event.type.startsWith("workspace.")) {
      void loadWorkspaceCatalog();

      if (currentViewRef.current === "members") {
        void loadMembers();
      }
    }

    if (event.type.startsWith("staffing.") && currentViewRef.current === "management") {
      void loadManagement();
    }

    if (event.projectId && event.projectId === activeProjectIdRef.current) {
      void loadProjectContext(event.projectId);
    }

    if (event.taskId && event.taskId === selectedTaskIdRef.current) {
      void loadSelectedTaskDetail(event.taskId);
    }

    if (currentViewRef.current === "reports" && (event.type.startsWith("task.") || event.type.startsWith("time."))) {
      void loadReports();
    }
  }

  function handleRealtimeError(error: RealtimeClientError) {
    if (error.code === "RATE_LIMITED") {
      setGlobalError("Tiempo real desactivado por demasiados cambios de sala. Recarga la vista para reconectar.");
      return;
    }

    if (error.code === "ACCESS_DENIED") {
      setGlobalError("Tu acceso en tiempo real cambio. Actualiza la vista para validar permisos.");
    }
  }

  function joinWorkspaceRealtime(socket: RealtimeSocket, nextWorkspaceId: string) {
    socket.emit("workspace:join", { workspaceId: nextWorkspaceId }, (response) => {
      if (response.ok) {
        joinedWorkspaceIdRef.current = nextWorkspaceId;
      }
    });
  }

  function joinProjectRealtime(socket: RealtimeSocket, nextProjectId: string) {
    const previousProjectId = joinedProjectIdRef.current;
    if (previousProjectId && previousProjectId !== nextProjectId) {
      socket.emit("project:leave", { projectId: previousProjectId });
      joinedProjectIdRef.current = undefined;
      joinedTaskIdRef.current = undefined;
    }

    socket.emit("project:join", { projectId: nextProjectId }, (response) => {
      if (response.ok) {
        joinedProjectIdRef.current = nextProjectId;
      }
    });
  }

  function joinTaskRealtime(socket: RealtimeSocket, nextTaskId: string) {
    const previousTaskId = joinedTaskIdRef.current;
    if (previousTaskId && previousTaskId !== nextTaskId) {
      socket.emit("task:leave", { taskId: previousTaskId });
      joinedTaskIdRef.current = undefined;
    }

    socket.emit("task:join", { taskId: nextTaskId }, (response) => {
      if (response.ok) {
        joinedTaskIdRef.current = nextTaskId;
      }
    });
  }

  useEffect(() => {
    activeProjectIdRef.current = activeProjectId;
    selectedTaskIdRef.current = selectedTaskId;
    currentViewRef.current = currentView;
  }, [activeProjectId, selectedTaskId, currentView]);

  useEffect(() => {
    if (!token || !workspaceId) {
      return undefined;
    }

    const socket = connectRealtime(token);
    realtimeSocketRef.current = socket;

    socket.on("connect", () => {
      joinWorkspaceRealtime(socket, workspaceId);

      if (activeProjectIdRef.current) {
        joinProjectRealtime(socket, activeProjectIdRef.current);
      }

      if (selectedTaskIdRef.current) {
        joinTaskRealtime(socket, selectedTaskIdRef.current);
      }
    });
    socket.on("realtime:event", handleRealtimeEvent);
    socket.on("realtime:error", handleRealtimeError);

    return () => {
      if (joinedTaskIdRef.current) {
        socket.emit("task:leave", { taskId: joinedTaskIdRef.current });
      }
      if (joinedProjectIdRef.current) {
        socket.emit("project:leave", { projectId: joinedProjectIdRef.current });
      }
      if (joinedWorkspaceIdRef.current) {
        socket.emit("workspace:leave", { workspaceId: joinedWorkspaceIdRef.current });
      }
      socket.off("realtime:event", handleRealtimeEvent);
      socket.off("realtime:error", handleRealtimeError);
      socket.disconnect();
      realtimeSocketRef.current = undefined;
      joinedWorkspaceIdRef.current = undefined;
      joinedProjectIdRef.current = undefined;
      joinedTaskIdRef.current = undefined;
    };
  }, [token, workspaceId]);

  useEffect(() => {
    if (activeProjectId && realtimeSocketRef.current?.connected) {
      joinProjectRealtime(realtimeSocketRef.current, activeProjectId);
    } else if (!activeProjectId && realtimeSocketRef.current?.connected && joinedProjectIdRef.current) {
      realtimeSocketRef.current.emit("project:leave", { projectId: joinedProjectIdRef.current });
      joinedProjectIdRef.current = undefined;
      joinedTaskIdRef.current = undefined;
    }
  }, [activeProjectId]);

  useEffect(() => {
    if (selectedTaskId && realtimeSocketRef.current?.connected) {
      joinTaskRealtime(realtimeSocketRef.current, selectedTaskId);
    } else if (!selectedTaskId && realtimeSocketRef.current?.connected && joinedTaskIdRef.current) {
      realtimeSocketRef.current.emit("task:leave", { taskId: joinedTaskIdRef.current });
      joinedTaskIdRef.current = undefined;
    }
  }, [selectedTaskId]);

  useEffect(() => {
    if (session) {
      void loadWorkspaces(session);
    }
  }, [session?.tokens.accessToken]);

  useEffect(() => {
    if (token && workspaceId) {
      void loadProjects();
      void loadWorkspaceCatalog();
    }
  }, [token, workspaceId]);

  useEffect(() => {
    if (activeProjectId) {
      void loadProjectContext(activeProjectId);
    }
  }, [activeProjectId, token]);

  useEffect(() => {
    if (selectedTaskId) {
      void loadSelectedTaskDetail(selectedTaskId);
    } else {
      setSubtasks([]);
      setComments([]);
      setTimeLogs([]);
      setTaskEvents([]);
    }
  }, [selectedTaskId, token]);

  useEffect(() => {
    if (currentView === "members") {
      void loadMembers();
    }

    if (currentView === "management") {
      void loadManagement();
    }

    if (currentView === "reports") {
      void loadReports();
    }
  }, [currentView, token, workspaceId]);

  const visibleProjects = useMemo(() => projects, [projects]);

  function handleAuthenticated(nextSession: AuthSession) {
    setSession(nextSession);
    storeSession(nextSession);
    setForceAuthScreen(false);
    window.history.replaceState({}, "", "/");
  }

  function handleWorkspaceSelect(workspace: WorkspaceListItem) {
    setSelectedWorkspace(workspace);
    storeWorkspace(workspace);
    setCurrentView("projects");
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

    setProjects((currentProjects) => [...currentProjects, response.project]);
    setActiveProjectId(response.project.id);
    setCurrentView("board");
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

    setTasks((currentTasks) => [response.task, ...currentTasks]);
    setCompletedTasks((currentTasks) => currentTasks.filter((task) => task.id !== response.task.id));
    setSelectedTaskId(response.task.id);
  }

  async function handleCreateSubtask(input: {
    title: string;
    description?: string;
    priority: TaskPriority;
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
      dueAt: input.dueAt,
      estimateMinutes: input.estimateMinutes,
      assigneeIds: input.assigneeIds
    });

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

  async function handleTaskStatusChange(taskId: string, statusId: string) {
    if (!token) {
      return;
    }

    const response = await changeTaskStatus(token, taskId, statusId);
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

  async function handleUpdateTaskPlan(input: { startAt?: string; dueAt?: string; estimateMinutes?: number }) {
    if (!token || !selectedTaskId) {
      throw new Error("Selecciona una actividad.");
    }

    const response = await updateTask(token, selectedTaskId, input);
    setTasks((currentTasks) => currentTasks.map((task) => (task.id === selectedTaskId ? { ...task, ...response.task } : task)));
    setCompletedTasks((currentTasks) => currentTasks.map((task) => (task.id === selectedTaskId ? { ...task, ...response.task } : task)));
    void loadSelectedTaskDetail(selectedTaskId);
  }

  async function handleCreateComment(body: string, isInternal: boolean) {
    if (!token || !selectedTaskId) {
      throw new Error("Selecciona una actividad.");
    }

    const response = await createComment(token, selectedTaskId, body, isInternal);
    setComments((currentComments) => [...currentComments, response.comment]);
    void loadSelectedTaskDetail(selectedTaskId);
  }

  async function handleCreateTimeLog(minutes: number, note?: string) {
    if (!token || !selectedTaskId) {
      throw new Error("Selecciona una actividad.");
    }

    const response = await createTimeLog(token, selectedTaskId, minutes, note);
    setTimeLogs((currentLogs) => [response.timeLog, ...currentLogs]);
    void loadSelectedTaskDetail(selectedTaskId);
  }

  async function handleInviteUser(input: {
    email: string;
    userType: UserType;
    roleId?: string;
    areaId?: string;
    localityId?: string;
    localityIds?: string[];
    positionId?: string;
    projectId?: string;
    expiresInDays: number;
  }) {
    if (!token || !workspaceId) {
      throw new Error("Workspace no disponible.");
    }

    const response = await inviteUser(token, {
      workspaceId,
      ...input
    });
    await loadMembers();
    return response.inviteToken;
  }

  async function handleCreateArea(input: { name: string; description?: string }) {
    if (!token || !workspaceId) {
      throw new Error("Workspace no disponible.");
    }

    const response = await createWorkspaceArea(token, {
      workspaceId,
      ...input
    });
    setAreas((currentAreas) => [...currentAreas, response.area]);
  }

  async function handleCreateLocality(input: { areaId?: string; name: string; code: string; description?: string }) {
    if (!token || !workspaceId) {
      throw new Error("Workspace no disponible.");
    }

    const response = await createWorkspaceLocality(token, {
      workspaceId,
      ...input
    });
    setLocalities((currentLocalities) => [...currentLocalities, response.locality]);
  }

  async function handleCreatePosition(input: {
    areaId?: string;
    name: string;
    description?: string;
    isManager: boolean;
  }) {
    if (!token || !workspaceId) {
      throw new Error("Workspace no disponible.");
    }

    const response = await createWorkspacePosition(token, {
      workspaceId,
      ...input
    });
    setPositions((currentPositions) => [...currentPositions, response.position]);
  }

  async function handleApproveMember(input: {
    memberId: string;
    roleId?: string;
    areaId?: string;
    localityId?: string;
    localityIds?: string[];
    positionId?: string;
    userType?: UserType;
  }) {
    if (!token || !workspaceId) {
      throw new Error("Workspace no disponible.");
    }

    const response = await approveWorkspaceMember(token, {
      workspaceId,
      ...input
    });
    setPendingMembers((currentMembers) => currentMembers.filter((member) => member.id !== response.member.id));
    setMembers((currentMembers) => [response.member, ...currentMembers.filter((member) => member.id !== response.member.id)]);
  }

  async function handleUpdateMember(input: {
    memberId: string;
    roleId?: string;
    areaId?: string;
    localityId?: string;
    localityIds?: string[];
    positionId?: string;
    userType?: UserType;
  }) {
    if (!token || !workspaceId) {
      throw new Error("Workspace no disponible.");
    }

    const response = await updateWorkspaceMember(token, {
      workspaceId,
      ...input
    });
    setMembers((currentMembers) =>
      currentMembers.map((member) => member.id === response.member.id ? response.member : member)
    );
  }

  async function handleCreateStaffingRequest(input: {
    projectId: string;
    targetAreaId: string;
    targetLocalityId?: string;
    positionId?: string;
    roleId?: string;
    requestedUserId?: string;
    quantity: number;
    note?: string;
  }) {
    if (!token) {
      throw new Error("Sesion no disponible.");
    }

    const response = await createStaffingRequest(token, input);
    setStaffingRequests((currentRequests) => [response.staffingRequest, ...currentRequests]);
  }

  async function handleApproveStaffingRequest(input: {
    requestId: string;
    approvedUserIds: string[];
    responseNote?: string;
  }) {
    if (!token) {
      throw new Error("Sesion no disponible.");
    }

    const response = await approveStaffingRequest(token, input);
    setStaffingRequests((currentRequests) =>
      currentRequests.map((request) => request.id === response.staffingRequest.id ? response.staffingRequest : request)
    );
  }

  async function handleRejectStaffingRequest(input: {
    requestId: string;
    responseNote?: string;
  }) {
    if (!token) {
      throw new Error("Sesion no disponible.");
    }

    const response = await rejectStaffingRequest(token, input);
    setStaffingRequests((currentRequests) =>
      currentRequests.map((request) => request.id === response.staffingRequest.id ? response.staffingRequest : request)
    );
  }

  function handleChangeWorkspace() {
    clearStoredWorkspace();
    setSelectedWorkspace(undefined);
    setProjects([]);
    setActiveProject(undefined);
    setActiveProjectId(undefined);
    setBoards([]);
    setTasks([]);
    setCompletedTasks([]);
    setSubtasks([]);
    setSelectedTaskId(undefined);
    setMembers([]);
    setPendingMembers([]);
    setRoles([]);
    setAreas([]);
    setPositions([]);
    setLocalities([]);
    setStaffingRequests([]);
    setComments([]);
    setTimeLogs([]);
    setTaskEvents([]);
  }

  function handleLogout() {
    if (session) {
      void logout(session.tokens.refreshToken).catch(() => undefined);
    }

    clearStoredSession();
    clearStoredWorkspace();
    setSession(undefined);
    setSelectedWorkspace(undefined);
    setProjects([]);
    setActiveProject(undefined);
    setActiveProjectId(undefined);
    setBoards([]);
    setTasks([]);
    setCompletedTasks([]);
    setSubtasks([]);
    setSelectedTaskId(undefined);
    setMembers([]);
    setPendingMembers([]);
    setRoles([]);
    setAreas([]);
    setPositions([]);
    setLocalities([]);
    setStaffingRequests([]);
    setComments([]);
    setTimeLogs([]);
    setTaskEvents([]);
  }

  function handleGoToLogin() {
    if (session) {
      void logout(session.tokens.refreshToken).catch(() => undefined);
    }

    clearStoredSession();
    clearStoredWorkspace();
    setForceAuthScreen(true);
    setSession(undefined);
    setSelectedWorkspace(undefined);
    setProjects([]);
    setActiveProject(undefined);
    setActiveProjectId(undefined);
    setBoards([]);
    setTasks([]);
    setCompletedTasks([]);
    setSubtasks([]);
    setSelectedTaskId(undefined);
    setMembers([]);
    setPendingMembers([]);
    setRoles([]);
    setAreas([]);
    setPositions([]);
    setLocalities([]);
    setStaffingRequests([]);
    setComments([]);
    setTimeLogs([]);
    setTaskEvents([]);
    window.history.pushState({}, "", "/login");
  }

  if (!session || forceAuthScreen) {
    return <AuthScreen onAuthenticated={handleAuthenticated} />;
  }

  if (!selectedWorkspace) {
    return (
      <WorkspaceSelect
        workspaces={workspaces}
        isLoading={isLoadingWorkspaces}
        onRefresh={() => void loadWorkspaces(session)}
        onSelect={handleWorkspaceSelect}
        onGoToLogin={handleGoToLogin}
      />
    );
  }

  return (
    <MainLayout
      session={session}
      workspace={selectedWorkspace}
      currentView={currentView}
      notificationPermission={notificationPermission}
      onViewChange={setCurrentView}
      onEnableNotifications={() => void handleEnableBrowserNotifications()}
      onChangeWorkspace={handleChangeWorkspace}
      onLogout={handleLogout}
    >
      {globalError ? <div className="global-error">{globalError}</div> : undefined}

      {currentView === "projects" ? (
        <ProjectsView
          projects={visibleProjects}
          areas={areas}
          localities={localities}
          activeProjectId={activeProjectId}
          isLoading={isLoadingProjects}
          canCreateProjects={canManageProjectMembers(selectedWorkspace.member.role?.name)}
          onRefresh={() => void loadProjects()}
          onSelectProject={(projectId) => {
            setActiveProjectId(projectId);
            setCurrentView("board");
          }}
          onCreateProject={handleCreateProject}
          onUpdateProject={handleUpdateProject}
        />
      ) : undefined}

      {currentView === "board" ? (
        <>
          <div className="board-layout">
            <BoardView
              projects={visibleProjects}
              activeProject={activeProject}
              activeBoard={activeBoard}
              tasks={tasks}
              completedTasks={completedTasks}
              boardMode={boardMode}
              isLoading={isLoadingBoard}
              selectedTaskId={selectedTaskId}
              currentUserId={session.user.id}
              workspaceMembers={members}
              roles={roles}
              canCreateTasks={canManageProjectMembers(selectedWorkspace.member.role?.name)}
              canManageProjectMembers={canManageProjectMembers(selectedWorkspace.member.role?.name)}
              canEditCompletedTasks={canManageProjectMembers(selectedWorkspace.member.role?.name)}
              onRefresh={() => activeProjectId ? void loadProjectContext(activeProjectId) : undefined}
              onProjectChange={setActiveProjectId}
              onBoardModeChange={setBoardMode}
              onCreateTask={handleCreateTask}
              onAddProjectMember={handleAddProjectMember}
              onTaskStatusChange={handleTaskStatusChange}
              onSelectTask={setSelectedTaskId}
            />
          </div>
          <TaskDetailPanel
            task={selectedTask}
            subtasks={subtasks}
            statuses={boardStatuses}
            projectMembers={activeProject?.members ?? []}
            comments={comments}
            timeLogs={timeLogs}
            events={taskEvents}
            isLoading={isLoadingDetail}
            currentUserId={session.user.id}
            canCreateSubtasks={canManageProjectMembers(selectedWorkspace.member.role?.name)}
            canMoveClosedTasks={canManageProjectMembers(selectedWorkspace.member.role?.name)}
            canModifyCompletedTask={selectedWorkspace.member.role?.name === "Admin" || selectedWorkspace.member.role?.name === "Admin TI"}
            onClose={() => setSelectedTaskId(undefined)}
            onUpdateTaskPlan={handleUpdateTaskPlan}
            onCreateSubtask={handleCreateSubtask}
            onSubtaskStatusChange={handleTaskStatusChange}
            onCreateComment={handleCreateComment}
            onCreateTimeLog={handleCreateTimeLog}
          />
        </>
      ) : undefined}

      {currentView === "management" ? (
        <ManagementView
          staffingRequests={staffingRequests}
          projects={visibleProjects}
          members={members}
          areas={areas}
          localities={localities}
          positions={positions}
          roles={roles}
          currentAreaId={selectedWorkspace.member.area?.id}
          isLoading={isLoadingManagement}
          onRefresh={() => void loadManagement()}
          onCreateStaffingRequest={handleCreateStaffingRequest}
          onApproveStaffingRequest={handleApproveStaffingRequest}
          onRejectStaffingRequest={handleRejectStaffingRequest}
        />
      ) : undefined}

      {currentView === "members" ? (
        <MembersView
          members={members}
          pendingMembers={pendingMembers}
          roles={roles}
          areas={areas}
          localities={localities}
          positions={positions}
          projects={visibleProjects}
          isLoading={isLoadingMembers}
          onRefresh={() => void loadMembers()}
          onInviteUser={handleInviteUser}
          onCreateArea={handleCreateArea}
          onCreateLocality={handleCreateLocality}
          onCreatePosition={handleCreatePosition}
          onApproveMember={handleApproveMember}
          onUpdateMember={handleUpdateMember}
        />
      ) : undefined}

      {currentView === "reports" ? (
        <ReportsView
          summary={summary}
          isLoading={isLoadingReports}
          onRefresh={() => void loadReports()}
        />
      ) : undefined}
      <RealtimeNotifications notifications={notifications} onDismiss={dismissNotification} />
    </MainLayout>
  );
}
