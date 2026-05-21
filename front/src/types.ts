export type ViewKey = "projects" | "board" | "management" | "members" | "reports";
export type AuthMode = "login" | "request" | "register";
export type BoardMode = "kanban" | "list";

export type TaskPriority = "LOW" | "MEDIUM" | "HIGH" | "URGENT";
export type StatusCategory = "TODO" | "IN_PROGRESS" | "BLOCKED" | "REVIEW" | "DONE" | "CANCELLED";
export type UserType = "INTERNAL" | "EXTERNAL";
export type MemberStatus = "INVITED" | "PENDING_APPROVAL" | "ACTIVE" | "SUSPENDED" | "REMOVED";
export type ProjectVisibility = "WORKSPACE" | "PRIVATE";
export type StaffingRequestStatus = "PENDING" | "APPROVED" | "REJECTED" | "CANCELLED";

export type AuthUser = {
  id: string;
  name: string;
  email: string;
  avatarUrl?: string;
};

export type AuthTokens = {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
};

export type AuthSession = {
  user: AuthUser;
  tokens: AuthTokens;
};

export type Role = {
  id: string;
  workspaceId: string;
  name: string;
  description?: string;
  isSystem: boolean;
};

export type Area = {
  id: string;
  workspaceId: string;
  name: string;
  description?: string;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
};

export type Locality = {
  id: string;
  workspaceId: string;
  areaId?: string;
  name: string;
  code: string;
  description?: string;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
  area?: Area;
};

export type LocalityScope = {
  id: string;
  localityId: string;
  createdAt: string;
  locality: Locality;
};

export type Position = {
  id: string;
  workspaceId: string;
  areaId?: string;
  name: string;
  description?: string;
  isManager: boolean;
  createdAt: string;
  updatedAt: string;
  area?: Area;
};

export type Workspace = {
  id: string;
  name: string;
  slug: string;
  logoUrl?: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export type WorkspaceListItem = Workspace & {
  member: {
    userType: UserType;
    status: MemberStatus;
    role?: Role;
    area?: Area;
    locality?: Locality;
    localityScopes?: LocalityScope[];
    position?: Position;
  };
};

export type WorkspaceMember = {
  id: string;
  workspaceId: string;
  userId: string;
  roleId?: string;
  userType: UserType;
  status: MemberStatus;
  areaId?: string;
  localityId?: string;
  positionId?: string;
  approvedById?: string;
  approvedAt?: string;
  joinedAt?: string;
  createdAt: string;
  updatedAt: string;
  user: AuthUser & {
    isActive: boolean;
  };
  role?: Role;
  area?: Area;
  locality?: Locality;
  localityScopes?: LocalityScope[];
  position?: Position;
  approvedBy?: AuthUser;
};

export type ProjectMember = {
  id: string;
  projectId: string;
  userId: string;
  roleId?: string;
  createdAt: string;
  user: AuthUser;
  role?: Role;
};

export type Project = {
  id: string;
  workspaceId: string;
  areaId?: string;
  localityId?: string;
  name: string;
  description?: string;
  visibility: ProjectVisibility;
  color?: string;
  startDate?: string;
  endDate?: string;
  createdById?: string;
  createdAt: string;
  updatedAt: string;
  members?: ProjectMember[];
  boards?: Board[];
  area?: Area;
  locality?: Locality;
};

export type BoardStatus = {
  id: string;
  boardId: string;
  name: string;
  color?: string;
  position: number;
  category: StatusCategory;
  countsAsDone: boolean;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
};

export type Board = {
  id: string;
  workspaceId: string;
  projectId: string;
  name: string;
  description?: string;
  position: number;
  createdAt: string;
  updatedAt: string;
  statuses: BoardStatus[];
};

export type TaskAssignee = {
  id: string;
  taskId: string;
  userId: string;
  assignedById?: string;
  assignedAt: string;
  user: AuthUser;
};

export type TaskCounts = {
  comments: number;
  timeLogs: number;
  subtasks: number;
};

export type Task = {
  id: string;
  workspaceId: string;
  projectId: string;
  boardId: string;
  statusId: string;
  parentTaskId?: string;
  title: string;
  description?: string;
  priority: TaskPriority;
  startAt?: string;
  dueAt?: string;
  completedAt?: string;
  estimateMinutes?: number;
  progress: number;
  createdById?: string;
  createdAt: string;
  updatedAt: string;
  status?: BoardStatus;
  assignees?: TaskAssignee[];
  timeLogs?: TimeLog[];
  _count?: TaskCounts;
};

export type TaskComment = {
  id: string;
  taskId: string;
  userId: string;
  body: string;
  isInternal: boolean;
  createdAt: string;
  updatedAt: string;
  user: AuthUser;
};

export type TimeLog = {
  id: string;
  taskId: string;
  userId: string;
  minutes: number;
  note?: string;
  logDate: string;
  startedAt?: string;
  endedAt?: string;
  createdAt: string;
  updatedAt: string;
  user?: AuthUser;
};

export type ActivityEntityType =
  | "WORKSPACE"
  | "PROJECT"
  | "BOARD"
  | "TASK"
  | "COMMENT"
  | "TIME_LOG"
  | "USER"
  | "INVITATION"
  | "STAFFING_REQUEST";

export type ActivityEvent = {
  id: string;
  workspaceId: string;
  projectId?: string;
  taskId?: string;
  actorId?: string;
  actor?: AuthUser;
  entityType: ActivityEntityType;
  entityId: string;
  action: string;
  before?: unknown;
  after?: unknown;
  metadata?: unknown;
  createdAt: string;
};

export type Invitation = {
  id: string;
  workspaceId: string;
  email: string;
  roleId?: string;
  areaId?: string;
  localityId?: string;
  positionId?: string;
  invitedById?: string;
  userType: UserType;
  status: "PENDING" | "ACCEPTED" | "EXPIRED" | "REVOKED";
  expiresAt: string;
  projectId?: string;
  localityScopes?: LocalityScope[];
  createdAt: string;
};

export type RegistrationOptions = {
  workspace: Pick<Workspace, "id" | "name" | "slug">;
  areas: Area[];
  localities: Locality[];
  positions: Position[];
};

export type StaffingAssignment = {
  id: string;
  requestId: string;
  userId: string;
  assignedById: string;
  createdAt: string;
  user: AuthUser;
};

export type StaffingRequest = {
  id: string;
  workspaceId: string;
  projectId: string;
  requesterId: string;
  sourceAreaId?: string;
  targetAreaId: string;
  targetLocalityId?: string;
  positionId?: string;
  roleId?: string;
  requestedUserId?: string;
  quantity: number;
  note?: string;
  status: StaffingRequestStatus;
  respondedById?: string;
  respondedAt?: string;
  responseNote?: string;
  createdAt: string;
  updatedAt: string;
  project: Project;
  requester: AuthUser;
  responder?: AuthUser;
  sourceArea?: Area;
  targetArea: Area;
  targetLocality?: Locality;
  position?: Position;
  role?: Role;
  requestedUser?: AuthUser;
  assignments: StaffingAssignment[];
};

export type WorkspaceReportProject = {
  project_id: string;
  project_name: string;
  total_tasks: number;
  completed_tasks: number;
  blocked_tasks: number;
  overdue_tasks: number;
  estimate_minutes?: number;
  actual_minutes?: number;
  progress_percent?: number;
};

export type WorkspaceReportUser = {
  user_id: string;
  name: string;
  assigned_tasks: number;
  active_tasks: number;
  completed_tasks: number;
  total_minutes: number;
};

export type WorkspaceSummary = {
  projects: WorkspaceReportProject[];
  users: WorkspaceReportUser[];
};

export type ProjectProgress = WorkspaceReportProject & {
  estimate_minutes?: number;
  actual_minutes?: number;
};

export type ApiErrorBody = {
  error?: {
    code?: string;
    message?: string;
  };
};
