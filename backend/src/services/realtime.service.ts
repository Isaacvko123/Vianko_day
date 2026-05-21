import type http from "node:http";
import crypto from "node:crypto";
import { Server, type Socket } from "socket.io";
import { z } from "zod";
import { env } from "../config/env.js";
import { prisma } from "../db/prisma.js";
import { assertProjectAccess, assertTaskPermission, assertWorkspaceMember } from "./access-control.service.js";
import { verifyAccessToken } from "../utils/crypto.js";

const uuidPayload = z.string().uuid();
const joinWorkspaceSchema = z.object({ workspaceId: uuidPayload }).strict();
const joinProjectSchema = z.object({ projectId: uuidPayload }).strict();
const joinTaskSchema = z.object({ taskId: uuidPayload }).strict();
const realtimeJoinWindowMs = 10_000;
const realtimeJoinLimit = 60;

export type RealtimeEventType =
  | "socket.join_denied"
  | "workspace.user_invited"
  | "workspace.area_saved"
  | "workspace.locality_saved"
  | "workspace.position_saved"
  | "workspace.member_approved"
  | "workspace.member_updated"
  | "project.created"
  | "project.updated"
  | "project.member_added"
  | "board.created"
  | "board.status_created"
  | "task.created"
  | "task.updated"
  | "task.status_changed"
  | "task.completed"
  | "task.reopened"
  | "task.assigned"
  | "task.unassigned"
  | "task.mentioned"
  | "comment.created"
  | "time.logged"
  | "staffing.requested"
  | "staffing.approved"
  | "staffing.rejected";

type RealtimeRoomKind = "workspace" | "project" | "task";
type RealtimeAck =
  | { ok: true; room: string; kind: RealtimeRoomKind }
  | { ok: false; code: "PAYLOAD_INVALID" | "ACCESS_DENIED" | "RATE_LIMITED"; message: string };
type RealtimeAckCallback = (response: RealtimeAck) => void;

type ClientToServerEvents = {
  "workspace:join": (payload: { workspaceId: string }, ack?: RealtimeAckCallback) => void;
  "workspace:leave": (payload: { workspaceId: string }, ack?: RealtimeAckCallback) => void;
  "project:join": (payload: { projectId: string }, ack?: RealtimeAckCallback) => void;
  "project:leave": (payload: { projectId: string }, ack?: RealtimeAckCallback) => void;
  "task:join": (payload: { taskId: string }, ack?: RealtimeAckCallback) => void;
  "task:leave": (payload: { taskId: string }, ack?: RealtimeAckCallback) => void;
};

export type RealtimeEvent = {
  id: string;
  type: RealtimeEventType;
  workspaceId: string;
  projectId?: string;
  boardId?: string;
  taskId?: string;
  actorId?: string;
  title: string;
  message: string;
  createdAt: string;
};

export type RealtimeClientError = {
  code: "AUTH_INVALID" | "PAYLOAD_INVALID" | "ACCESS_DENIED" | "RATE_LIMITED";
  message: string;
  createdAt: string;
};

type ServerToClientEvents = {
  "realtime:event": (event: RealtimeEvent) => void;
  "realtime:error": (event: RealtimeClientError) => void;
};

type SocketData = {
  userId: string;
  joinedWorkspaceId?: string;
  joinedProjectId?: string;
  joinedTaskId?: string;
  joinWindowStartedAt?: number;
  joinEventsInWindow?: number;
};

let realtimeServer: Server<ClientToServerEvents, ServerToClientEvents, object, SocketData> | undefined;

function workspaceRoom(workspaceId: string) {
  return `workspace:${workspaceId}`;
}

function projectRoom(projectId: string) {
  return `project:${projectId}`;
}

function taskRoom(taskId: string) {
  return `task:${taskId}`;
}

function readSocketToken(socket: Socket<ClientToServerEvents, ServerToClientEvents, object, SocketData>) {
  const token = socket.handshake.auth.token;
  return typeof token === "string" ? token : "";
}

function toRealtimeEvent(event: Omit<RealtimeEvent, "id" | "createdAt">): RealtimeEvent {
  return {
    ...event,
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString()
  };
}

function toClientError(error: Omit<RealtimeClientError, "createdAt">): RealtimeClientError {
  return {
    ...error,
    createdAt: new Date().toISOString()
  };
}

function acknowledge(ack: RealtimeAckCallback | undefined, response: RealtimeAck) {
  if (ack) {
    ack(response);
  }
}

function emitSocketError(
  socket: Socket<ClientToServerEvents, ServerToClientEvents, object, SocketData>,
  error: Omit<RealtimeClientError, "createdAt">
) {
  socket.emit("realtime:error", toClientError(error));
}

function assertJoinBudget(socket: Socket<ClientToServerEvents, ServerToClientEvents, object, SocketData>, ack?: RealtimeAckCallback) {
  const now = Date.now();
  const windowStartedAt = socket.data.joinWindowStartedAt ?? now;
  const isFreshWindow = now - windowStartedAt > realtimeJoinWindowMs;

  socket.data.joinWindowStartedAt = isFreshWindow ? now : windowStartedAt;
  socket.data.joinEventsInWindow = isFreshWindow ? 1 : (socket.data.joinEventsInWindow ?? 0) + 1;

  if (socket.data.joinEventsInWindow <= realtimeJoinLimit) {
    return true;
  }

  const response: RealtimeAck = {
    ok: false,
    code: "RATE_LIMITED",
    message: "Too many realtime room changes."
  };
  acknowledge(ack, response);
  emitSocketError(socket, {
    code: "RATE_LIMITED",
    message: response.message
  });
  socket.disconnect(true);
  return false;
}

function joinWorkspace(socket: Socket<ClientToServerEvents, ServerToClientEvents, object, SocketData>, workspaceId: string) {
  if (socket.data.joinedWorkspaceId && socket.data.joinedWorkspaceId !== workspaceId) {
    leaveWorkspace(socket, socket.data.joinedWorkspaceId);
  }

  socket.join(workspaceRoom(workspaceId));
  socket.data.joinedWorkspaceId = workspaceId;
}

function leaveWorkspace(socket: Socket<ClientToServerEvents, ServerToClientEvents, object, SocketData>, workspaceId: string) {
  if (socket.data.joinedTaskId) {
    socket.leave(taskRoom(socket.data.joinedTaskId));
    socket.data.joinedTaskId = undefined;
  }

  if (socket.data.joinedProjectId) {
    socket.leave(projectRoom(socket.data.joinedProjectId));
    socket.data.joinedProjectId = undefined;
  }

  socket.leave(workspaceRoom(workspaceId));

  if (socket.data.joinedWorkspaceId === workspaceId) {
    socket.data.joinedWorkspaceId = undefined;
  }
}

function joinProject(socket: Socket<ClientToServerEvents, ServerToClientEvents, object, SocketData>, project: { id: string; workspaceId: string }) {
  joinWorkspace(socket, project.workspaceId);

  if (socket.data.joinedProjectId && socket.data.joinedProjectId !== project.id) {
    socket.leave(projectRoom(socket.data.joinedProjectId));
    socket.data.joinedProjectId = undefined;

    if (socket.data.joinedTaskId) {
      socket.leave(taskRoom(socket.data.joinedTaskId));
      socket.data.joinedTaskId = undefined;
    }
  }

  socket.join(projectRoom(project.id));
  socket.data.joinedProjectId = project.id;
}

function leaveProject(socket: Socket<ClientToServerEvents, ServerToClientEvents, object, SocketData>, projectId: string) {
  if (socket.data.joinedTaskId) {
    socket.leave(taskRoom(socket.data.joinedTaskId));
    socket.data.joinedTaskId = undefined;
  }

  socket.leave(projectRoom(projectId));

  if (socket.data.joinedProjectId === projectId) {
    socket.data.joinedProjectId = undefined;
  }
}

function joinTask(socket: Socket<ClientToServerEvents, ServerToClientEvents, object, SocketData>, task: { id: string; workspaceId: string; projectId: string }) {
  joinProject(socket, { id: task.projectId, workspaceId: task.workspaceId });

  if (socket.data.joinedTaskId && socket.data.joinedTaskId !== task.id) {
    socket.leave(taskRoom(socket.data.joinedTaskId));
    socket.data.joinedTaskId = undefined;
  }

  socket.join(taskRoom(task.id));
  socket.data.joinedTaskId = task.id;
}

function leaveTask(socket: Socket<ClientToServerEvents, ServerToClientEvents, object, SocketData>, taskId: string) {
  socket.leave(taskRoom(taskId));

  if (socket.data.joinedTaskId === taskId) {
    socket.data.joinedTaskId = undefined;
  }
}

export function initializeRealtime(server: http.Server) {
  realtimeServer = new Server<ClientToServerEvents, ServerToClientEvents, object, SocketData>(server, {
    cors: {
      origin: env.corsOrigins,
      credentials: true,
      methods: ["GET", "POST"]
    },
    transports: ["websocket"],
    allowUpgrades: false,
    pingInterval: 25_000,
    pingTimeout: 12_000,
    connectTimeout: 8_000,
    maxHttpBufferSize: 4_096
  });

  realtimeServer.use(async (socket, next) => {
    try {
      const payload = verifyAccessToken(readSocketToken(socket));
      const user = await prisma.user.findUnique({
        where: { id: payload.sub },
        select: { id: true, isActive: true }
      });

      if (!user?.isActive) {
        next(new Error("AUTH_INVALID"));
        return;
      }

      socket.data.userId = user.id;
      next();
    } catch {
      next(new Error("AUTH_INVALID"));
    }
  });

  realtimeServer.on("connection", (socket) => {
    socket.on("workspace:join", (payload, ack) => {
      if (!assertJoinBudget(socket, ack)) return;
      const parsedPayload = joinWorkspaceSchema.safeParse(payload);
      if (!parsedPayload.success) {
        acknowledge(ack, { ok: false, code: "PAYLOAD_INVALID", message: "Invalid workspace join payload." });
        return;
      }

      const { workspaceId } = parsedPayload.data;
      void assertWorkspaceMember(socket.data.userId, workspaceId)
        .then(() => {
          joinWorkspace(socket, workspaceId);
          acknowledge(ack, { ok: true, room: workspaceRoom(workspaceId), kind: "workspace" });
        })
        .catch(() => {
          acknowledge(ack, { ok: false, code: "ACCESS_DENIED", message: "Workspace realtime access denied." });
          emitSocketError(socket, { code: "ACCESS_DENIED", message: "No realtime access to this workspace." });
        });
    });

    socket.on("workspace:leave", (payload, ack) => {
      if (!assertJoinBudget(socket, ack)) return;
      const parsedPayload = joinWorkspaceSchema.safeParse(payload);
      if (!parsedPayload.success) {
        acknowledge(ack, { ok: false, code: "PAYLOAD_INVALID", message: "Invalid workspace leave payload." });
        return;
      }

      leaveWorkspace(socket, parsedPayload.data.workspaceId);
      acknowledge(ack, { ok: true, room: workspaceRoom(parsedPayload.data.workspaceId), kind: "workspace" });
    });

    socket.on("project:join", (payload, ack) => {
      if (!assertJoinBudget(socket, ack)) return;
      const parsedPayload = joinProjectSchema.safeParse(payload);
      if (!parsedPayload.success) {
        acknowledge(ack, { ok: false, code: "PAYLOAD_INVALID", message: "Invalid project join payload." });
        return;
      }

      void assertProjectAccess(socket.data.userId, parsedPayload.data.projectId)
        .then(({ project }) => {
          joinProject(socket, project);
          acknowledge(ack, { ok: true, room: projectRoom(project.id), kind: "project" });
        })
        .catch(() => {
          acknowledge(ack, { ok: false, code: "ACCESS_DENIED", message: "Project realtime access denied." });
          emitSocketError(socket, { code: "ACCESS_DENIED", message: "No realtime access to this project." });
        });
    });

    socket.on("project:leave", (payload, ack) => {
      if (!assertJoinBudget(socket, ack)) return;
      const parsedPayload = joinProjectSchema.safeParse(payload);
      if (!parsedPayload.success) {
        acknowledge(ack, { ok: false, code: "PAYLOAD_INVALID", message: "Invalid project leave payload." });
        return;
      }

      leaveProject(socket, parsedPayload.data.projectId);
      acknowledge(ack, { ok: true, room: projectRoom(parsedPayload.data.projectId), kind: "project" });
    });

    socket.on("task:join", (payload, ack) => {
      if (!assertJoinBudget(socket, ack)) return;
      const parsedPayload = joinTaskSchema.safeParse(payload);
      if (!parsedPayload.success) {
        acknowledge(ack, { ok: false, code: "PAYLOAD_INVALID", message: "Invalid task join payload." });
        return;
      }

      void assertTaskPermission(socket.data.userId, parsedPayload.data.taskId, "task.view_all")
        .then(({ task }) => {
          joinTask(socket, task);
          acknowledge(ack, { ok: true, room: taskRoom(task.id), kind: "task" });
        })
        .catch(() => {
          acknowledge(ack, { ok: false, code: "ACCESS_DENIED", message: "Task realtime access denied." });
          emitSocketError(socket, { code: "ACCESS_DENIED", message: "No realtime access to this task." });
        });
    });

    socket.on("task:leave", (payload, ack) => {
      if (!assertJoinBudget(socket, ack)) return;
      const parsedPayload = joinTaskSchema.safeParse(payload);
      if (!parsedPayload.success) {
        acknowledge(ack, { ok: false, code: "PAYLOAD_INVALID", message: "Invalid task leave payload." });
        return;
      }

      leaveTask(socket, parsedPayload.data.taskId);
      acknowledge(ack, { ok: true, room: taskRoom(parsedPayload.data.taskId), kind: "task" });
    });
  });
}

export function emitRealtimeEvent(event: Omit<RealtimeEvent, "id" | "createdAt">) {
  if (!realtimeServer) {
    return;
  }

  const realtimeEvent = toRealtimeEvent(event);
  let target = realtimeServer.to(workspaceRoom(event.workspaceId));

  if (event.projectId) {
    target = target.to(projectRoom(event.projectId));
  }

  if (event.taskId) {
    target = target.to(taskRoom(event.taskId));
  }

  target.emit("realtime:event", realtimeEvent);
}
