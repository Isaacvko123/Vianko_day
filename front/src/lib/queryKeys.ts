export const queryKeys = {
  workspaces: (userId?: string) => ["workspaces", userId ?? "anonymous"] as const,
  projects: (workspaceId?: string) => ["workspace", workspaceId ?? "none", "projects"] as const,
  catalog: (workspaceId?: string) => ["workspace", workspaceId ?? "none", "catalog"] as const,
  members: (workspaceId?: string) => ["workspace", workspaceId ?? "none", "members"] as const,
  management: (workspaceId?: string, pages?: Record<string, number>) => ["workspace", workspaceId ?? "none", "management", pages ?? {}] as const,
  reports: (workspaceId?: string, period?: string) => ["workspace", workspaceId ?? "none", "reports", period ?? "month"] as const,
  completedArchive: (workspaceId?: string) => ["workspace", workspaceId ?? "none", "completed-archive"] as const,
  projectContext: (projectId?: string) => ["project", projectId ?? "none", "context"] as const,
  taskDetail: (taskId?: string) => ["task", taskId ?? "none", "detail"] as const
};
