export const queryKeys = {
  workspaces: (userId?: string) => ["workspaces", userId ?? "anonymous"] as const,
  projects: (workspaceId?: string) => ["workspace", workspaceId ?? "none", "projects"] as const,
  catalog: (workspaceId?: string) => ["workspace", workspaceId ?? "none", "catalog"] as const,
  members: (workspaceId?: string) => ["workspace", workspaceId ?? "none", "members"] as const,
  management: (workspaceId?: string) => ["workspace", workspaceId ?? "none", "management"] as const,
  reports: (workspaceId?: string) => ["workspace", workspaceId ?? "none", "reports"] as const,
  projectContext: (projectId?: string) => ["project", projectId ?? "none", "context"] as const,
  taskDetail: (taskId?: string) => ["task", taskId ?? "none", "detail"] as const
};
