import type { PermissionKey, WorkspaceListItem } from "../types";

export type WorkspaceCapabilities = {
  canCreateWorkspace: boolean;
  canCreateProjects: boolean;
  canDeleteProjects: boolean;
  canManageProjectMembers: boolean;
  canCreateTasks: boolean;
  canUseManagerPlanning: boolean;
  canAnswerAllStaffingRequests: boolean;
  canModifyCompletedTask: boolean;
  canViewMembers: boolean;
  canViewManagement: boolean;
  canViewWorkspaceReports: boolean;
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
  const canDeleteProjects = canManageWorkspace || hasPermission(workspace, "project.delete");
  const canCreateTasks = canManageWorkspace || hasPermission(workspace, "task.create");
  const canUseManagerPlanning = canCreateTasks || hasPermission(workspace, "project.view_all");
  const canRequestStaffing = hasPermission(workspace, "project.request_staffing");
  const canRespondStaffing = hasPermission(workspace, "staffing.respond");
  const canViewMembers = canManageMembers || hasPermission(workspace, "workspace.invite_users") || hasPermission(workspace, "area.approve_members");
  const canViewManagement = canRequestStaffing || canRespondStaffing || canManageWorkspace;
  const canViewWorkspaceReports = canManageWorkspace || hasAnyPermission(workspace, ["report.view_workspace", "workspace.view_reports"]);
  const canSeeAdminViews = canViewMembers || canViewManagement || canViewWorkspaceReports;

  return {
    canCreateWorkspace: canManageWorkspace,
    canCreateProjects,
    canDeleteProjects,
    canManageProjectMembers,
    canCreateTasks,
    canUseManagerPlanning,
    canAnswerAllStaffingRequests: canManageWorkspace,
    canModifyCompletedTask: canManageWorkspace,
    canViewMembers,
    canViewManagement,
    canViewWorkspaceReports,
    canSeeAdminViews,
    canLoadManagementData: canViewMembers || canViewManagement || canManageProjectMembers
  };
}
