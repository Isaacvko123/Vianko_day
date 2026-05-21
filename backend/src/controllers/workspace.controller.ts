import type { Prisma } from "@prisma/client";
import type { Request, Response } from "express";
import { prisma } from "../db/prisma.js";
import { activeRecordFilter } from "../db/filters.js";
import { AppError } from "../utils/app-error.js";
import { assertWorkspaceMember, assertWorkspacePermission, roleHasPermission } from "../services/access-control.service.js";
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

async function getMemberManagementScope(userId: string, workspaceId: string): Promise<MemberManagementScope> {
  const requester = await assertWorkspaceMember(userId, workspaceId);
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

  if (!canManageWorkspaceMembers && !canApproveAreaMembers) {
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

function assertLocalityScope(scope: MemberManagementScope, selectedLocalityIds: string[]) {
  if (scope.canManageWorkspaceMembers || selectedLocalityIds.length === 0 || scope.requesterLocalityIds.length === 0) {
    return;
  }

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

  res.json({
    workspaces: memberships.map((membership) => ({
      ...membership.workspace,
      member: {
        userType: membership.userType,
        status: membership.status,
        role: membership.role,
        area: membership.area,
        locality: membership.locality,
        localityScopes: membership.localityScopes,
        position: membership.position
      }
    }))
  });
}

export async function createWorkspace(req: Request, res: Response) {
  const userId = req.auth!.userId;

  const result = await prisma.$transaction((tx) =>
    bootstrapWorkspaceForOwner(tx, {
      ownerId: userId,
      workspaceName: req.body.name
    })
  );

  res.status(201).json(result);
}

export async function listWorkspaceMembers(req: Request, res: Response) {
  const userId = req.auth!.userId;
  const workspaceId = getParam(req, "workspaceId");

  const scope = await getMemberManagementScope(userId, workspaceId);

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
  const roleId = req.body.roleId || await resolveDefaultRoleId(workspaceId, userType);
  const scope = await getMemberManagementScope(userId, workspaceId);
  const selectedAreaId = req.body.areaId || scope.requester.areaId;
  const selectedLocalityIds = readRequestedLocalityIds(req.body, scope.requester.localityId ?? undefined);
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
        localityId: selectedLocalityId,
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

  await assertWorkspacePermission(userId, workspaceId, "workspace.invite_users");

  const roles = await prisma.role.findMany({
    where: { workspaceId },
    orderBy: { name: "asc" }
  });

  res.json({ roles });
}

export async function listWorkspaceAreas(req: Request, res: Response) {
  const userId = req.auth!.userId;
  const workspaceId = getParam(req, "workspaceId");

  const requester = await assertWorkspaceMember(userId, workspaceId);
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

  const area = await prisma.area.upsert({
    where: {
      workspaceId_name: {
        workspaceId,
        name: req.body.name
      }
    },
    update: {
      description: req.body.description
    },
    create: {
      workspaceId,
      name: req.body.name,
      description: req.body.description
    }
  });

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

  const existingLocality = await prisma.locality.findFirst({
    where: {
      workspaceId,
      areaId: selectedAreaId,
      code: req.body.code
    }
  });

  const locality = existingLocality
    ? await prisma.locality.update({
      where: {
        id: existingLocality.id
      },
      data: {
        name: req.body.name,
        description: req.body.description
      },
      include: {
        area: true
      }
    })
    : await prisma.locality.create({
      data: {
        workspaceId,
        areaId: selectedAreaId,
        name: req.body.name,
        code: req.body.code,
        description: req.body.description
      },
      include: {
        area: true
      }
    });

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

  const position = await prisma.position.upsert({
    where: {
      workspaceId_areaId_name: {
        workspaceId,
        areaId: selectedAreaId,
        name: req.body.name
      }
    },
    update: {
      description: req.body.description,
      isManager: req.body.isManager
    },
    create: {
      workspaceId,
      areaId: selectedAreaId,
      name: req.body.name,
      description: req.body.description,
      isManager: req.body.isManager
    },
    include: {
      area: true
    }
  });

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
  const selectedLocalityIds = bodyLocalityIds.length > 0 ? bodyLocalityIds : existingLocalityIds;
  const selectedLocalityId = primaryLocalityId(selectedLocalityIds);
  assertLocalityScope(scope, selectedLocalityIds);
  await assertLocalitiesBelongToWorkspace(workspaceId, selectedLocalityIds, selectedArea.id);

  const selectedUserType = req.body.userType || currentMember.userType;
  const selectedRoleId = req.body.roleId || currentMember.roleId || await resolveDefaultRoleId(workspaceId, selectedUserType);
  const role = await prisma.role.findFirst({
    where: {
      id: selectedRoleId,
      workspaceId
    }
  });

  if (!role) {
    throw new AppError(400, "ROLE_INVALID", "Role does not belong to this workspace.");
  }

  const selectedPositionId = req.body.positionId || currentMember.positionId;
  if (selectedPositionId) {
    await assertPositionBelongsToWorkspace(workspaceId, selectedPositionId, selectedArea.id);
  }

  const member = await prisma.$transaction(async (tx) => {
    const updatedMember = await tx.workspaceMember.update({
      where: { id: currentMember.id },
      data: {
        roleId: role.id,
        areaId: selectedArea.id,
        localityId: selectedLocalityId,
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
        localityId: selectedLocalityId,
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
  const selectedLocalityIds = bodyLocalityIds.length > 0
    ? bodyLocalityIds
    : existingLocalityIds.length > 0
      ? existingLocalityIds
      : readRequestedLocalityIds({}, scope.requester.localityId ?? undefined);
  const selectedLocalityId = primaryLocalityId(selectedLocalityIds);
  assertLocalityScope(scope, selectedLocalityIds);
  const selectedUserType = req.body.userType || pendingMember.userType;
  const selectedRoleId = req.body.roleId || pendingMember.roleId || await resolveDefaultRoleId(workspaceId, selectedUserType);
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
  const selectedPositionId = req.body.positionId || pendingMember.positionId || fallbackPosition?.id;

  if (selectedPositionId) {
    await assertPositionBelongsToWorkspace(workspaceId, selectedPositionId, selectedArea.id);
  }

  await assertLocalitiesBelongToWorkspace(workspaceId, selectedLocalityIds, selectedArea.id);

  const approvedAt = new Date();
  const member = await prisma.$transaction(async (tx) => {
    const approvedMember = await tx.workspaceMember.update({
      where: {
        id: pendingMember.id
      },
      data: {
        roleId: role.id,
        areaId: selectedArea.id,
        localityId: selectedLocalityId,
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
        localityId: selectedLocalityId,
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
