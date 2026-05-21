import type { PermissionKey, WorkspaceListItem } from "../types";

export type WorkspaceCapabilities = {
  canCreateWorkspace: boolean;
  canCreateProjects: boolean;
  canManageProjectMembers: boolean;
  canCreateTasks: boolean;
  canUseManagerPlanning: boolean;
  canAnswerAllStaffingRequests: boolean;
  canModifyCompletedTask: boolean;
  canSeeAdminViews: boolean;
  canLoadManagementData: boolean;
};

function permissionSet(workspace?: WorkspaceListItem) {
  return new Set<PermissionKey>(workspace?.member.permissions ?? []);
}

export function hasPermission(workspace: WorkspaceListItem | undefined, permission: PermissionKey) {
  return permissionSet(workspace).has(permission);
}

export function hasAnyPermission(workspace: WorkspaceListItem | undefined, permissions: PermissionKey[]) {
  const permissionsForWorkspace = permissionSet(workspace);
  return permissions.some((permission) => permissionsForWorkspace.has(permission));
}

export function getWorkspaceCapabilities(workspace?: WorkspaceListItem): WorkspaceCapabilities {
  const canManageWorkspace = hasPermission(workspace, "workspace.manage");
  const canManageMembers = canManageWorkspace || hasPermission(workspace, "member.manage");
  const canManageProjectMembers = canManageWorkspace || hasPermission(workspace, "project.manage_members");
  const canCreateProjects = canManageWorkspace || hasPermission(workspace, "project.create");
  const canCreateTasks = canManageWorkspace || hasPermission(workspace, "task.create");
  const canUseManagerPlanning = canManageWorkspace || hasPermission(workspace, "project.view_all");
  const canRequestStaffing = hasPermission(workspace, "project.request_staffing");
  const canRespondStaffing = hasPermission(workspace, "staffing.respond");
  const canViewReports = hasAnyPermission(workspace, ["report.view_project", "report.view_workspace", "workspace.view_reports"]);
  const canSeeAdminViews = canManageMembers || canRequestStaffing || canRespondStaffing || canViewReports;

  return {
    canCreateWorkspace: canManageWorkspace,
    canCreateProjects,
    canManageProjectMembers,
    canCreateTasks,
    canUseManagerPlanning,
    canAnswerAllStaffingRequests: canManageWorkspace,
    canModifyCompletedTask: canManageWorkspace,
    canSeeAdminViews,
    canLoadManagementData: canSeeAdminViews || canManageProjectMembers
  };
}
