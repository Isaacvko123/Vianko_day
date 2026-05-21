import type { PermissionKey } from "../models/permissions.js";
import { prisma } from "../db/prisma.js";
import { activeRecordFilter } from "../db/filters.js";
import { AppError } from "../utils/app-error.js";

/**
 * Revisa una sola clave de permiso contra un rol.
 * Los roles viven dentro del workspace, pero las claves son reutilizables entre empresas.
 */
export async function roleHasPermission(roleId: string | undefined, permissionKey: PermissionKey) {
  if (!roleId) {
    return false;
  }

  const count = await prisma.rolePermission.count({
    where: {
      roleId,
      permission: {
        key: permissionKey
      }
    }
  });

  return count > 0;
}

/**
 * Toda operacion privada empieza aqui: el usuario debe ser miembro ACTIVE del workspace.
 * Suspendidos, removidos e invitados fallan antes de llegar a proyectos o tareas.
 */
export async function assertWorkspaceMember(userId: string, workspaceId: string) {
  const workspaceMembership = await prisma.workspaceMember.findUnique({
    where: {
      workspaceId_userId: {
        workspaceId,
        userId
      }
    }
  });

  if (!workspaceMembership || workspaceMembership.status !== "ACTIVE") {
    throw new AppError(403, "WORKSPACE_ACCESS_DENIED", "You do not have access to this workspace.");
  }

  return workspaceMembership;
}

export async function assertWorkspacePermission(
  userId: string,
  workspaceId: string,
  permissionKey: PermissionKey
) {
  const workspaceMembership = await assertWorkspaceMember(userId, workspaceId);
  const hasPermission = await roleHasPermission(workspaceMembership.roleId ?? undefined, permissionKey);

  if (!hasPermission) {
    throw new AppError(403, "PERMISSION_DENIED", `Missing permission: ${permissionKey}.`);
  }

  return workspaceMembership;
}

export async function hasWorkspacePermission(userId: string, workspaceId: string, permissionKey: PermissionKey) {
  const workspaceMembership = await assertWorkspaceMember(userId, workspaceId);
  const hasPermission = await roleHasPermission(workspaceMembership.roleId ?? undefined, permissionKey);

  return { hasPermission, workspaceMembership };
}

export async function getWorkspaceMemberLocalityIds(member: { id: string; localityId?: string | null }) {
  const localityScopes = await prisma.workspaceMemberLocality.findMany({
    where: { workspaceMemberId: member.id },
    select: { localityId: true }
  });

  return [
    ...new Set([
      ...localityScopes.map((localityScope) => localityScope.localityId),
      ...(member.localityId ? [member.localityId] : [])
    ])
  ];
}

function canEnterProjectByArea(input: {
  canViewAreaProjects: boolean;
  projectVisibility: "WORKSPACE" | "PRIVATE";
  memberAreaId?: string | null;
  projectAreaId?: string | null;
  projectLocalityId?: string | null;
  memberLocalityIds: string[];
}) {
  if (
    !input.canViewAreaProjects ||
    input.projectVisibility !== "WORKSPACE" ||
    !input.memberAreaId ||
    input.projectAreaId !== input.memberAreaId
  ) {
    return false;
  }

  return (
    input.memberLocalityIds.length === 0 ||
    !input.projectLocalityId ||
    input.memberLocalityIds.includes(input.projectLocalityId)
  );
}

async function canManageAreaProjects(roleId: string | undefined) {
  return (await roleHasPermission(roleId, "project.create")) || (await roleHasPermission(roleId, "project.manage_members"));
}

/**
 * El acceso a proyecto es mas estricto que el acceso a workspace.
 * Colaboradores solo ven proyectos donde fueron agregados.
 * Gerentes ven su area y sus localidades asignadas; Admin/Admin TI ven todo con project.view_all.
 */
export async function assertProjectAccess(userId: string, projectId: string) {
  const project = await prisma.project.findFirst({
    where: {
      id: projectId,
      ...activeRecordFilter
    },
    include: {
      members: {
        where: { userId }
      }
    }
  });

  if (!project) {
    throw new AppError(404, "PROJECT_NOT_FOUND", "Project not found.");
  }

  const workspaceMembership = await assertWorkspaceMember(userId, project.workspaceId);
  const canViewAllProjects = await roleHasPermission(workspaceMembership.roleId ?? undefined, "project.view_all");
  const canViewAreaProjects = await canManageAreaProjects(workspaceMembership.roleId ?? undefined);
  const memberLocalityIds = await getWorkspaceMemberLocalityIds(workspaceMembership);
  const isProjectMember = Boolean(project.members[0]);
  const canEnterAreaProject = canEnterProjectByArea({
    canViewAreaProjects,
    projectVisibility: project.visibility,
    memberAreaId: workspaceMembership.areaId,
    projectAreaId: project.areaId,
    projectLocalityId: project.localityId,
    memberLocalityIds
  });

  if (
    workspaceMembership.userType === "INTERNAL" &&
    (canViewAllProjects || isProjectMember || canEnterAreaProject)
  ) {
    return { project, workspaceMember: workspaceMembership, projectMember: project.members[0] };
  }

  const projectMembership = project.members[0];

  if (!projectMembership) {
    throw new AppError(403, "PROJECT_ACCESS_DENIED", "You do not have access to this project.");
  }

  return { project, workspaceMember: workspaceMembership, projectMember: projectMembership };
}

export async function assertProjectPermission(
  userId: string,
  projectId: string,
  permissionKey: PermissionKey
) {
  const projectAccess = await assertProjectAccess(userId, projectId);
  const hasWorkspaceRolePermission = await roleHasPermission(projectAccess.workspaceMember.roleId ?? undefined, permissionKey);
  const hasProjectRolePermission = await roleHasPermission(projectAccess.projectMember?.roleId ?? undefined, permissionKey);

  if (!hasWorkspaceRolePermission && !hasProjectRolePermission) {
    throw new AppError(403, "PERMISSION_DENIED", `Missing permission: ${permissionKey}.`);
  }

  return projectAccess;
}

/**
 * Autorizar una tarea siempre implica buscar la tarea y autorizar su proyecto.
 * Esto previene IDOR/BOLA: cambiar :taskId para tocar datos de otra empresa.
 */
export async function assertTaskPermission(userId: string, taskId: string, permissionKey: PermissionKey) {
  const task = await prisma.task.findFirst({
    where: {
      id: taskId,
      ...activeRecordFilter
    }
  });

  if (!task) {
    throw new AppError(404, "TASK_NOT_FOUND", "Task not found.");
  }

  const access = await assertProjectPermission(userId, task.projectId, permissionKey);
  return { task, ...access };
}

/**
 * Regla operativa para tableros: los roles con task.change_status pueden mover
 * cualquier actividad visible, y un usuario asignado puede mover solo sus propias actividades.
 */
export async function assertTaskStatusChangePermission(userId: string, taskId: string) {
  const task = await prisma.task.findFirst({
    where: {
      id: taskId,
      ...activeRecordFilter
    },
    include: {
      project: true,
      assignees: {
        where: { userId },
        select: { id: true }
      }
    }
  });

  if (!task || task.project.deletedAt) {
    throw new AppError(404, "TASK_NOT_FOUND", "Task not found.");
  }

  const workspaceMembership = await assertWorkspaceMember(userId, task.workspaceId);
  const projectMembership = await prisma.projectMember.findFirst({
    where: {
      projectId: task.projectId,
      userId
    }
  });
  const canViewAllProjects = await roleHasPermission(workspaceMembership.roleId ?? undefined, "project.view_all");
  const canViewAreaProjects = await canManageAreaProjects(workspaceMembership.roleId ?? undefined);
  const memberLocalityIds = await getWorkspaceMemberLocalityIds(workspaceMembership);
  const hasWorkspacePermission = await roleHasPermission(workspaceMembership.roleId ?? undefined, "task.change_status");
  const hasProjectPermission = await roleHasPermission(projectMembership?.roleId ?? undefined, "task.change_status");
  const isAssignedToTask = task.assignees.length > 0;
  const canEnterAreaProject = canEnterProjectByArea({
    canViewAreaProjects,
    projectVisibility: task.project.visibility,
    memberAreaId: workspaceMembership.areaId,
    projectAreaId: task.project.areaId,
    projectLocalityId: task.project.localityId,
    memberLocalityIds
  });
  const canAccessByRole =
    workspaceMembership.userType === "INTERNAL" &&
    (canViewAllProjects || Boolean(projectMembership) || canEnterAreaProject);

  if (!canAccessByRole && !projectMembership && !isAssignedToTask) {
    throw new AppError(403, "PROJECT_ACCESS_DENIED", "You do not have access to this project.");
  }

  if (!hasWorkspacePermission && !hasProjectPermission && !isAssignedToTask) {
    throw new AppError(403, "PERMISSION_DENIED", "Only assigned users or authorized roles can change task status.");
  }

  return {
    task,
    project: task.project,
    workspaceMember: workspaceMembership,
    projectMember: projectMembership ?? undefined
  };
}

export async function canSeeInternalComments(userId: string, taskId: string) {
  const { workspaceMember } = await assertTaskPermission(userId, taskId, "task.view_all");
  return workspaceMember.userType === "INTERNAL";
}
