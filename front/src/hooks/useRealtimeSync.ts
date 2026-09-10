import { useEffect, useRef, useState } from "react";
import { connectRealtime, type RealtimeClientError, type RealtimeEvent, type RealtimeSocket } from "../realtime/socket";

type SilentLoadOptions = {
  silent?: boolean;
};

type RealtimeRefreshPlan = {
  workspaces: boolean;
  projects: boolean;
  catalog: boolean;
  members: boolean;
  management: boolean;
  reports: boolean;
  completedArchive: boolean;
  projectId?: string;
  taskId?: string;
};

type RealtimeRefreshHandlers = {
  notifications: () => void;
  workspaces: () => void;
  projects: (options?: SilentLoadOptions) => void;
  catalog: (options?: SilentLoadOptions) => void;
  members: (options?: SilentLoadOptions) => void;
  management: (options?: SilentLoadOptions) => void;
  reports: (options?: SilentLoadOptions) => void;
  completedArchive: (options?: SilentLoadOptions) => void;
  projectContext: (projectId: string, options?: SilentLoadOptions) => void;
  taskDetail: (taskId: string, options?: SilentLoadOptions) => void;
};

type RealtimeSyncOptions = {
  token?: string;
  workspaceId?: string;
  activeProjectId?: string;
  selectedTaskId?: string;
  canLoadManagementData: boolean;
  refresh: RealtimeRefreshHandlers;
  onEvent: (event: RealtimeEvent) => void;
  onError: (error: RealtimeClientError) => void;
};

function emptyRealtimeRefreshPlan(): RealtimeRefreshPlan {
  return {
    workspaces: false,
    projects: false,
    catalog: false,
    members: false,
    management: false,
    reports: false,
    completedArchive: false
  };
}

export function useRealtimeSync(options: RealtimeSyncOptions) {
  const [connectionState, setConnectionState] = useState<"connecting" | "live" | "reconnecting">("connecting");
  const socketRef = useRef<RealtimeSocket>();
  const joinedWorkspaceIdRef = useRef<string>();
  const joinedProjectIdRef = useRef<string>();
  const joinedTaskIdRef = useRef<string>();
  const realtimeRefreshTimerRef = useRef<number>();
  const pendingRealtimeRefreshRef = useRef<RealtimeRefreshPlan>(emptyRealtimeRefreshPlan());
  const activeProjectIdRef = useRef<string>();
  const selectedTaskIdRef = useRef<string>();
  const latestOptionsRef = useRef(options);

  latestOptionsRef.current = options;

  function mergeRealtimeRefreshPlan(nextPlan: Partial<RealtimeRefreshPlan>) {
    const currentPlan = pendingRealtimeRefreshRef.current;
    pendingRealtimeRefreshRef.current = {
      workspaces: currentPlan.workspaces || nextPlan.workspaces === true,
      projects: currentPlan.projects || nextPlan.projects === true,
      catalog: currentPlan.catalog || nextPlan.catalog === true,
      members: currentPlan.members || nextPlan.members === true,
      management: currentPlan.management || nextPlan.management === true,
      reports: currentPlan.reports || nextPlan.reports === true,
      completedArchive: currentPlan.completedArchive || nextPlan.completedArchive === true,
      projectId: nextPlan.projectId ?? currentPlan.projectId,
      taskId: nextPlan.taskId ?? currentPlan.taskId
    };
  }

  function flushRealtimeRefresh() {
    const plan = pendingRealtimeRefreshRef.current;
    const { refresh } = latestOptionsRef.current;
    pendingRealtimeRefreshRef.current = emptyRealtimeRefreshPlan();
    realtimeRefreshTimerRef.current = undefined;

    if (plan.workspaces) {
      refresh.workspaces();
    }

    if (plan.projects) {
      refresh.projects({ silent: true });
    }

    if (plan.catalog) {
      refresh.catalog({ silent: true });
    }

    if (plan.members) {
      refresh.members({ silent: true });
    }

    if (plan.management) {
      refresh.management({ silent: true });
    }

    if (plan.reports) {
      refresh.reports({ silent: true });
    }

    if (plan.completedArchive) {
      refresh.completedArchive({ silent: true });
    }

    if (plan.projectId) {
      refresh.projectContext(plan.projectId, { silent: true });
    }

    if (plan.taskId) {
      refresh.taskDetail(plan.taskId, { silent: true });
    }
  }

  function queueRealtimeRefresh(event: RealtimeEvent) {
    if (event.type === "notification.read" || event.type.startsWith("chat.")) return;
    const { canLoadManagementData } = latestOptionsRef.current;
    const workspaceEvent = event.type.startsWith("workspace.");
    const projectEvent = event.type.startsWith("project.");
    const staffingEvent = event.type.startsWith("staffing.");

    mergeRealtimeRefreshPlan({
      workspaces: workspaceEvent,
      projects: workspaceEvent || projectEvent,
      catalog: workspaceEvent,
      members: canLoadManagementData && (workspaceEvent || projectEvent),
      management: canLoadManagementData && staffingEvent,
      reports: true,
      completedArchive: true,
      projectId: workspaceEvent || event.projectId === activeProjectIdRef.current ? activeProjectIdRef.current : undefined,
      taskId: workspaceEvent || event.taskId === selectedTaskIdRef.current ? selectedTaskIdRef.current : undefined
    });

    if (!realtimeRefreshTimerRef.current) realtimeRefreshTimerRef.current = window.setTimeout(flushRealtimeRefresh, 160);
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
    activeProjectIdRef.current = options.activeProjectId;
    selectedTaskIdRef.current = options.selectedTaskId;
  }, [options.activeProjectId, options.selectedTaskId]);

  useEffect(() => {
    if (!options.token || !options.workspaceId) {
      return undefined;
    }

    setConnectionState("connecting");
    const socket = connectRealtime(options.token);
    socketRef.current = socket;

    socket.on("disconnect", () => setConnectionState("reconnecting"));
    socket.on("connect", () => {
      setConnectionState("live");
      latestOptionsRef.current.refresh.notifications();
      latestOptionsRef.current.refresh.projects({ silent: true });
      if (activeProjectIdRef.current) latestOptionsRef.current.refresh.projectContext(activeProjectIdRef.current, { silent: true });
      if (selectedTaskIdRef.current) latestOptionsRef.current.refresh.taskDetail(selectedTaskIdRef.current, { silent: true });
      const currentOptions = latestOptionsRef.current;
      if (!currentOptions.workspaceId) {
        return;
      }

      joinWorkspaceRealtime(socket, currentOptions.workspaceId);

      if (activeProjectIdRef.current) {
        joinProjectRealtime(socket, activeProjectIdRef.current);
      }

      if (selectedTaskIdRef.current) {
        joinTaskRealtime(socket, selectedTaskIdRef.current);
      }
    });

    const seenEventIds = new Set<string>();
    socket.on("realtime:event", (event) => {
      if (seenEventIds.has(event.id)) return;
      seenEventIds.add(event.id);
      if (seenEventIds.size > 400) seenEventIds.delete(seenEventIds.values().next().value!);
      latestOptionsRef.current.onEvent(event);
      queueRealtimeRefresh(event);
    });
    socket.on("realtime:error", (error) => latestOptionsRef.current.onError(error));
    socket.on("connect_error", (error) => {
      setConnectionState("reconnecting");
      if (error.message === "AUTH_INVALID") {
        latestOptionsRef.current.onError({
          code: "AUTH_INVALID",
          message: "Sesion de tiempo real invalida.",
          createdAt: new Date().toISOString()
        });
      }
    });

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
      socket.disconnect();
      if (realtimeRefreshTimerRef.current) {
        window.clearTimeout(realtimeRefreshTimerRef.current);
      }
      socketRef.current = undefined;
      realtimeRefreshTimerRef.current = undefined;
      pendingRealtimeRefreshRef.current = emptyRealtimeRefreshPlan();
      joinedWorkspaceIdRef.current = undefined;
      joinedProjectIdRef.current = undefined;
      joinedTaskIdRef.current = undefined;
    };
  }, [options.token, options.workspaceId]);

  useEffect(() => {
    if (options.activeProjectId && socketRef.current?.connected) {
      joinProjectRealtime(socketRef.current, options.activeProjectId);
    } else if (!options.activeProjectId && socketRef.current?.connected && joinedProjectIdRef.current) {
      socketRef.current.emit("project:leave", { projectId: joinedProjectIdRef.current });
      joinedProjectIdRef.current = undefined;
      joinedTaskIdRef.current = undefined;
    }
  }, [options.activeProjectId]);

  useEffect(() => {
    if (options.selectedTaskId && socketRef.current?.connected) {
      joinTaskRealtime(socketRef.current, options.selectedTaskId);
    } else if (!options.selectedTaskId && socketRef.current?.connected && joinedTaskIdRef.current) {
      socketRef.current.emit("task:leave", { taskId: joinedTaskIdRef.current });
      joinedTaskIdRef.current = undefined;
    }
  }, [options.selectedTaskId]);
  return { connectionState };
}
