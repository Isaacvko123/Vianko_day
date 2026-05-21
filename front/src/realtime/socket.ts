import { io, type Socket } from "socket.io-client";
import { apiBaseUrl } from "../api/http";

export type RealtimeRoomKind = "workspace" | "project" | "task";
export type RealtimeAck =
  | { ok: true; room: string; kind: RealtimeRoomKind }
  | { ok: false; code: "PAYLOAD_INVALID" | "ACCESS_DENIED" | "RATE_LIMITED"; message: string };
export type RealtimeAckCallback = (response: RealtimeAck) => void;

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
  type: string;
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

export type RealtimeSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

function getRealtimeUrl() {
  if (apiBaseUrl.startsWith("/")) {
    return window.location.origin;
  }

  const apiUrl = new URL(apiBaseUrl);
  return apiUrl.origin;
}

export function connectRealtime(token: string): RealtimeSocket {
  return io(getRealtimeUrl(), {
    auth: { token },
    transports: ["websocket"],
    reconnection: true,
    reconnectionAttempts: 5,
    reconnectionDelay: 800,
    timeout: 8_000
  });
}
