import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation, useNavigate } from "react-router-dom";
import {
  createWorkspace,
  listWorkspaces,
  logout,
  type CreateProjectInput,
  type CreateWorkspaceInput,
  type UpdateProjectInput
} from "../api/endpoints";
import { getWorkspaceCapabilities } from "../lib/permissions";
import { queryKeys } from "../lib/queryKeys";
import {
  clearStoredSession,
  clearStoredWorkspace,
  readStoredSession,
  readStoredWorkspace,
  storeSession,
  storeWorkspace
} from "../lib/storage";
import type { AuthSession, ViewKey, WorkspaceListItem } from "../types";
import { useBrowserNotifications } from "./useBrowserNotifications";
import { useManagementController } from "./useManagementController";
import { useProjectBoardController } from "./useProjectBoardController";
import { useRealtimeSync } from "./useRealtimeSync";
import { useReportsController } from "./useReportsController";
import { useWorkspacePeopleController } from "./useWorkspacePeopleController";

type ProjectFormInput = Omit<CreateProjectInput, "workspaceId">;

function canCreateWorkspaceFromMemberships(workspaces: WorkspaceListItem[]) {
  return workspaces.some((workspace) => getWorkspaceCapabilities(workspace).canCreateWorkspace);
}

function viewToPath(view: ViewKey) {
  return `/${view}`;
}

function pathToView(pathname: string): ViewKey | undefined {
  const normalizedPath = pathname.replace(/\/+$/, "") || "/";

  if (normalizedPath === "/projects") {
    return "projects";
  }

  if (normalizedPath === "/board") {
    return "board";
  }

  if (normalizedPath === "/management") {
    return "management";
  }

  if (normalizedPath === "/members") {
    return "members";
  }

  if (normalizedPath === "/reports") {
    return "reports";
  }

  return undefined;
}

export function useAppController() {
  const navigate = useNavigate();
  const location = useLocation();
  const [session, setSession] = useState<AuthSession | undefined>(() => readStoredSession());
  const [selectedWorkspace, setSelectedWorkspace] = useState<WorkspaceListItem | undefined>(() => readStoredWorkspace());
  const [workspaces, setWorkspaces] = useState<WorkspaceListItem[]>([]);
  const [globalError, setGlobalError] = useState("");
  const queryClient = useQueryClient();

  const token = session?.tokens.accessToken;
  const workspaceId = selectedWorkspace?.id;
  const currentView = useMemo(() => pathToView(location.pathname) ?? "projects", [location.pathname]);
  const permissions = useMemo(() => getWorkspaceCapabilities(selectedWorkspace), [selectedWorkspace]);

  const {
    notifications,
    notificationPermission,
    dismissNotification,
    requestBrowserNotifications,
    pushRealtimeNotification
  } = useBrowserNotifications(session?.user.id);

  const projectBoard = useProjectBoardController({
    token,
    workspaceId,
    onError: setGlobalError,
    clearError: () => setGlobalError("")
  });

  const people = useWorkspacePeopleController({
    token,
    workspaceId,
    canLoadMemberDirectory: permissions.canLoadManagementData,
    onError: setGlobalError
  });

  const management = useManagementController({
    token,
    workspaceId,
    enabled: currentView === "management" && permissions.canLoadManagementData,
    onError: setGlobalError
  });

  const reports = useReportsController({
    token,
    workspaceId,
    enabled: currentView === "reports" && permissions.canViewWorkspaceReports,
    onError: setGlobalError
  });

  function applyWorkspaces(nextWorkspaces: WorkspaceListItem[]) {
    setWorkspaces(nextWorkspaces);

    const refreshedSelectedWorkspace = selectedWorkspace
      ? nextWorkspaces.find((workspace) => workspace.id === selectedWorkspace.id)
      : undefined;

    if (refreshedSelectedWorkspace) {
      setSelectedWorkspace(refreshedSelectedWorkspace);
      storeWorkspace(refreshedSelectedWorkspace);
      return;
    }

    const firstWorkspace = nextWorkspaces[0];
    if (firstWorkspace) {
      setSelectedWorkspace(firstWorkspace);
      storeWorkspace(firstWorkspace);
    }
  }

  const workspacesQuery = useQuery({
    queryKey: queryKeys.workspaces(session?.user.id),
    queryFn: async () => {
      if (!session) {
        throw new Error("Sesion no disponible.");
      }

      return listWorkspaces(session.tokens.accessToken);
    },
    enabled: Boolean(session)
  });

  async function loadWorkspaces(nextSession?: AuthSession) {
    const sessionForRequest = nextSession ?? session;

    if (!sessionForRequest) {
      return;
    }

    setGlobalError("");

    try {
      const response = await queryClient.fetchQuery({
        queryKey: queryKeys.workspaces(sessionForRequest.user.id),
        queryFn: () => listWorkspaces(sessionForRequest.tokens.accessToken),
        staleTime: 0
      });
      applyWorkspaces(response.workspaces);
    } catch (error) {
      setGlobalError(error instanceof Error ? error.message : "No se pudieron cargar workspaces.");
    }
  }

  useEffect(() => {
    if (session) {
      void loadWorkspaces(session);
    }
  }, [session?.tokens.accessToken]);

  useEffect(() => {
    if (workspacesQuery.data) {
      applyWorkspaces(workspacesQuery.data.workspaces);
    }
  }, [workspacesQuery.dataUpdatedAt]);

  useEffect(() => {
    if (workspacesQuery.error) {
      setGlobalError(workspacesQuery.error instanceof Error ? workspacesQuery.error.message : "No se pudieron cargar workspaces.");
    }
  }, [workspacesQuery.error]);

  useEffect(() => {
    if (token && workspaceId) {
      void projectBoard.actions.loadProjects();
      void people.actions.loadWorkspaceCatalog();
    }
  }, [token, workspaceId, permissions.canLoadManagementData]);

  useEffect(() => {
    if (currentView === "members") {
      void people.actions.loadMembers();
    }

    if (currentView === "management") {
      void management.actions.loadManagement();
      void people.actions.loadMembers();
    }

    if (currentView === "reports") {
      void reports.actions.loadReports();
    }
  }, [currentView, token, workspaceId]);

  function handleAuthenticated(nextSession: AuthSession) {
    setSession(nextSession);
    storeSession(nextSession);
    navigate("/workspaces", { replace: true });
  }

  function resetWorkspaceState() {
    projectBoard.actions.resetProjectBoardState();
    people.actions.resetPeopleState();
    management.actions.resetManagementState();
    reports.actions.resetReportsState();
  }

  function handleWorkspaceSelect(workspace: WorkspaceListItem) {
    resetWorkspaceState();
    setSelectedWorkspace(workspace);
    storeWorkspace(workspace);
    navigate("/projects");
  }

  async function handleCreateWorkspace(input: CreateWorkspaceInput) {
    if (!token) {
      throw new Error("Sesion no disponible.");
    }

    const response = await createWorkspace(token, input);
    queryClient.setQueryData<{ workspaces: WorkspaceListItem[] }>(queryKeys.workspaces(session?.user.id), (currentData) => ({
      workspaces: [
        response.workspace,
        ...(currentData?.workspaces ?? []).filter((workspace) => workspace.id !== response.workspace.id)
      ]
    }));
    setWorkspaces((currentWorkspaces) => [
      response.workspace,
      ...currentWorkspaces.filter((workspace) => workspace.id !== response.workspace.id)
    ]);
    setSelectedWorkspace(response.workspace);
    storeWorkspace(response.workspace);
    resetWorkspaceState();
    projectBoard.actions.initializeWorkspaceProject(response.project, response.board);
    navigate("/members");
  }

  async function handleCreateProject(input: ProjectFormInput) {
    await projectBoard.actions.handleCreateProject(input);
    navigate("/board");
  }

  async function handleUpdateProject(projectId: string, input: UpdateProjectInput) {
    await projectBoard.actions.handleUpdateProject(projectId, input);
  }

  function clearWorkspaceSelection() {
    clearStoredWorkspace();
    setSelectedWorkspace(undefined);
    resetWorkspaceState();
  }

  function handleChangeWorkspace() {
    clearWorkspaceSelection();
    navigate("/workspaces");
  }

  function handleLogout() {
    if (session) {
      void logout(session.tokens.refreshToken).catch(() => undefined);
    }

    clearStoredSession();
    setSession(undefined);
    clearWorkspaceSelection();
    navigate("/login", { replace: true });
  }

  function handleGoToLogin() {
    if (session) {
      void logout(session.tokens.refreshToken).catch(() => undefined);
    }

    clearStoredSession();
    setSession(undefined);
    clearWorkspaceSelection();
    navigate("/login");
  }

  useRealtimeSync({
    token,
    workspaceId,
    activeProjectId: projectBoard.activeProjectId,
    selectedTaskId: projectBoard.selectedTaskId,
    canLoadManagementData: permissions.canLoadManagementData,
    refresh: {
      workspaces: () => void loadWorkspaces(),
      projects: (options) => void projectBoard.actions.loadProjects(options),
      catalog: (options) => void people.actions.loadWorkspaceCatalog(options),
      members: (options) => void people.actions.loadMembers(options),
      management: (options) => {
        void management.actions.loadManagement(options);
        void people.actions.loadWorkspaceCatalog(options);
      },
      reports: (options) => {
        if (permissions.canViewWorkspaceReports) {
          void reports.actions.loadReports(options);
        }
      },
      projectContext: (projectId, options) => void projectBoard.actions.loadProjectContext(projectId, options),
      taskDetail: (taskId, options) => void projectBoard.actions.loadSelectedTaskDetail(taskId, options)
    },
    onEvent: pushRealtimeNotification,
    onError: (error) => {
      if (error.code === "RATE_LIMITED") {
        setGlobalError("Tiempo real desactivado por demasiados cambios de sala. Recarga la vista para reconectar.");
        return;
      }

      if (error.code === "ACCESS_DENIED") {
        setGlobalError("Tu acceso en tiempo real cambio. Actualiza la vista para validar permisos.");
      }
    }
  });

  return {
    session,
    selectedWorkspace,
    workspaces,
    visibleProjects: projectBoard.visibleProjects,
    activeProjectId: projectBoard.activeProjectId,
    activeProject: projectBoard.activeProject,
    activeBoard: projectBoard.activeBoard,
    boardStatuses: projectBoard.boardStatuses,
    tasks: projectBoard.tasks,
    completedTasks: projectBoard.completedTasks,
    selectedTaskId: projectBoard.selectedTaskId,
    selectedTask: projectBoard.selectedTask,
    subtasks: projectBoard.subtasks,
    comments: projectBoard.comments,
    timeLogs: projectBoard.timeLogs,
    taskEvents: projectBoard.taskEvents,
    members: people.members,
    pendingMembers: people.pendingMembers,
    roles: people.roles,
    areas: people.areas,
    localities: people.localities,
    positions: people.positions,
    staffingRequests: management.staffingRequests,
    summary: reports.summary,
    currentView,
    boardMode: projectBoard.boardMode,
    isLoadingWorkspaces: workspacesQuery.isFetching,
    isLoadingProjects: projectBoard.isLoadingProjects,
    isLoadingBoard: projectBoard.isLoadingBoard,
    isLoadingDetail: projectBoard.isLoadingDetail,
    isLoadingMembers: people.isLoadingMembers,
    isLoadingManagement: management.isLoadingManagement,
    isLoadingReports: reports.isLoadingReports,
    globalError,
    notifications,
    notificationPermission,
    canCreateWorkspace: canCreateWorkspaceFromMemberships(workspaces),
    permissions,
    actions: {
      setCurrentView: (view: ViewKey) => navigate(viewToPath(view)),
      setActiveProjectId: projectBoard.actions.setActiveProjectId,
      setBoardMode: projectBoard.actions.setBoardMode,
      setSelectedTaskId: projectBoard.actions.setSelectedTaskId,
      loadWorkspaces,
      loadProjects: projectBoard.actions.loadProjects,
      loadProjectContext: projectBoard.actions.loadProjectContext,
      loadMembers: people.actions.loadMembers,
      loadManagement: management.actions.loadManagement,
      loadReports: reports.actions.loadReports,
      dismissNotification,
      handleEnableBrowserNotifications: requestBrowserNotifications,
      handleAuthenticated,
      handleWorkspaceSelect,
      handleCreateWorkspace,
      handleCreateProject,
      handleUpdateProject,
      handleCreateTask: projectBoard.actions.handleCreateTask,
      handleCreateSubtask: projectBoard.actions.handleCreateSubtask,
      handleAddProjectMember: projectBoard.actions.handleAddProjectMember,
      handleAddTaskAssignee: projectBoard.actions.handleAddTaskAssignee,
      handleMentionTaskUser: projectBoard.actions.handleMentionTaskUser,
      handleTaskStatusChange: projectBoard.actions.handleTaskStatusChange,
      handleCreateSubtaskTimeLog: projectBoard.actions.handleCreateSubtaskTimeLog,
      handleUpdateTaskPlan: projectBoard.actions.handleUpdateTaskPlan,
      handleCreateComment: projectBoard.actions.handleCreateComment,
      handleCreateTimeLog: projectBoard.actions.handleCreateTimeLog,
      handleInviteUser: people.actions.handleInviteUser,
      handleCreateArea: people.actions.handleCreateArea,
      handleCreateLocality: people.actions.handleCreateLocality,
      handleCreatePosition: people.actions.handleCreatePosition,
      handleApproveMember: people.actions.handleApproveMember,
      handleUpdateMember: people.actions.handleUpdateMember,
      handleCreateStaffingRequest: management.actions.handleCreateStaffingRequest,
      handleApproveStaffingRequest: management.actions.handleApproveStaffingRequest,
      handleRejectStaffingRequest: management.actions.handleRejectStaffingRequest,
      handleChangeWorkspace,
      handleLogout,
      handleGoToLogin
    }
  };
}

export type AppController = ReturnType<typeof useAppController>;
