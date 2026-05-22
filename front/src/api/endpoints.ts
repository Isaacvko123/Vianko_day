import { apiRequest } from "./http";
import type {
  Area,
  AuthSession,
  AuthTokens,
  Board,
  BoardStatus,
  Invitation,
  Locality,
  Position,
  Project,
  ProjectMember,
  ProjectProgress,
  PaginationMeta,
  RegistrationOptions,
  RegistrationWorkspace,
  ReportPeriodKey,
  Role,
  StaffingRequest,
  StaffingRequestStatus,
  Task,
  TaskAssignee,
  ActivityEvent,
  TaskComment,
  TaskMention,
  TimeLog,
  UserType,
  WorkspaceListItem,
  WorkspaceMember,
  WorkspaceSummary
} from "../types";

export type LoginInput = {
  email: string;
  password: string;
};

export type CreateProjectInput = {
  workspaceId: string;
  areaId?: string;
  localityId?: string;
  name: string;
  description?: string;
  visibility: "WORKSPACE" | "PRIVATE";
  color?: string;
  startDate?: string;
  endDate?: string;
};

export type CreateWorkspaceInput = {
  name: string;
  defaultAreaName?: string;
  defaultLocalityName?: string;
  defaultLocalityCode?: string;
};

export type UpdateProjectInput = Partial<Omit<CreateProjectInput, "workspaceId">>;

export type CreateTaskInput = {
  boardId: string;
  statusId?: string;
  parentTaskId?: string;
  title: string;
  description?: string;
  priority: "LOW" | "MEDIUM" | "HIGH" | "URGENT";
  startAt?: string;
  dueAt?: string;
  estimateMinutes?: number;
  assigneeIds: string[];
};

export type UpdateTaskInput = {
  startAt?: string;
  dueAt?: string;
  estimateMinutes?: number;
};

export type InviteUserInput = {
  workspaceId: string;
  email: string;
  roleId?: string;
  areaId?: string;
  localityId?: string;
  localityIds?: string[];
  positionId?: string;
  userType: UserType;
  projectId?: string;
  expiresInDays: number;
};

export type RequestAccessInput = {
  workspaceSlug: string;
  name: string;
  email: string;
  password: string;
  areaId: string;
  localityId: string;
  positionId: string;
  userType: UserType;
};

export type CreateAreaInput = {
  workspaceId: string;
  name: string;
  description?: string;
};

export type CreateLocalityInput = {
  workspaceId: string;
  areaId?: string;
  name: string;
  code: string;
  description?: string;
};

export type CreatePositionInput = {
  workspaceId: string;
  areaId?: string;
  name: string;
  description?: string;
  isManager: boolean;
};

export type ApproveMemberInput = {
  workspaceId: string;
  memberId: string;
  roleId?: string;
  areaId?: string;
  localityId?: string;
  localityIds?: string[];
  positionId?: string;
  userType?: UserType;
};

export type UpdateMemberInput = ApproveMemberInput;

export type CreateStaffingRequestInput = {
  projectId: string;
  targetAreaId: string;
  targetLocalityId?: string;
  positionId?: string;
  roleId?: string;
  requestedUserId?: string;
  quantity: number;
  note?: string;
};

export type ApproveStaffingRequestInput = {
  requestId: string;
  approvedUserIds: string[];
  responseNote?: string;
};

export type AddProjectMemberInput = {
  projectId: string;
  userId: string;
  roleId?: string;
};

export type TaskListView = "active" | "completed";

export type PaginationInput = {
  limit?: number;
  offset?: number;
};

export type RejectStaffingRequestInput = {
  requestId: string;
  responseNote?: string;
};

export function login(input: LoginInput) {
  return apiRequest<AuthSession>("/auth/login", {
    method: "POST",
    body: input
  });
}

export function listRegistrationWorkspaces() {
  return apiRequest<{ workspaces: RegistrationWorkspace[] }>("/auth/workspaces");
}

export function getRegistrationOptions(workspaceSlug: string) {
  return apiRequest<RegistrationOptions>(`/auth/registration-options?workspaceSlug=${encodeURIComponent(workspaceSlug)}`);
}

export function requestAccess(input: RequestAccessInput) {
  return apiRequest<{ status: string; memberId: string; workspace: RegistrationOptions["workspace"] }>("/auth/request-access", {
    method: "POST",
    body: input
  });
}

export function logout(refreshToken: string) {
  return apiRequest<void>("/auth/logout", {
    method: "POST",
    body: { refreshToken }
  });
}

export function listWorkspaces(token: string) {
  return apiRequest<{ workspaces: WorkspaceListItem[] }>("/workspaces", { token });
}

export function createWorkspace(token: string, input: CreateWorkspaceInput) {
  return apiRequest<{ workspace: WorkspaceListItem; project: Project; board: Board }>("/workspaces", {
    token,
    method: "POST",
    body: input
  });
}

export function listProjects(token: string, workspaceId: string) {
  return apiRequest<{ projects: Project[] }>(`/projects?workspaceId=${encodeURIComponent(workspaceId)}`, { token });
}

export function createProject(token: string, input: CreateProjectInput) {
  return apiRequest<{ project: Project; board: Board }>("/projects", {
    token,
    method: "POST",
    body: input
  });
}

export function listWorkspaceRoles(token: string, workspaceId: string) {
  return apiRequest<{ roles: Role[] }>(`/workspaces/${workspaceId}/roles`, { token });
}

export function listWorkspaceAreas(token: string, workspaceId: string) {
  return apiRequest<{ areas: Area[] }>(`/workspaces/${workspaceId}/areas`, { token });
}

export function createWorkspaceArea(token: string, input: CreateAreaInput) {
  const { workspaceId, ...body } = input;

  return apiRequest<{ area: Area }>(`/workspaces/${workspaceId}/areas`, {
    token,
    method: "POST",
    body
  });
}

export function listWorkspaceLocalities(token: string, workspaceId: string) {
  return apiRequest<{ localities: Locality[] }>(`/workspaces/${workspaceId}/localities`, { token });
}

export function createWorkspaceLocality(token: string, input: CreateLocalityInput) {
  const { workspaceId, ...body } = input;

  return apiRequest<{ locality: Locality }>(`/workspaces/${workspaceId}/localities`, {
    token,
    method: "POST",
    body
  });
}

export function listWorkspacePositions(token: string, workspaceId: string) {
  return apiRequest<{ positions: Position[] }>(`/workspaces/${workspaceId}/positions`, { token });
}

export function listStaffingRequests(token: string, workspaceId: string, options: {
  status?: StaffingRequestStatus;
} & PaginationInput = {}) {
  const statusQuery = options.status ? `&status=${encodeURIComponent(options.status)}` : "";
  const limitQuery = options.limit ? `&limit=${encodeURIComponent(options.limit)}` : "";
  const offsetQuery = options.offset ? `&offset=${encodeURIComponent(options.offset)}` : "";
  return apiRequest<{ staffingRequests: StaffingRequest[]; pagination: PaginationMeta }>(
    `/staffing-requests?workspaceId=${encodeURIComponent(workspaceId)}${statusQuery}${limitQuery}${offsetQuery}`,
    { token }
  );
}

export function createStaffingRequest(token: string, input: CreateStaffingRequestInput) {
  return apiRequest<{ staffingRequest: StaffingRequest }>("/staffing-requests", {
    token,
    method: "POST",
    body: input
  });
}

export function approveStaffingRequest(token: string, input: ApproveStaffingRequestInput) {
  const { requestId, ...body } = input;

  return apiRequest<{ staffingRequest: StaffingRequest }>(`/staffing-requests/${requestId}/approve`, {
    token,
    method: "PATCH",
    body
  });
}

export function rejectStaffingRequest(token: string, input: RejectStaffingRequestInput) {
  const { requestId, ...body } = input;

  return apiRequest<{ staffingRequest: StaffingRequest }>(`/staffing-requests/${requestId}/reject`, {
    token,
    method: "PATCH",
    body
  });
}

export function createWorkspacePosition(token: string, input: CreatePositionInput) {
  const { workspaceId, ...body } = input;

  return apiRequest<{ position: Position }>(`/workspaces/${workspaceId}/positions`, {
    token,
    method: "POST",
    body
  });
}

export function updateProject(token: string, projectId: string, input: UpdateProjectInput) {
  return apiRequest<{ project: Project }>(`/projects/${projectId}`, {
    token,
    method: "PATCH",
    body: input
  });
}

export function archiveProject(token: string, projectId: string) {
  return apiRequest<{ project: Project }>(`/projects/${projectId}`, {
    token,
    method: "DELETE"
  });
}

export function getProject(token: string, projectId: string) {
  return apiRequest<{ project: Project }>(`/projects/${projectId}`, { token });
}

export function addProjectMember(token: string, input: AddProjectMemberInput) {
  const { projectId, ...body } = input;

  return apiRequest<{ member: ProjectMember }>(`/projects/${projectId}/members`, {
    token,
    method: "POST",
    body
  });
}

export function listBoards(token: string, projectId: string) {
  return apiRequest<{ boards: Board[] }>(`/projects/${projectId}/boards`, { token });
}

export function createBoardStatus(token: string, boardId: string, body: Omit<BoardStatus, "id" | "boardId" | "createdAt" | "updatedAt">) {
  return apiRequest<{ status: BoardStatus }>(`/boards/${boardId}/statuses`, {
    token,
    method: "POST",
    body
  });
}

export function listTasks(token: string, boardId: string, view: TaskListView = "active") {
  return apiRequest<{ tasks: Task[] }>(`/boards/${boardId}/tasks?view=${encodeURIComponent(view)}`, { token });
}

export function listSubtasks(token: string, taskId: string) {
  return apiRequest<{ subtasks: Task[] }>(`/tasks/${taskId}/subtasks`, { token });
}

export function createTask(token: string, input: CreateTaskInput) {
  const { boardId, ...body } = input;

  return apiRequest<{ task: Task }>(`/boards/${boardId}/tasks`, {
    token,
    method: "POST",
    body
  });
}

export function changeTaskStatus(token: string, taskId: string, statusId: string) {
  return apiRequest<{ task: Task }>(`/tasks/${taskId}/status`, {
    token,
    method: "PATCH",
    body: { statusId }
  });
}

export function addTaskAssignee(token: string, taskId: string, userId: string) {
  return apiRequest<{ assignee: TaskAssignee }>(`/tasks/${taskId}/assignees`, {
    token,
    method: "POST",
    body: { userId }
  });
}

export function mentionTaskUser(token: string, taskId: string, userId: string) {
  return apiRequest<{ mention: TaskMention }>(`/tasks/${taskId}/mentions`, {
    token,
    method: "POST",
    body: { userId }
  });
}

export function updateTask(token: string, taskId: string, input: UpdateTaskInput) {
  return apiRequest<{ task: Task }>(`/tasks/${taskId}`, {
    token,
    method: "PATCH",
    body: input
  });
}

export function listComments(token: string, taskId: string) {
  return apiRequest<{ comments: TaskComment[] }>(`/tasks/${taskId}/comments`, { token });
}

export function createComment(token: string, taskId: string, body: string, isInternal: boolean) {
  return apiRequest<{ comment: TaskComment }>(`/tasks/${taskId}/comments`, {
    token,
    method: "POST",
    body: { body, isInternal }
  });
}

export function listTimeLogs(token: string, taskId: string) {
  return apiRequest<{ timeLogs: TimeLog[] }>(`/tasks/${taskId}/time-logs`, { token });
}

export function listTaskEvents(token: string, taskId: string) {
  return apiRequest<{ events: ActivityEvent[] }>(`/tasks/${taskId}/events`, { token });
}

export function createTimeLog(token: string, taskId: string, minutes: number, note?: string) {
  return apiRequest<{ timeLog: TimeLog }>(`/tasks/${taskId}/time-logs`, {
    token,
    method: "POST",
    body: { minutes, note }
  });
}

export function listWorkspaceMembers(token: string, workspaceId: string) {
  return apiRequest<{ members: WorkspaceMember[] }>(`/workspaces/${workspaceId}/members`, { token });
}

export function listPendingWorkspaceMembers(token: string, workspaceId: string) {
  return apiRequest<{ members: WorkspaceMember[] }>(`/workspaces/${workspaceId}/members/pending`, { token });
}

export function approveWorkspaceMember(token: string, input: ApproveMemberInput) {
  const { workspaceId, memberId, ...body } = input;

  return apiRequest<{ member: WorkspaceMember }>(`/workspaces/${workspaceId}/members/${memberId}/approve`, {
    token,
    method: "PATCH",
    body
  });
}

export function updateWorkspaceMember(token: string, input: UpdateMemberInput) {
  const { workspaceId, memberId, ...body } = input;

  return apiRequest<{ member: WorkspaceMember }>(`/workspaces/${workspaceId}/members/${memberId}`, {
    token,
    method: "PATCH",
    body
  });
}

export function inviteUser(token: string, input: InviteUserInput) {
  const { workspaceId, ...body } = input;

  return apiRequest<{ invitation: Invitation; inviteToken: string }>(`/workspaces/${workspaceId}/invitations`, {
    token,
    method: "POST",
    body
  });
}

export function getWorkspaceSummary(token: string, workspaceId: string, period: ReportPeriodKey = "month") {
  return apiRequest<WorkspaceSummary>(`/reports/workspace/${workspaceId}/summary?period=${encodeURIComponent(period)}`, { token });
}

export function getProjectProgress(token: string, projectId: string) {
  return apiRequest<{ summary: ProjectProgress }>(`/reports/project/${projectId}/progress`, { token });
}

export function refreshSession(refreshToken: string) {
  return apiRequest<{ tokens: AuthTokens }>("/auth/refresh", {
    method: "POST",
    body: { refreshToken }
  });
}
