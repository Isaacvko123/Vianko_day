import { permissionContext } from "./permission-context.js";
import type { PermissionKey } from '../models/permissions.js';
import { ROLE_DEFINITIONS } from '../models/permissions.js';
import { canAccessProject, canGrantRole, canManageProjectTasks, effectivePermissions, externalPermissions, taskCapabilities } from '../models/business-policy.js';
import { prisma } from '../db/prisma.js';
import { activeRecordFilter } from '../db/filters.js';
import { AppError } from '../utils/app-error.js';

export function getRolePermissions(roleId: string | undefined, workspaceId?: string): Promise<PermissionKey[]> {
  const cache = permissionContext.getStore();
  const key = `${workspaceId ?? ""}:${roleId ?? ""}`;
  const cached = cache?.get(key);
  if (cached) return cached;
  const result = readRolePermissions(roleId, workspaceId);
  cache?.set(key, result);
  return result;
}
async function readRolePermissions(roleId: string | undefined, workspaceId?: string): Promise<PermissionKey[]> {
  if (!roleId) return [];
  const role = await prisma.role.findUnique({ where: { id: roleId }, include: { permissions: { include: { permission: true } } } });
  if (!role || (workspaceId && role.workspaceId !== workspaceId)) return [];
  // System roles follow the versioned catalog, including companies created before a release.
  const systemRole = role.isSystem ? ROLE_DEFINITIONS.find((definition) => definition.name === role.name) : undefined;
  return systemRole?.permissions ?? role.permissions.filter((item) => item.permission.workspaceId === role.workspaceId).map((item) => item.permission.key as PermissionKey);
}
export async function roleHasPermission(roleId: string | undefined, permissionKey: PermissionKey) {
  return (await getRolePermissions(roleId)).includes(permissionKey);
}
export async function assertWorkspaceMember(userId: string, workspaceId: string) {
  const member = await prisma.workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId, userId } }, include: { workspace: true, user: { select: { isActive: true } } }
  });
  if (!member || member.status !== 'ACTIVE' || !member.workspace.isActive || !member.user.isActive) {
    throw new AppError(403, 'WORKSPACE_ACCESS_DENIED', 'No tienes acceso activo a esta empresa.');
  }
  if (member.userType === 'EXTERNAL' && (await getRolePermissions(member.roleId ?? undefined, workspaceId)).some((key) => !externalPermissions.has(key))) {
    throw new AppError(403, 'EXTERNAL_ROLE_INVALID', 'El acceso externo requiere un rol de cliente, invitado o lectura. Contacta a administración.');
  }
  return member;
}
export async function assertWorkspacePermission(userId: string, workspaceId: string, key: PermissionKey) {
  const member = await assertWorkspaceMember(userId, workspaceId);
  const permissions = effectivePermissions(await getRolePermissions(member.roleId ?? undefined, workspaceId), undefined, member.userType);
  if (!permissions.includes(key)) throw new AppError(403, 'PERMISSION_DENIED', 'Tu rol no permite realizar esta acción.');
  return member;
}
export async function hasWorkspacePermission(userId: string, workspaceId: string, key: PermissionKey) {
  const workspaceMembership = await assertWorkspaceMember(userId, workspaceId);
  const permissions = effectivePermissions(await getRolePermissions(workspaceMembership.roleId ?? undefined, workspaceId), undefined, workspaceMembership.userType);
  return { workspaceMembership, hasPermission: permissions.includes(key) };
}
export async function getWorkspaceMemberLocalityIds(member: { id: string; localityId?: string | null }) {
  const scopes = await prisma.workspaceMemberLocality.findMany({ where: { workspaceMemberId: member.id }, select: { localityId: true } });
  return [...new Set([...scopes.map((scope) => scope.localityId), ...(member.localityId ? [member.localityId] : [])])];
}
export async function assertProjectAccess(userId: string, projectId: string) {
  const project = await prisma.project.findFirst({ where: { id: projectId, ...activeRecordFilter }, include: { members: { where: { userId } } } });
  if (!project) throw new AppError(404, 'PROJECT_NOT_FOUND', 'No se encontró el proyecto.');
  const workspaceMember = await assertWorkspaceMember(userId, project.workspaceId);
  const projectMember = project.members[0];
  const [workspacePermissions, projectPermissions, localityIds] = await Promise.all([
    getRolePermissions(workspaceMember.roleId ?? undefined, project.workspaceId),
    projectMember?.roleId ? getRolePermissions(projectMember.roleId, project.workspaceId) : Promise.resolve(undefined),
    getWorkspaceMemberLocalityIds(workspaceMember)
  ]);
  if (!canAccessProject({ active: true, userType: workspaceMember.userType, permissions: workspacePermissions,
    isMember: Boolean(projectMember), visibility: project.visibility, memberAreaId: workspaceMember.areaId,
    projectAreaId: project.areaId, projectLocalityId: project.localityId, localityIds })) {
    throw new AppError(403, 'PROJECT_ACCESS_DENIED', 'No tienes acceso a este proyecto. Solicita que te agreguen como miembro.');
  }
  const permissions = effectivePermissions(workspacePermissions, projectPermissions, workspaceMember.userType);
  return { project, workspaceMember, projectMember, permissions };
}
export async function assertProjectPermission(userId: string, projectId: string, key: PermissionKey) {
  const access = await assertProjectAccess(userId, projectId);
  if (!access.permissions.includes(key)) throw new AppError(403, 'PERMISSION_DENIED', 'Tu rol no permite realizar esta acción en el proyecto.');
  return access;
}
export async function canSeeEveryTaskInProject(workspaceRoleId: string | undefined, projectRoleId?: string) {
  const [workspace, project] = await Promise.all([getRolePermissions(workspaceRoleId), projectRoleId ? getRolePermissions(projectRoleId) : Promise.resolve(undefined)]);
  return canManageProjectTasks(effectivePermissions(workspace, project, 'INTERNAL'));
}
export type ProjectAccess = Awaited<ReturnType<typeof assertProjectAccess>>;
export type PolicyTask = {
  id: string; createdById?: string | null; completedAt?: Date | string | null; parentTaskId?: string | null;
  status?: { countsAsDone: boolean }; parentTask?: { completedAt?: Date | null } | null;
  assignees?: Array<{ userId: string }>; mentions?: Array<{ userId: string }>;
};
export function capabilitiesForTask(task: PolicyTask, userId: string, access: ProjectAccess, statuses?: Array<{ id: string; category: string; countsAsDone: boolean }>) {
  return taskCapabilities({ permissions: access.permissions, userType: access.workspaceMember.userType, hasProjectAccess: true,
    assigned: Boolean(task.assignees?.some((item) => item.userId === userId)), mentioned: Boolean(task.mentions?.some((item) => item.userId === userId)),
    creator: task.createdById === userId, done: task.status?.countsAsDone ?? Boolean(task.completedAt),
    parentDone: Boolean(task.parentTask?.completedAt), isSubtask: Boolean(task.parentTaskId), statuses });
}
export async function assertTaskPermission(userId: string, taskId: string, key: PermissionKey) {
  const task = await prisma.task.findFirst({ where: { id: taskId, ...activeRecordFilter }, include: {
    status: true, assignees: { select: { userId: true } }, mentions: { select: { userId: true } },
    parentTask: { select: { completedAt: true } }, board: { select: { statuses: true, deletedAt: true } }
  } });
  if (!task || task.board.deletedAt) throw new AppError(404, 'TASK_NOT_FOUND', 'No se encontró la tarea.');
  const access = await assertProjectAccess(userId, task.projectId);
  const capabilities = capabilitiesForTask(task, userId, access, task.board.statuses);
  const allowed: Partial<Record<PermissionKey, boolean>> = {
    'task.view_all': capabilities.canView, 'task.update': capabilities.canEdit,
    'task.update_progress': capabilities.canUpdateProgress, 'task.assign': capabilities.canAssign,
    'task.change_status': capabilities.canChangeStatus, 'task.complete': capabilities.canComplete,
    'task.reopen': capabilities.canReopen, 'task.comment': capabilities.canComment,
    'task.log_time': capabilities.canLogTime, 'task.create': capabilities.canCreateSubtasks
  };
  if (!capabilities.canView || !(allowed[key] ?? access.permissions.includes(key))) {
    throw new AppError(403, 'TASK_ACTION_DENIED', 'No puedes realizar esta acción: revisa tu rol, asignación y el estado de la tarea.');
  }
  return { task, ...access, capabilities };
}
export function assertTaskStatusChangePermission(userId: string, taskId: string) {
  return assertTaskPermission(userId, taskId, 'task.change_status');
}
export async function canSeeInternalComments(userId: string, taskId: string) {
  const access = await assertTaskPermission(userId, taskId, 'task.view_all');
  return access.capabilities.canSeeInternalComments;
}
export async function assertRoleGrant(userId: string, workspaceId: string, roleId: string, userType: 'INTERNAL' | 'EXTERNAL') {
  const actor = await assertWorkspaceMember(userId, workspaceId);
  const role = await prisma.role.findFirst({ where: { id: roleId, workspaceId } });
  if (!role) throw new AppError(400, 'ROLE_INVALID', 'El rol no pertenece a esta empresa.');
  const [actorPermissions, target] = await Promise.all([getRolePermissions(actor.roleId ?? undefined, workspaceId), getRolePermissions(roleId, workspaceId)]);
  if (actor.userType !== 'INTERNAL' || !canGrantRole({ actor: actorPermissions, target, userType })) {
    throw new AppError(403, 'ROLE_GRANT_DENIED', 'No puedes otorgar este nivel de acceso. Solicita el cambio a administración.');
  }
  return role;
}

export async function projectVisibilityFilter(userId: string, member: Awaited<ReturnType<typeof assertWorkspaceMember>>) {
  const permissions = await getRolePermissions(member.roleId ?? undefined, member.workspaceId);
  const members = { members: { some: { userId } } };
  if (member.userType === 'EXTERNAL') return members;
  if (permissions.includes('workspace.manage') || permissions.includes('project.view_all')) return {};
  if (!permissions.includes('project.view_area') || !member.areaId) return members;
  const localityIds = await getWorkspaceMemberLocalityIds(member);
  return { OR: [members, { visibility: 'WORKSPACE' as const, areaId: member.areaId,
    ...(localityIds.length ? { OR: [{ localityId: null }, { localityId: { in: localityIds } }] } : {}) }] };
}
