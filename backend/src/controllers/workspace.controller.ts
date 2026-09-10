import { ROLE_DEFINITIONS } from "../models/permissions.js";
import type { Prisma } from "@prisma/client";
import type { Request, Response } from "express";
import { prisma } from "../db/prisma.js";
import { activeRecordFilter } from "../db/filters.js";
import { AppError } from "../utils/app-error.js";
import { canGrantRole, effectivePermissions } from "../models/business-policy.js";
import { assertRoleGrant, getRolePermissions, assertWorkspaceMember, assertWorkspacePermission, roleHasPermission } from "../services/access-control.service.js";
import { emitRealtimeEvent } from "../services/realtime.service.js";
import { bootstrapWorkspaceForOwner } from "../services/workspace.service.js";
import { createInvitationToken } from "./auth.controller.js";
import { getParam } from "../utils/request.js";

type MemberManagementScope = {
  requester: Awaited<ReturnType<typeof assertWorkspaceMember>>;
  requesterLocalityIds: string[];
  canManageWorkspaceMembers: boolean;
  canApproveAreaMembers: boolean;
};

async function getMemberManagementScope(userId: string, workspaceId: string, directoryOnly = false): Promise<MemberManagementScope> {
  const requester = await assertWorkspaceMember(userId, workspaceId);
  if (requester.userType !== "INTERNAL") throw new AppError(403, "MEMBER_MANAGEMENT_DENIED", "Los usuarios externos no administran personas.");
  const localityScopes = await prisma.workspaceMemberLocality.findMany({
    where: { workspaceMemberId: requester.id },
    select: { localityId: true }
  });
  const requesterLocalityIds = uniqueStrings([
    ...localityScopes.map((localityScope) => localityScope.localityId),
    ...(requester.localityId ? [requester.localityId] : [])
  ]);
  const canManageWorkspaceMembers =
    (await roleHasPermission(requester.roleId ?? undefined, "member.manage")) ||
    (await roleHasPermission(requester.roleId ?? undefined, "workspace.manage"));
  const canApproveAreaMembers = await roleHasPermission(requester.roleId ?? undefined, "area.approve_members");

  if (!canManageWorkspaceMembers && !canApproveAreaMembers && !(directoryOnly && await roleHasPermission(requester.roleId ?? undefined, "project.manage_members"))) {
    throw new AppError(403, "PERMISSION_DENIED", "Member management permission is required.");
  }

  return { requester, requesterLocalityIds, canManageWorkspaceMembers, canApproveAreaMembers };
}

function uniqueStrings(values: string[]) {
  return [...new Set(values.filter((value) => value.length > 0))];
}

function readRequestedLocalityIds(input: { localityId?: string; localityIds?: string[] }, fallbackLocalityId?: string) {
  const requestedLocalityIds = uniqueStrings([
    ...(input.localityIds ?? []),
    ...(input.localityId ? [input.localityId] : [])
  ]);

  if (requestedLocalityIds.length > 0) {
    return requestedLocalityIds;
  }

  return fallbackLocalityId ? [fallbackLocalityId] : [];
}

function primaryLocalityId(localityIds: string[]) {
  return localityIds[0];
}

function scopedMemberFilter(scope: MemberManagementScope): Prisma.WorkspaceMemberWhereInput {
  if (scope.canManageWorkspaceMembers) {
    return {};
  }

  if (!scope.requester.areaId) {
    throw new AppError(403, "AREA_SCOPE_REQUIRED", "Your user does not have an assigned area.");
  }

  if (scope.requesterLocalityIds.length === 0) {
    return { areaId: scope.requester.areaId };
  }

  return {
    areaId: scope.requester.areaId,
    OR: [
      { localityId: { in: scope.requesterLocalityIds } },
      {
        localityScopes: {
          some: {
            localityId: { in: scope.requesterLocalityIds }
          }
        }
      }
    ]
  };
}

function assertExistingMemberInScope(
  scope: MemberManagementScope,
  member: {
    areaId?: string | null;
    localityId?: string | null;
    localityScopes: Array<{ localityId: string }>;
  }
) {
  if (scope.canManageWorkspaceMembers) {
    return;
  }

  if (!scope.requester.areaId || member.areaId !== scope.requester.areaId) {
    throw new AppError(403, "AREA_SCOPE_DENIED", "You can only manage members in your area.");
  }

  if (scope.requesterLocalityIds.length === 0) {
    return;
  }

  const memberLocalityIds = uniqueStrings([
    ...member.localityScopes.map((localityScope) => localityScope.localityId),
    ...(member.localityId ? [member.localityId] : [])
  ]);
  const hasSharedLocality = memberLocalityIds.some((localityId) => scope.requesterLocalityIds.includes(localityId));

  if (!hasSharedLocality) {
    throw new AppError(403, "LOCALITY_SCOPE_DENIED", "You can only manage members in your assigned localities.");
  }
}

async function canManageWorkspaceStructure(roleId: string | undefined) {
  return (
    (await roleHasPermission(roleId, "workspace.manage")) ||
    (await roleHasPermission(roleId, "member.manage")) ||
    (await roleHasPermission(roleId, "area.manage"))
  );
}

async function assertCanCreateWorkspace(userId: string) {
  const memberships = await prisma.workspaceMember.findMany({
    where: {
      userId,
      status: "ACTIVE",
      userType: "INTERNAL"
    },
    select: {
      roleId: true
    }
  });

  for (const membership of memberships) {
    const canCreateWorkspace = await roleHasPermission(membership.roleId ?? undefined, "workspace.manage");

    if (canCreateWorkspace) {
      return;
    }
  }

  throw new AppError(403, "WORKSPACE_CREATE_DENIED", "Only Admin or Admin TI can create workspaces.");
}

function assertLocalityScope(scope: MemberManagementScope, selectedLocalityIds: string[]) {
  if (scope.canManageWorkspaceMembers || scope.requesterLocalityIds.length === 0) {
    return;
  }

  if (selectedLocalityIds.length === 0) throw new AppError(403, "LOCALITY_SCOPE_REQUIRED", "Selecciona al menos una de tus localidades permitidas. No puedes conceder acceso a toda el área.");
  const allowedLocalityIds = new Set(scope.requesterLocalityIds);
  const hasDeniedLocality = selectedLocalityIds.some((localityId) => !allowedLocalityIds.has(localityId));

  if (hasDeniedLocality) {
    throw new AppError(403, "LOCALITY_SCOPE_DENIED", "You can only manage users in your assigned localities.");
  }
}

async function assertAreaBelongsToWorkspace(workspaceId: string, areaId: string) {
  const area = await prisma.area.findFirst({
    where: {
      id: areaId,
      workspaceId
    }
  });

  if (!area) {
    throw new AppError(400, "AREA_INVALID", "Area does not belong to this workspace.");
  }

  return area;
}

async function assertLocalityBelongsToWorkspace(workspaceId: string, localityId: string, areaId?: string) {
  const locality = await prisma.locality.findFirst({
    where: {
      id: localityId,
      workspaceId
    }
  });

  if (!locality) {
    throw new AppError(400, "LOCALITY_INVALID", "Locality does not belong to this workspace.");
  }

  if (areaId && locality.areaId && locality.areaId !== areaId) {
    throw new AppError(400, "LOCALITY_AREA_INVALID", "Locality does not belong to the selected area.");
  }

  return locality;
}

async function assertLocalitiesBelongToWorkspace(workspaceId: string, localityIds: string[], areaId?: string) {
  if (localityIds.length === 0) {
    return;
  }

  const localities = await prisma.locality.findMany({
    where: {
      id: { in: localityIds },
      workspaceId
    },
    select: {
      id: true,
      areaId: true
    }
  });

  if (localities.length !== localityIds.length) {
    throw new AppError(400, "LOCALITY_INVALID", "One or more localities do not belong to this workspace.");
  }

  if (areaId && localities.some((locality) => locality.areaId && locality.areaId !== areaId)) {
    throw new AppError(400, "LOCALITY_AREA_INVALID", "One or more localities do not belong to the selected area.");
  }
}

async function syncMemberLocalityScopes(
  tx: Prisma.TransactionClient,
  workspaceMemberId: string,
  localityIds: string[]
) {
  const selectedLocalityIds = uniqueStrings(localityIds);
  await tx.workspaceMemberLocality.deleteMany({
    where: { workspaceMemberId }
  });

  if (selectedLocalityIds.length === 0) {
    return;
  }

  await tx.workspaceMemberLocality.createMany({
    data: selectedLocalityIds.map((localityId) => ({
      workspaceMemberId,
      localityId
    }))
  });
}

async function assertPositionBelongsToWorkspace(workspaceId: string, positionId: string, areaId: string) {
  const position = await prisma.position.findFirst({
    where: {
      id: positionId,
      workspaceId
    }
  });

  if (!position) {
    throw new AppError(400, "POSITION_INVALID", "Position does not belong to this workspace.");
  }

  if (position.areaId && position.areaId !== areaId) {
    throw new AppError(400, "POSITION_AREA_INVALID", "Position does not belong to the selected area.");
  }

  return position;
}

async function resolveDefaultRoleId(workspaceId: string, userType: "INTERNAL" | "EXTERNAL") {
  const roleName = userType === "EXTERNAL" ? "Cliente" : "Colaborador";
  const role = await prisma.role.findFirst({
    where: {
      workspaceId,
      name: roleName
    }
  });

  if (!role) {
    throw new AppError(500, "ROLE_MISSING", `Default role ${roleName} is missing.`);
  }

  return role.id;
}

type RoleWithPermissions = {
  id: string;
  workspaceId: string;
  name: string;
  description?: string | null;
  isSystem: boolean;
  permissions?: Array<{
    permission: {
      key: string;
    };
  }>;
};

function rolePayload(role?: RoleWithPermissions) {
  if (!role) {
    return undefined;
  }

  return {
    id: role.id,
    workspaceId: role.workspaceId,
    name: role.name,
    description: (role.isSystem ? ROLE_DEFINITIONS.find(definition => definition.name === role.name)?.description : undefined) ?? role.description ?? undefined,
    isSystem: role.isSystem
  };
}

function permissionKeysFromRole(role?: RoleWithPermissions) {
  return role?.permissions?.map((rolePermission) => rolePermission.permission.key) ?? [];
}

export async function listWorkspaces(req: Request, res: Response) {
  const userId = req.auth!.userId;

  const memberships = await prisma.workspaceMember.findMany({
    where: {
      userId,
      status: "ACTIVE",
      workspace: {
        ...activeRecordFilter,
        isActive: true
      }
    },
    include: {
      workspace: true,
      role: {
        include: {
          permissions: {
            include: {
              permission: {
                select: {
                  key: true
                }
              }
            }
          }
        }
      },
      area: true,
      locality: true,
      localityScopes: {
        include: {
          locality: true
        },
        orderBy: { createdAt: "asc" }
      },
      position: true
    },
    orderBy: {
      createdAt: "asc"
    }
  });

  res.json({
    workspaces: await Promise.all(memberships.map(async (membership) => ({
      ...membership.workspace,
      member: {
        userType: membership.userType,
        status: membership.status,
        role: rolePayload(membership.role ?? undefined),
        permissions: effectivePermissions(await getRolePermissions(membership.roleId ?? undefined, membership.workspaceId), undefined, membership.userType),
        area: membership.area,
        locality: membership.locality,
        localityScopes: membership.localityScopes,
        position: membership.position
      }
    })))
  });
}

export async function createWorkspace(req: Request, res: Response) {
  const userId = req.auth!.userId;
  await assertCanCreateWorkspace(userId);

  const result = await prisma.$transaction((tx) =>
    bootstrapWorkspaceForOwner(tx, {
      ownerId: userId,
      workspaceName: req.body.name,
      defaultAreaName: req.body.defaultAreaName,
      defaultLocalityName: req.body.defaultLocalityName,
      defaultLocalityCode: req.body.defaultLocalityCode
    })
  );

  const membership = await prisma.workspaceMember.findUnique({
    where: {
      workspaceId_userId: {
        workspaceId: result.workspace.id,
        userId
      }
    },
    include: {
      workspace: true,
      role: {
        include: {
          permissions: {
            include: {
              permission: {
                select: {
                  key: true
                }
              }
            }
          }
        }
      },
      area: true,
      locality: true,
      localityScopes: {
        include: {
          locality: true
        },
        orderBy: { createdAt: "asc" }
      },
      position: true
    }
  });

  if (!membership) {
    throw new AppError(500, "WORKSPACE_MEMBERSHIP_MISSING", "Workspace was created but owner membership was not found.");
  }

  emitRealtimeEvent({
    type: "workspace.created",
    workspaceId: result.workspace.id,
    actorId: userId,
    title: "Workspace creado",
    message: `Se creo el workspace ${result.workspace.name}.`
  });

  res.status(201).json({
    workspace: {
      ...membership.workspace,
      member: {
        userType: membership.userType,
        status: membership.status,
        role: rolePayload(membership.role ?? undefined),
        permissions: effectivePermissions(await getRolePermissions(membership.roleId ?? undefined, membership.workspaceId), undefined, membership.userType),
        area: membership.area,
        locality: membership.locality,
        localityScopes: membership.localityScopes,
        position: membership.position
      }
    },
    project: result.project,
    board: result.board
  });
}

export async function listWorkspaceMembers(req: Request, res: Response) {
  const userId = req.auth!.userId;
  const workspaceId = getParam(req, "workspaceId");

  const scope = await getMemberManagementScope(userId, workspaceId, true);

  const members = await prisma.workspaceMember.findMany({
    where: {
      workspaceId,
      ...scopedMemberFilter(scope)
    },
    include: {
      user: {
        select: {
          id: true,
          name: true,
          email: true,
          avatarUrl: true,
          isActive: true
        }
      },
      role: true,
      area: true,
      locality: true,
      localityScopes: {
        include: {
          locality: true
        },
        orderBy: { createdAt: "asc" }
      },
      position: true,
      approvedBy: {
        select: {
          id: true,
          name: true,
          email: true,
          avatarUrl: true
        }
      }
    },
    orderBy: {
      createdAt: "asc"
    }
  });

  res.json({ members });
}

export async function inviteUser(req: Request, res: Response) {
  const userId = req.auth!.userId;
  const workspaceId = getParam(req, "workspaceId");
  const { email, userType, projectId, expiresInDays } = req.body;
  if (userType === "EXTERNAL" && !projectId) throw new AppError(400, "EXTERNAL_PROJECT_REQUIRED", "Selecciona el proyecto que compartirás con la persona externa.");
  const roleId = req.body.roleId || await resolveDefaultRoleId(workspaceId, userType);
  const scope = await getMemberManagementScope(userId, workspaceId);
  const selectedAreaId = req.body.areaId || scope.requester.areaId;
  const selectedLocalityIds = req.body.localityIds !== undefined ? readRequestedLocalityIds(req.body) : readRequestedLocalityIds(req.body, scope.requester.localityId ?? undefined);
  const selectedLocalityId = primaryLocalityId(selectedLocalityIds);
  const selectedPositionId = req.body.positionId;

  await assertWorkspacePermission(userId, workspaceId, "workspace.invite_users");

  if (!selectedAreaId) {
    throw new AppError(400, "INVITATION_AREA_REQUIRED", "Invitation area is required.");
  }

  if (!scope.canManageWorkspaceMembers && selectedAreaId !== scope.requester.areaId) {
    throw new AppError(403, "AREA_SCOPE_DENIED", "You can only invite users to your area.");
  }

  assertLocalityScope(scope, selectedLocalityIds);

  await assertRoleGrant(userId, workspaceId, roleId, userType);
  const role = await prisma.role.findFirst({ where: { id: roleId, workspaceId } });
  if (!role) {
    throw new AppError(400, "ROLE_INVALID", "Role does not belong to this workspace.");
  }

  await assertAreaBelongsToWorkspace(workspaceId, selectedAreaId);

  await assertLocalitiesBelongToWorkspace(workspaceId, selectedLocalityIds, selectedAreaId);

  if (selectedPositionId) {
    await assertPositionBelongsToWorkspace(workspaceId, selectedPositionId, selectedAreaId);
  }

  if (projectId) {
    const project = await prisma.project.findFirst({
      where: {
        id: projectId,
        workspaceId,
        ...activeRecordFilter
      }
    });

    if (!project) {
      throw new AppError(400, "PROJECT_INVALID", "Project does not belong to this workspace.");
    }

    if (!scope.canManageWorkspaceMembers && project.areaId !== selectedAreaId) {
      throw new AppError(403, "PROJECT_AREA_SCOPE_DENIED", "You can only invite users to projects in your area.");
    }
  }

  const existingMember = await prisma.workspaceMember.findFirst({ where: { workspaceId, user: { email }, status: { in: ['ACTIVE', 'SUSPENDED'] } } });
  if (existingMember) throw new AppError(409, 'MEMBER_ALREADY_EXISTS', 'Esta persona ya pertenece a la empresa. Administra su acceso desde Personas.');
  const { rawToken, tokenHash } = await createInvitationToken();
  const invitationExpiresAt = new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000);

  const invitation = await prisma.invitation.create({
    data: {
      workspaceId,
      email,
      roleId,
      areaId: selectedAreaId,
      localityId: selectedLocalityId,
      positionId: selectedPositionId,
      invitedById: userId,
      userType,
      tokenHash,
      expiresAt: invitationExpiresAt,
      projectId,
      localityScopes: selectedLocalityIds.length > 0
        ? {
          create: selectedLocalityIds.map((localityId) => ({ localityId }))
        }
        : undefined
    },
    include: {
      role: true,
      area: true,
      locality: true,
      localityScopes: {
        include: {
          locality: true
        },
        orderBy: { createdAt: "asc" }
      },
      position: true,
      project: true
    }
  });

  await prisma.activityLog.create({
    data: {
      workspaceId,
      projectId,
      actorId: userId,
      entityType: "INVITATION",
      entityId: invitation.id,
      action: "user.invited",
      after: {
        email,
        userType,
        roleId,
        areaId: selectedAreaId,
        localityId: selectedLocalityId ?? null,
        localityIds: selectedLocalityIds,
        positionId: selectedPositionId,
        projectId
      }
    }
  });

  emitRealtimeEvent({
    type: "workspace.user_invited",
    workspaceId,
    projectId,
    actorId: userId,
    title: "Invitacion enviada",
    message: `Se invito a ${email}.`
  });

  // MVP: devolvemos el token crudo para probar localmente.
  // Produccion debe enviarlo por correo y nunca exponerlo en logs.
  res.status(201).json({
    invitation,
    inviteToken: rawToken
  });
}

export async function listWorkspaceRoles(req: Request, res: Response) {
  const userId = req.auth!.userId;
  const workspaceId = getParam(req, "workspaceId");

  const requester = await assertWorkspaceMember(userId, workspaceId);
  const actor = await getRolePermissions(requester.roleId ?? undefined, workspaceId);
  if (requester.userType !== "INTERNAL" || !actor.some((key) => ["workspace.invite_users", "project.manage_members", "member.manage", "area.approve_members"].includes(key))) throw new AppError(403, "PERMISSION_DENIED", "No puedes administrar roles.");

  const roles = await prisma.role.findMany({
    where: { workspaceId },
    orderBy: { name: "asc" }
  });

  const availableRoles = await Promise.all(roles.map(async (role) => ({ ...role, permissions: await getRolePermissions(role.id, workspaceId) })));
  res.json({ roles: availableRoles.filter((role) => canGrantRole({ actor, target: role.permissions, userType: "INTERNAL" })) });
}

export async function listWorkspaceInvitations(req: Request, res: Response) {
  const workspaceId = getParam(req, 'workspaceId');
  await assertWorkspacePermission(req.auth!.userId, workspaceId, 'workspace.invite_users');
  const scope = await getMemberManagementScope(req.auth!.userId, workspaceId);
  const rows = await prisma.invitation.findMany({ where: { workspaceId, ...(scope.canManageWorkspaceMembers ? {} : { areaId: scope.requester.areaId,
    ...(scope.requesterLocalityIds.length ? { localityScopes: { some: { localityId: { in: scope.requesterLocalityIds } } } } : {}) }) },
    take: 50, orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
    select: { id: true, email: true, userType: true, status: true, expiresAt: true, createdAt: true, roleId: true, role: { select: { id: true, name: true, isSystem: true } }, area: { select: { name: true } } } });
  const actor = await getRolePermissions(scope.requester.roleId ?? undefined, workspaceId);
  const invitations = await Promise.all(rows.map(async row => ({ ...row, canRevoke: row.status === 'PENDING' && row.expiresAt > new Date() && canGrantRole({ actor, target: await getRolePermissions(row.roleId ?? undefined, workspaceId), userType: row.userType }) })));
  res.json({ invitations });
}

export async function revokeWorkspaceInvitation(req: Request, res: Response) {
  const workspaceId = getParam(req, 'workspaceId');
  await assertWorkspacePermission(req.auth!.userId, workspaceId, 'workspace.invite_users');
  const scope = await getMemberManagementScope(req.auth!.userId, workspaceId);
  const invitation = await prisma.invitation.findFirst({ where: { id: getParam(req, 'invitationId'), workspaceId }, include: { localityScopes: { select: { localityId: true } } } });
  if (!invitation) throw new AppError(404, 'INVITATION_NOT_FOUND', 'No se encontró la invitación.');
  assertExistingMemberInScope(scope, invitation);
  if (invitation.roleId) await assertRoleGrant(req.auth!.userId, workspaceId, invitation.roleId, invitation.userType);
  if (invitation.status !== 'PENDING' || invitation.expiresAt <= new Date()) throw new AppError(409, 'INVITATION_ALREADY_CLOSED', 'Esta invitación ya no está pendiente.');
  await prisma.$transaction(async tx => {
    await tx.invitation.update({ where: { id: invitation.id, status: 'PENDING', updatedAt: invitation.updatedAt }, data: { status: 'REVOKED', revokedAt: new Date() } });
    await tx.activityLog.create({ data: { workspaceId, actorId: req.auth!.userId, entityType: 'INVITATION', entityId: invitation.id, action: 'invitation.revoked' } });
  });
  emitRealtimeEvent({ type: 'workspace.user_invited', workspaceId, actorId: req.auth!.userId, title: 'Invitación cancelada', message: 'El enlace de invitación ha dejado de ser válido.' });
  res.status(204).end();
}

export async function listWorkspaceAreas(req: Request, res: Response) {
  const userId = req.auth!.userId;
  const workspaceId = getParam(req, "workspaceId");

  const requester = await assertWorkspaceMember(userId, workspaceId);
  if (requester.userType !== "INTERNAL") throw new AppError(403, "ORGANIZATION_ACCESS_DENIED", "El catálogo de organización es exclusivo del equipo interno.");
  const canSeeAllAreas = await canManageWorkspaceStructure(requester.roleId ?? undefined);
  const where: Prisma.AreaWhereInput =
    canSeeAllAreas || !requester.areaId
      ? { workspaceId }
      : { workspaceId, id: requester.areaId };

  const areas = await prisma.area.findMany({
    where,
    orderBy: [{ isDefault: "desc" }, { name: "asc" }]
  });

  res.json({ areas });
}

export async function createWorkspaceArea(req: Request, res: Response) {
  const userId = req.auth!.userId;
  const workspaceId = getParam(req, "workspaceId");

  await assertWorkspacePermission(userId, workspaceId, "area.manage");

  const area = await prisma.area.create({ data: { workspaceId, name: req.body.name, description: req.body.description } });

  emitRealtimeEvent({
    type: "workspace.area_saved",
    workspaceId,
    actorId: userId,
    title: "Area actualizada",
    message: `Se guardo el area ${area.name}.`
  });

  res.status(201).json({ area });
}

export async function listWorkspaceLocalities(req: Request, res: Response) {
  const userId = req.auth!.userId;
  const workspaceId = getParam(req, "workspaceId");

  const requester = await assertWorkspaceMember(userId, workspaceId);
  if (requester.userType !== "INTERNAL") throw new AppError(403, "ORGANIZATION_ACCESS_DENIED", "El catálogo de organización es exclusivo del equipo interno.");
  const localityScopes = await prisma.workspaceMemberLocality.findMany({
    where: { workspaceMemberId: requester.id },
    select: { localityId: true }
  });
  const requesterLocalityIds = uniqueStrings([
    ...localityScopes.map((localityScope) => localityScope.localityId),
    ...(requester.localityId ? [requester.localityId] : [])
  ]);
  const canSeeAllLocalities = await canManageWorkspaceStructure(requester.roleId ?? undefined);
  const where: Prisma.LocalityWhereInput =
    canSeeAllLocalities || !requester.areaId
      ? { workspaceId }
      : requesterLocalityIds.length > 0
        ? { workspaceId, id: { in: requesterLocalityIds } }
        : { workspaceId, areaId: requester.areaId };

  const localities = await prisma.locality.findMany({
    where,
    include: {
      area: true
    },
    orderBy: [{ isDefault: "desc" }, { name: "asc" }]
  });

  res.json({ localities });
}

export async function createWorkspaceLocality(req: Request, res: Response) {
  const userId = req.auth!.userId;
  const workspaceId = getParam(req, "workspaceId");
  const requester = await assertWorkspacePermission(userId, workspaceId, "locality.manage");
  const selectedAreaId = req.body.areaId || requester.areaId;

  if (!selectedAreaId) {
    throw new AppError(400, "LOCALITY_AREA_REQUIRED", "Locality area is required.");
  }

  const canManageAreas =
    (await roleHasPermission(requester.roleId ?? undefined, "area.manage")) ||
    (await roleHasPermission(requester.roleId ?? undefined, "member.manage"));

  if (!canManageAreas && selectedAreaId !== requester.areaId) {
    throw new AppError(403, "AREA_SCOPE_DENIED", "You can only create localities in your area.");
  }

  await assertAreaBelongsToWorkspace(workspaceId, selectedAreaId);

  const conflictingLocalityName = await prisma.locality.findFirst({
    where: {
      workspaceId,
      areaId: selectedAreaId,
      name: req.body.name,
      code: {
        not: req.body.code
      }
    }
  });

  if (conflictingLocalityName) {
    throw new AppError(409, "LOCALITY_NAME_EXISTS", "A locality with this name already exists in the selected area.");
  }

  const existingLocality = await prisma.locality.findFirst({
    where: {
      workspaceId,
      areaId: selectedAreaId,
      code: req.body.code
    }
  });

  if (existingLocality) throw new AppError(409, 'LOCALITY_CODE_EXISTS', 'Ya existe una localidad con ese código. Edítala desde Organización.');
  const locality = await prisma.locality.create({ data: { workspaceId, areaId: selectedAreaId, name: req.body.name, code: req.body.code, description: req.body.description }, include: { area: true } });

  emitRealtimeEvent({
    type: "workspace.locality_saved",
    workspaceId,
    actorId: userId,
    title: "Localidad actualizada",
    message: `Se guardo la localidad ${locality.name}.`
  });

  res.status(201).json({ locality });
}

export async function listWorkspacePositions(req: Request, res: Response) {
  const userId = req.auth!.userId;
  const workspaceId = getParam(req, "workspaceId");
  const requester = await assertWorkspaceMember(userId, workspaceId);
  if (requester.userType !== "INTERNAL") throw new AppError(403, "ORGANIZATION_ACCESS_DENIED", "El catálogo de organización es exclusivo del equipo interno.");
  const canManageAreas =
    (await roleHasPermission(requester.roleId ?? undefined, "area.manage")) ||
    (await roleHasPermission(requester.roleId ?? undefined, "member.manage"));
  const where: Prisma.PositionWhereInput =
    canManageAreas || !requester.areaId
      ? { workspaceId }
      : { workspaceId, areaId: requester.areaId };

  const positions = await prisma.position.findMany({
    where,
    include: {
      area: true
    },
    orderBy: [{ isManager: "desc" }, { name: "asc" }]
  });

  res.json({ positions });
}

export async function createWorkspacePosition(req: Request, res: Response) {
  const userId = req.auth!.userId;
  const workspaceId = getParam(req, "workspaceId");
  const requester = await assertWorkspacePermission(userId, workspaceId, "position.manage");
  const selectedAreaId = req.body.areaId || requester.areaId;

  if (!selectedAreaId) {
    throw new AppError(400, "POSITION_AREA_REQUIRED", "Position area is required.");
  }

  const canManageAreas =
    (await roleHasPermission(requester.roleId ?? undefined, "area.manage")) ||
    (await roleHasPermission(requester.roleId ?? undefined, "member.manage"));

  if (!canManageAreas && selectedAreaId !== requester.areaId) {
    throw new AppError(403, "AREA_SCOPE_DENIED", "You can only create positions in your area.");
  }

  await assertAreaBelongsToWorkspace(workspaceId, selectedAreaId);

  const position = await prisma.position.create({ data: { workspaceId, areaId: selectedAreaId, name: req.body.name, description: req.body.description, isManager: req.body.isManager }, include: { area: true } });

  emitRealtimeEvent({
    type: "workspace.position_saved",
    workspaceId,
    actorId: userId,
    title: "Puesto actualizado",
    message: `Se guardo el puesto ${position.name}.`
  });

  res.status(201).json({ position });
}

export async function listPendingWorkspaceMembers(req: Request, res: Response) {
  const userId = req.auth!.userId;
  const workspaceId = getParam(req, "workspaceId");
  const scope = await getMemberManagementScope(userId, workspaceId);

  const members = await prisma.workspaceMember.findMany({
    where: {
      workspaceId,
      status: "PENDING_APPROVAL",
      ...scopedMemberFilter(scope)
    },
    include: {
      user: {
        select: {
          id: true,
          name: true,
          email: true,
          avatarUrl: true,
          isActive: true
        }
      },
      role: true,
      area: true,
      locality: true,
      localityScopes: {
        include: {
          locality: true
        },
        orderBy: { createdAt: "asc" }
      },
      position: true
    },
    orderBy: {
      createdAt: "asc"
    }
  });

  res.json({ members });
}

export async function updateWorkspaceMember(req: Request, res: Response) {
  const userId = req.auth!.userId;
  const workspaceId = getParam(req, "workspaceId");
  const memberId = getParam(req, "memberId");
  const scope = await getMemberManagementScope(userId, workspaceId);

  const currentMember = await prisma.workspaceMember.findFirst({
    where: {
      id: memberId,
      workspaceId
    },
    include: {
      localityScopes: {
        select: {
          localityId: true
        },
        orderBy: { createdAt: "asc" }
      }
    }
  });

  if (!currentMember) {
    throw new AppError(404, "MEMBER_NOT_FOUND", "Workspace member not found.");
  }

  if (currentMember.status === "SUSPENDED" || currentMember.status === "REMOVED") {
    throw new AppError(409, "MEMBER_BLOCKED", "Suspended or removed members cannot be updated directly.");
  }

  assertExistingMemberInScope(scope, currentMember);
  if (currentMember.roleId) await assertRoleGrant(userId, workspaceId, currentMember.roleId, currentMember.userType);

  const selectedAreaId = req.body.areaId || currentMember.areaId;
  if (!selectedAreaId) {
    throw new AppError(400, "MEMBER_AREA_REQUIRED", "Member area is required.");
  }

  if (!scope.canManageWorkspaceMembers && selectedAreaId !== scope.requester.areaId) {
    throw new AppError(403, "AREA_SCOPE_DENIED", "You can only move members inside your area.");
  }

  const selectedArea = await assertAreaBelongsToWorkspace(workspaceId, selectedAreaId);
  const existingLocalityIds = uniqueStrings([
    ...currentMember.localityScopes.map((localityScope) => localityScope.localityId),
    ...(currentMember.localityId ? [currentMember.localityId] : [])
  ]);
  const bodyLocalityIds = readRequestedLocalityIds(req.body);
  const selectedLocalityIds = req.body.localityIds !== undefined || req.body.localityId !== undefined ? bodyLocalityIds : existingLocalityIds;
  const selectedLocalityId = primaryLocalityId(selectedLocalityIds);
  assertLocalityScope(scope, selectedLocalityIds);
  await assertLocalitiesBelongToWorkspace(workspaceId, selectedLocalityIds, selectedArea.id);

  const selectedUserType = req.body.userType || currentMember.userType;
  const selectedRoleId = req.body.roleId || currentMember.roleId || await resolveDefaultRoleId(workspaceId, selectedUserType);
  await assertRoleGrant(userId, workspaceId, selectedRoleId, selectedUserType);
  if (currentMember.userId === userId && (selectedRoleId !== currentMember.roleId || selectedUserType !== currentMember.userType)) throw new AppError(403, "SELF_ROLE_CHANGE_DENIED", "Otro administrador debe cambiar tu rol o tipo de acceso.");
  if (!scope.canManageWorkspaceMembers && currentMember.userId === userId) throw new AppError(403, "SELF_ACCESS_CHANGE_DENIED", "Solicita a administración los cambios de tu propio acceso.");
  const role = await prisma.role.findFirst({
    where: {
      id: selectedRoleId,
      workspaceId
    }
  });

  if (!role) {
    throw new AppError(400, "ROLE_INVALID", "Role does not belong to this workspace.");
  }

  const selectedPositionId = req.body.positionId !== undefined ? req.body.positionId : currentMember.positionId;
  if (selectedPositionId) {
    await assertPositionBelongsToWorkspace(workspaceId, selectedPositionId, selectedArea.id);
  }

  const member = await prisma.$transaction(async (tx) => {
    const updatedMember = await tx.workspaceMember.update({
      where: { id: currentMember.id, updatedAt: req.body.expectedUpdatedAt ? new Date(req.body.expectedUpdatedAt) : currentMember.updatedAt },
      data: {
        roleId: role.id,
        areaId: selectedArea.id,
        localityId: selectedLocalityId ?? null,
        positionId: selectedPositionId,
        userType: selectedUserType
      }
    });

    await syncMemberLocalityScopes(tx, updatedMember.id, selectedLocalityIds);

    return tx.workspaceMember.findUniqueOrThrow({
      where: { id: updatedMember.id },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            avatarUrl: true,
            isActive: true
          }
        },
        role: true,
        area: true,
        locality: true,
        localityScopes: {
          include: {
            locality: true
          },
          orderBy: { createdAt: "asc" }
        },
        position: true,
        approvedBy: {
          select: {
            id: true,
            name: true,
            email: true,
            avatarUrl: true
          }
        }
      }
    });
  });

  await prisma.activityLog.create({
    data: {
      workspaceId,
      actorId: userId,
      entityType: "USER",
      entityId: currentMember.userId,
      action: "user.updated",
      before: {
        roleId: currentMember.roleId,
        areaId: currentMember.areaId,
        localityId: currentMember.localityId,
        localityIds: existingLocalityIds,
        positionId: currentMember.positionId,
        userType: currentMember.userType
      },
      after: {
        roleId: role.id,
        areaId: selectedArea.id,
        localityId: selectedLocalityId ?? null,
        localityIds: selectedLocalityIds,
        positionId: selectedPositionId,
        userType: selectedUserType
      }
    }
  });

  emitRealtimeEvent({
    type: "workspace.member_updated",
    workspaceId,
    actorId: userId,
    title: "Miembro actualizado",
    message: `${member.user.name} tiene nuevos accesos.`
  });

  res.json({ member });
}

export async function approveWorkspaceMember(req: Request, res: Response) {
  const userId = req.auth!.userId;
  const workspaceId = getParam(req, "workspaceId");
  const memberId = getParam(req, "memberId");
  const scope = await getMemberManagementScope(userId, workspaceId);

  const pendingMember = await prisma.workspaceMember.findFirst({
    where: {
      id: memberId,
      workspaceId
    },
    include: {
      user: {
        select: {
          id: true,
          name: true,
          email: true,
          avatarUrl: true,
          isActive: true
        }
      },
      localityScopes: {
        select: {
          localityId: true
        },
        orderBy: { createdAt: "asc" }
      }
    }
  });

  if (!pendingMember) {
    throw new AppError(404, "MEMBER_NOT_FOUND", "Workspace member not found.");
  }

  if (pendingMember.status === "SUSPENDED" || pendingMember.status === "REMOVED") {
    throw new AppError(409, "MEMBER_BLOCKED", "Suspended or removed members cannot be approved directly.");
  }

  if (pendingMember.status !== "PENDING_APPROVAL") throw new AppError(409, "MEMBER_ALREADY_PROCESSED", "Esta solicitud ya fue procesada.");
  assertExistingMemberInScope(scope, pendingMember);
  const selectedAreaId = req.body.areaId || pendingMember.areaId;

  if (!selectedAreaId) {
    throw new AppError(400, "MEMBER_AREA_REQUIRED", "Approved member area is required.");
  }

  if (!scope.canManageWorkspaceMembers && selectedAreaId !== scope.requester.areaId) {
    throw new AppError(403, "AREA_SCOPE_DENIED", "You can only approve members in your area.");
  }

  const selectedArea = await assertAreaBelongsToWorkspace(workspaceId, selectedAreaId);
  const existingLocalityIds = uniqueStrings([
    ...pendingMember.localityScopes.map((localityScope) => localityScope.localityId),
    ...(pendingMember.localityId ? [pendingMember.localityId] : [])
  ]);
  const bodyLocalityIds = readRequestedLocalityIds(req.body);
  const selectedLocalityIds = req.body.localityIds !== undefined || req.body.localityId !== undefined
    ? bodyLocalityIds
    : existingLocalityIds.length > 0
      ? existingLocalityIds
      : readRequestedLocalityIds({}, scope.requester.localityId ?? undefined);
  const selectedLocalityId = primaryLocalityId(selectedLocalityIds);
  assertLocalityScope(scope, selectedLocalityIds);
  const selectedUserType = req.body.userType || pendingMember.userType;
  const selectedRoleId = req.body.roleId || pendingMember.roleId || await resolveDefaultRoleId(workspaceId, selectedUserType);
  await assertRoleGrant(userId, workspaceId, selectedRoleId, selectedUserType);
  const role = await prisma.role.findFirst({
    where: {
      id: selectedRoleId,
      workspaceId
    }
  });

  if (!role) {
    throw new AppError(400, "ROLE_INVALID", "Role does not belong to this workspace.");
  }

  const fallbackPosition = await prisma.position.findFirst({
    where: {
      workspaceId,
      areaId: selectedArea.id,
      name: selectedUserType === "EXTERNAL" ? "Colaborador" : "Colaborador"
    }
  });
  const selectedPositionId = req.body.positionId !== undefined ? req.body.positionId : pendingMember.positionId || fallbackPosition?.id;

  if (selectedPositionId) {
    await assertPositionBelongsToWorkspace(workspaceId, selectedPositionId, selectedArea.id);
  }

  await assertLocalitiesBelongToWorkspace(workspaceId, selectedLocalityIds, selectedArea.id);

  const approvedAt = new Date();
  const member = await prisma.$transaction(async (tx) => {
    const approvedMember = await tx.workspaceMember.update({
      where: {
        id: pendingMember.id, status: "PENDING_APPROVAL", updatedAt: pendingMember.updatedAt
      },
      data: {
        roleId: role.id,
        areaId: selectedArea.id,
        localityId: selectedLocalityId ?? null,
        positionId: selectedPositionId,
        userType: selectedUserType,
        status: "ACTIVE",
        approvedById: userId,
        approvedAt,
        joinedAt: pendingMember.joinedAt || approvedAt
      }
    });

    await syncMemberLocalityScopes(tx, approvedMember.id, selectedLocalityIds);

    return tx.workspaceMember.findUniqueOrThrow({
      where: {
        id: approvedMember.id
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            avatarUrl: true,
            isActive: true
          }
        },
        role: true,
        area: true,
        locality: true,
        localityScopes: {
          include: {
            locality: true
          },
          orderBy: { createdAt: "asc" }
        },
        position: true,
        approvedBy: {
          select: {
            id: true,
            name: true,
            email: true,
            avatarUrl: true
          }
        }
      }
    });
  });

  await prisma.activityLog.create({
    data: {
      workspaceId,
      actorId: userId,
      entityType: "USER",
      entityId: pendingMember.userId,
      action: "user.approved",
      after: {
        userId: pendingMember.userId,
        roleId: role.id,
        areaId: selectedArea.id,
        localityId: selectedLocalityId ?? null,
        localityIds: selectedLocalityIds,
        positionId: selectedPositionId,
        userType: selectedUserType
      }
    }
  });

  emitRealtimeEvent({
    type: "workspace.member_approved",
    workspaceId,
    actorId: userId,
    title: "Usuario aprobado",
    message: `${member.user.name} fue aprobado en el workspace.`
  });

  res.json({ member });
}
