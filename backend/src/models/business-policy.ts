import type { PermissionKey } from './permissions.js';

export type UserKind = 'INTERNAL' | 'EXTERNAL';
export const externalPermissions: ReadonlySet<PermissionKey> = new Set([
  'task.view_all', 'task.comment', 'task.log_time', 'task.update_progress', 'task.change_status'
]);
export function effectivePermissions(workspace: PermissionKey[], project: PermissionKey[] | undefined, userType: UserKind): PermissionKey[] {
  const inherited = workspace.includes('workspace.manage') && userType === 'INTERNAL'
    ? workspace : workspace.filter((permission) => project === undefined || project.includes(permission));
  return inherited.filter((permission) => userType === 'INTERNAL' || externalPermissions.has(permission));
}
export function canAccessProject(input: {
  active: boolean; userType: UserKind; permissions: PermissionKey[]; isMember: boolean;
  visibility: 'WORKSPACE' | 'PRIVATE'; memberAreaId?: string | null; projectAreaId?: string | null;
  projectLocalityId?: string | null; localityIds: string[];
}) {
  if (!input.active) return false;
  if (input.isMember) return true;
  if (input.userType === 'EXTERNAL') return false;
  if (input.permissions.includes('workspace.manage') || input.permissions.includes('project.view_all')) return true;
  return input.permissions.includes('project.view_area') && input.visibility === 'WORKSPACE'
    && Boolean(input.memberAreaId) && input.memberAreaId === input.projectAreaId
    && (!input.projectLocalityId || input.localityIds.length === 0 || input.localityIds.includes(input.projectLocalityId));
}
export function canManageProjectTasks(permissions: PermissionKey[]) {
  return permissions.includes('task.create') || permissions.includes('task.assign');
}
export type TaskCapabilities = {
  canView: boolean; canEdit: boolean; canUpdateProgress: boolean; canAssign: boolean;
  canChangeStatus: boolean; canComplete: boolean; canReopen: boolean; canComment: boolean;
  canLogTime: boolean; canCreateSubtasks: boolean; canSeeInternalComments: boolean;
  allowedStatusIds: string[];
};
export type PolicyStatus = { id: string; category: string; countsAsDone: boolean };
export function taskCapabilities(input: {
  permissions: PermissionKey[]; userType: UserKind; hasProjectAccess: boolean;
  assigned: boolean; mentioned: boolean; creator: boolean; done: boolean; parentDone?: boolean;
  isSubtask?: boolean; statuses?: PolicyStatus[];
}): TaskCapabilities {
  const has = (key: PermissionKey) => input.permissions.includes(key);
  const manager = canManageProjectTasks(input.permissions);
  const admin = input.userType === 'INTERNAL' && has('workspace.manage');
  const canView = input.hasProjectAccess && has('task.view_all') && (admin || manager || input.assigned || input.mentioned || input.creator);
  const mutable = canView && (!input.done || admin) && !input.parentDone;
  const canWork = mutable && (manager || input.assigned);
  const canReopen = canView && has('task.reopen') && !input.parentDone;
  const canChangeStatus = canView && has('task.change_status') && (manager || input.assigned)
    && (!input.done || canReopen) && !input.parentDone;
  const canComplete = canChangeStatus && has('task.complete');
  return {
    canView, canEdit: mutable && has('task.update'),
    canUpdateProgress: canWork && (has('task.update_progress') || has('task.update')),
    canAssign: mutable && has('task.assign'), canChangeStatus, canComplete, canReopen,
    canComment: mutable && has('task.comment'), canLogTime: canWork && has('task.log_time'),
    canCreateSubtasks: mutable && !input.done && !input.isSubtask && has('task.create'),
    canSeeInternalComments: canView && input.userType === 'INTERNAL',
    allowedStatusIds: (input.statuses ?? []).filter((status) => canChangeStatus
      && (!status.countsAsDone || canComplete) && (status.category !== 'CANCELLED' || has('task.update'))).map((status) => status.id)
  };
}
export function canGrantRole(input: { actor: PermissionKey[]; target: PermissionKey[]; userType: UserKind }) {
  if (input.userType === 'EXTERNAL' && input.target.some((key) => !externalPermissions.has(key))) return false;
  if (input.actor.includes('workspace.manage')) return true;
  const privileged: PermissionKey[] = ['workspace.manage', 'member.manage', 'area.manage', 'area.approve_members', 'project.view_all', 'project.view_area'];
  return input.target.every((key) => input.actor.includes(key)) && !input.target.some((key) => privileged.includes(key));
}
