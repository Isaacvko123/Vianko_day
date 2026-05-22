type ManagementPagesKey = Record<string, number>;

export const queryKeys = {
  workspaces: (userId?: string) => ["workspaces", userId ?? "anonymous"] as const,
  projects: (workspaceId?: string) => ["workspace", workspaceId ?? "none", "projects"] as const,
  catalog: (workspaceId?: string) => ["workspace", workspaceId ?? "none", "catalog"] as const,
  members: (workspaceId?: string) => ["workspace", workspaceId ?? "none", "members"] as const,
  management: (workspaceId?: string, pages?: ManagementPagesKey) => (
    pages
      ? ["workspace", workspaceId ?? "none", "management", pages] as const
      : ["workspace", workspaceId ?? "none", "management"] as const
  ),
  reports: (workspaceId?: string, period?: string) => (
    period
      ? ["workspace", workspaceId ?? "none", "reports", period] as const
      : ["workspace", workspaceId ?? "none", "reports"] as const
  ),
  completedArchive: (workspaceId?: string) => ["workspace", workspaceId ?? "none", "completed-archive"] as const,
  projectContext: (projectId?: string) => (
    projectId ? ["project", projectId, "context"] as const : ["project"] as const
  ),
  taskDetail: (taskId?: string) => (
    taskId ? ["task", taskId, "detail"] as const : ["task"] as const
  )
};
