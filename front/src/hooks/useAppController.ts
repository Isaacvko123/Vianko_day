import { refreshSharedSession } from "../lib/session-refresh";
import { useEffect, useMemo, useRef, useState } from "react";
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
import { ApiError, apiRequest, authSessionExpiredEventName, type AuthSessionExpiredDetail } from "../api/http";
import { getWorkspaceCapabilities } from "../lib/permissions";
import { queryKeys } from "../lib/queryKeys";
import {
  clearStoredSession,
  clearStoredWorkspace,
  getSessionAccessTokenExpiresAt,
  readStoredSession,
  readStoredWorkspace,
  shouldRefreshSessionAccessToken,
  storeSession,
  storeWorkspace
} from "../lib/storage";
import type { AuthSession, ViewKey, WorkspaceListItem } from "../types";
import { useNotificationInbox, type InboxItem } from "./useNotificationInbox";
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
  if (pathname === "/work") return "work";
  if (pathname === "/roles") return "roles";
  if (pathname === "/organization") return "organization";
  if (pathname === "/notifications") return "notifications";
  const normalizedPath = pathname.replace(/\/+$/, "") || "/";

  if (normalizedPath === "/projects") {
    return "projects";
  }

  if (normalizedPath === "/board") {
    return "board";
  }

  if (normalizedPath === "/completed") {
    return "completed";
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

  const workspaceId = selectedWorkspace?.id;
  const currentView = useMemo(() => pathToView(location.pathname) ?? "projects", [location.pathname]);
  const permissions = useMemo(() => getWorkspaceCapabilities(selectedWorkspace), [selectedWorkspace]);
  const sessionNeedsRefresh = shouldRefreshSessionAccessToken(session);
  const token = sessionNeedsRefresh ? undefined : session?.tokens.accessToken;

  const {
    notifications,
    notificationPermission,
    dismissNotification,
    requestBrowserNotifications,
    pushRealtimeNotification
  } = useBrowserNotifications(session?.user.id, token, getWorkspaceCapabilities(selectedWorkspace).canViewManagement);
  const inbox = useNotificationInbox(token, workspaceId, session?.user.id);
  const deepLinkRef = useRef<string>();

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
    canLoadCatalog: selectedWorkspace?.member.userType === "INTERNAL",
    canApproveMembers: Boolean(selectedWorkspace?.member.permissions?.some((key) => ["workspace.manage", "member.manage", "area.approve_members"].includes(key))),
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

  useEffect(() => {
    function syncSession(event: StorageEvent) {
      if (event.key !== "vianko-day.auth") return;
      const nextSession = readStoredSession();
      if (!nextSession || nextSession.user.id !== session?.user.id) { queryClient.clear(); clearWorkspaceSelection(); }
      setSession(nextSession);
    }
    window.addEventListener("storage", syncSession);
    return () => window.removeEventListener("storage", syncSession);
  }, [session?.user.id]);

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
    } else {
      clearStoredWorkspace();
      setSelectedWorkspace(undefined);
      resetWorkspaceState();
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
    enabled: Boolean(session && !sessionNeedsRefresh)
  });

  async function loadWorkspaces(nextSession?: AuthSession) {
    const sessionForRequest = nextSession ?? session;

    if (!sessionForRequest) {
      return;
    }

    if (shouldRefreshSessionAccessToken(sessionForRequest, 5_000)) {
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
    if (!session) {
      return undefined;
    }

    const currentSession = session;
    let isCancelled = false;

    async function bootstrapSession() {
      let sessionForRequest = currentSession;

      if (shouldRefreshSessionAccessToken(currentSession)) {
        try {
          const refreshed = await refreshSharedSession(currentSession);

          if (isCancelled) {
            return;
          }

          sessionForRequest = refreshed;
          setSession(sessionForRequest);
          void queryClient.invalidateQueries();
        } catch (error) {
          if (!isCancelled && error instanceof ApiError && error.status === 401) handleLogout();
          else if (!isCancelled) setGlobalError("No se pudo renovar la conexión. Volveremos a intentarlo automáticamente.");
          return;
        }
      }

      if (!isCancelled) {
        void loadWorkspaces(sessionForRequest);
      }
    }

    void bootstrapSession();

    return () => {
      isCancelled = true;
    };
  }, [session?.tokens.accessToken, session?.tokens.refreshToken, session?.tokens.expiresAt, queryClient]);

  useEffect(() => {
    if (!session || shouldRefreshSessionAccessToken(session)) {
      return undefined;
    }

    const refreshLeadMs = Math.min(60_000, Math.max(10_000, session.tokens.expiresIn * 1000 * 0.2));
    const refreshDelayMs = Math.max(1_000, getSessionAccessTokenExpiresAt(session) - Date.now() - refreshLeadMs);
    let isCancelled = false;

    const refreshTimer = window.setTimeout(() => {
      void refreshSharedSession(session)
        .then((refreshedSession) => {
          if (isCancelled) {
            return;
          }

          setSession(refreshedSession);
          void queryClient.invalidateQueries();
        })
        .catch((error) => {
          if (!isCancelled && error instanceof ApiError && error.status === 401) handleLogout();
          else if (!isCancelled) setGlobalError("No se pudo renovar la conexión. Volveremos a intentarlo automáticamente.");
        });
    }, refreshDelayMs);

    return () => {
      isCancelled = true;
      window.clearTimeout(refreshTimer);
    };
  }, [session?.tokens.accessToken, session?.tokens.expiresIn, session?.tokens.refreshToken, queryClient]);

  useEffect(() => {
    if (!session) return;
    let cancelled = false;
    const recover = () => {
      if (!shouldRefreshSessionAccessToken(session)) return;
      void refreshSharedSession(session).then(next => { if (!cancelled) { setSession(next); setGlobalError(""); } }).catch(() => undefined);
    };
    window.addEventListener("online", recover);
    const timer = window.setInterval(recover, 15000);
    return () => { cancelled = true; window.clearInterval(timer); window.removeEventListener("online", recover); };
  }, [session?.tokens.refreshToken, session?.tokens.expiresAt]);

  useEffect(() => {
    if (workspacesQuery.data) {
      applyWorkspaces(workspacesQuery.data.workspaces);
    }
  }, [workspacesQuery.data, workspacesQuery.dataUpdatedAt]);

  useEffect(() => {
    if (workspacesQuery.error) {
      setGlobalError(workspacesQuery.error instanceof Error ? workspacesQuery.error.message : "No se pudieron cargar workspaces.");
    }
  }, [workspacesQuery.error]);

  useEffect(() => {
    function handleExpiredSession(event: Event) {
      const detail = event instanceof CustomEvent
        ? event.detail as AuthSessionExpiredDetail | undefined
        : undefined;
      const message = detail?.code === "REFRESH_REUSED"
        ? "Tu sesion se cerro por seguridad. Detectamos reutilizacion del token."
        : "Tu sesion expiro o ya no es valida. Inicia sesion otra vez.";

      setGlobalError(message);
      handleLogout();
    }

    window.addEventListener(authSessionExpiredEventName, handleExpiredSession);

    return () => {
      window.removeEventListener(authSessionExpiredEventName, handleExpiredSession);
    };
  }, [session?.tokens.refreshToken]);

  useEffect(() => {
    if (token && workspaceId) {
      void projectBoard.actions.loadProjects({ silent: true });
      void people.actions.loadWorkspaceCatalog({ silent: true });
    }
  }, [token, workspaceId, permissions.canLoadManagementData]);

  useEffect(() => {
    if (currentView === "board" && token && workspaceId && projectBoard.activeProjectId) {
      void projectBoard.actions.loadProjectContext(projectBoard.activeProjectId, { silent: true });
    }
  }, [currentView, token, workspaceId, projectBoard.activeProjectId]);

  useEffect(() => {
    if (currentView === "members") {
      void people.actions.loadMembers({ silent: true });
    }

    if (currentView === "management") {
      void management.actions.loadManagement({ silent: true });
      void people.actions.loadMembers({ silent: true });
    }

    if (currentView === "reports") {
      void reports.actions.loadReports({ silent: true });
    }


  }, [
    currentView,
    token,
    workspaceId,
    reports.reportPeriod,
    management.staffingPages.PENDING,
    management.staffingPages.APPROVED,
    management.staffingPages.REJECTED
  ]);

  function handleAuthenticated(nextSession: AuthSession) {
    if (session?.user.id !== nextSession.user.id) { queryClient.clear(); clearWorkspaceSelection(); }
    const storedSession = storeSession(nextSession);
    setSession(storedSession);
    const pending = sessionStorage.getItem("vianko-pending-link");
    navigate(pending?.startsWith("/") && !pending.startsWith("//") ? pending : "/work", { replace: true });
  }

  function resetWorkspaceState() {
    projectBoard.actions.resetProjectBoardState();
    people.actions.resetPeopleState();
    management.actions.resetManagementState();
    reports.actions.resetReportsState();
  }

  function handleWorkspaceSelect(workspace: WorkspaceListItem) {
    if (workspace.id !== workspaceId) resetWorkspaceState();
    void queryClient.invalidateQueries({ queryKey: queryKeys.projects(workspace.id) });
    setSelectedWorkspace(workspace);
    storeWorkspace(workspace);
    const pending = sessionStorage.getItem("vianko-pending-link");
    navigate(pending?.startsWith("/") && !pending.startsWith("//") ? pending : "/work");
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

  async function handleArchiveProject(projectId: string) {
    await projectBoard.actions.handleArchiveProject(projectId);
    navigate("/projects");
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
    if ("serviceWorker" in navigator && token) void navigator.serviceWorker.getRegistration().then(async (registration) => {
      const subscription = await registration?.pushManager.getSubscription();
      if (subscription) { await apiRequest("/push/subscriptions", { token, method: "DELETE", body: { endpoint: subscription.endpoint } }); await subscription.unsubscribe(); }
    }).catch(() => undefined);
    queryClient.clear();
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

  useEffect(() => {
    if (!session && location.search && !["/login", "/workspaces"].includes(location.pathname)) sessionStorage.setItem("vianko-pending-link", location.pathname + location.search);
    if (!token || !workspaces.length || !location.search) return;
    const query = new URLSearchParams(location.search);
    const requestedWorkspace = workspaces.find((workspace) => workspace.id === query.get("workspace"));
    if (requestedWorkspace && requestedWorkspace.id !== workspaceId) { resetWorkspaceState(); setSelectedWorkspace(requestedWorkspace); storeWorkspace(requestedWorkspace); return; }
    if (query.get("workspace") && !requestedWorkspace) { setGlobalError("Ya no tienes acceso a la empresa de este aviso."); return; }
    if (deepLinkRef.current === location.key) return;
    deepLinkRef.current = location.key;
    const projectId = query.get("project"); const taskId = query.get("task");
    if (query.has("chat")) projectBoard.actions.setSelectedTaskId(undefined);
    if (projectId && taskId) projectBoard.actions.handleOpenArchivedTask(projectId, taskId);
    else if (projectId) projectBoard.actions.setActiveProjectId(projectId);
    sessionStorage.removeItem("vianko-pending-link");
  }, [location.key, location.search, token, workspaceId, workspaces]);

  useEffect(() => {
    const handler = (event: MessageEvent) => {
      const target = event.data?.navigate;
      if (typeof target === "string" && target.startsWith("/") && !target.startsWith("//")) navigate(target);
    };
    navigator.serviceWorker?.addEventListener("message", handler);
    return () => navigator.serviceWorker?.removeEventListener("message", handler);
  }, [navigate]);

  function openNotification(item: InboxItem) {
    void inbox.markRead([item.id]).catch(() => setGlobalError("Se abrió el aviso, pero no se pudo marcar como leído."));
    navigate(item.url);
  }

  const realtime = useRealtimeSync({
    token,
    workspaceId,
    activeProjectId: projectBoard.activeProjectId,
    selectedTaskId: projectBoard.selectedTaskId,
    canLoadManagementData: permissions.canLoadManagementData,
    refresh: {
      notifications: () => { void inbox.refresh(); void queryClient.invalidateQueries({queryKey:['project-chat']}); void queryClient.invalidateQueries({queryKey:['chat-messages']}); void queryClient.invalidateQueries({ queryKey: ['task-people'] }); void queryClient.invalidateQueries({ queryKey: ['quick-project'] }); void queryClient.invalidateQueries({ queryKey: ['work-items', workspaceId] }); void queryClient.invalidateQueries({ queryKey: ['role-catalog', workspaceId] }); void queryClient.invalidateQueries({ queryKey: ['invitations', workspaceId] }); },
      workspaces: () => void loadWorkspaces(),
      projects: (options) => void projectBoard.actions.loadProjects(options),
      catalog: (options) => { void people.actions.loadWorkspaceCatalog(options); void queryClient.invalidateQueries({ queryKey: ['role-catalog', workspaceId] }); void queryClient.invalidateQueries({ queryKey: ['invitations', workspaceId] }); },
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
      completedArchive: () => { void queryClient.invalidateQueries({ queryKey: ['work-items', workspaceId] }); },
      projectContext: (projectId, options) => void projectBoard.actions.loadProjectContext(projectId, options),
      taskDetail: (taskId, options) => void projectBoard.actions.loadSelectedTaskDetail(taskId, options)
    },
    onEvent: (event) => { pushRealtimeNotification(event); void inbox.refresh(); if(event.type.startsWith('chat.')) { void queryClient.invalidateQueries({queryKey:['project-chat',event.projectId]}); void queryClient.invalidateQueries({queryKey:['chat-messages',event.chatId]}); } if (/^(workspace\.|project\.|staffing\.|task\.(created|assigned|unassigned))/.test(event.type)) { void queryClient.invalidateQueries({queryKey:['task-people']}); void queryClient.invalidateQueries({queryKey:['quick-project']}); } },
    onError: (error) => {
      if (error.code === "RATE_LIMITED") {
        setGlobalError("Tiempo real desactivado por demasiados cambios de sala. Recarga la vista para reconectar.");
        return;
      }

      if (error.code === "AUTH_INVALID") {
        setGlobalError("Tu sesion de tiempo real ya no es valida. Inicia sesion otra vez.");
        handleLogout();
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
    boards: projectBoard.boards,
    completedArchive: projectBoard.completedArchive,
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
    staffingCatalog: management.catalog,
    staffingRequests: management.staffingRequests,
    staffingPagination: management.staffingPagination,
    staffingPages: management.staffingPages,
    staffingPageSize: management.staffingPageSize,
    summary: reports.summary,
    reportPeriod: reports.reportPeriod,
    currentView,
    boardMode: projectBoard.boardMode,
    isLoadingWorkspaces: workspacesQuery.isFetching,
    isLoadingProjects: projectBoard.isLoadingProjects,
    isLoadingBoard: projectBoard.isLoadingBoard,
    isLoadingCompletedArchive: projectBoard.isLoadingCompletedArchive,
    isLoadingDetail: projectBoard.isLoadingDetail,
    isLoadingMembers: people.isLoadingMembers,
    isLoadingManagement: management.isLoadingManagement,
    isLoadingReports: reports.isLoadingReports,
    globalError,
    notifications,
    inbox,
    connectionState: realtime.connectionState,
    notificationPermission,
    canCreateWorkspace: canCreateWorkspaceFromMemberships(workspaces),
    permissions,
    actions: {
      setCurrentView: (view: ViewKey) => navigate(viewToPath(view)),
      setActiveProjectId: projectBoard.actions.setActiveProjectId,
      setBoardMode: projectBoard.actions.setBoardMode,
      setActiveBoardId: projectBoard.actions.setActiveBoardId,
      setSelectedTaskId: projectBoard.actions.setSelectedTaskId,
      loadWorkspaces,
      loadWorkspaceCatalog: people.actions.loadWorkspaceCatalog,
      loadProjects: projectBoard.actions.loadProjects,
      loadProjectContext: projectBoard.actions.loadProjectContext,
      loadSelectedTaskDetail: projectBoard.actions.loadSelectedTaskDetail,
      loadCompletedArchive: projectBoard.actions.loadCompletedArchive,
      loadMembers: people.actions.loadMembers,
      loadManagement: management.actions.loadManagement,
      loadReports: reports.actions.loadReports,
      setReportPeriod: reports.actions.setReportPeriod,
      dismissNotification,
      openNotification,
      openNotificationUrl: (url: string) => navigate(url),
      handleEnableBrowserNotifications: requestBrowserNotifications,
      handleAuthenticated,
      handleWorkspaceSelect,
      handleCreateWorkspace,
      handleCreateProject,
      handleUpdateProject,
      handleArchiveProject,
      handleCreateTask: projectBoard.actions.handleCreateTask,
      handleCreateSubtask: projectBoard.actions.handleCreateSubtask,
      handleAddProjectMember: projectBoard.actions.handleAddProjectMember,
      handleAddTaskAssignee: projectBoard.actions.handleAddTaskAssignee,
      handleMentionTaskUser: projectBoard.actions.handleMentionTaskUser,
      handleTaskStatusChange: projectBoard.actions.handleTaskStatusChange,
      handleOpenArchivedTask: projectBoard.actions.handleOpenArchivedTask,
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
      setStaffingStatusPage: management.actions.setStaffingStatusPage,
      handleChangeWorkspace,
      handleLogout,
      handleGoToLogin
    }
  };
}

export type AppController = ReturnType<typeof useAppController>;
