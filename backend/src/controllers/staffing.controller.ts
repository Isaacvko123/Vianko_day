import { StaffingRequestStatus, type Prisma } from "@prisma/client";
import type { Request, Response } from "express";
import { activeRecordFilter } from "../db/filters.js";
import { prisma } from "../db/prisma.js";
import {
  assertProjectPermission,
  assertWorkspaceMember,
  roleHasPermission
} from "../services/access-control.service.js";
import { emitRealtimeEvent } from "../services/realtime.service.js";
import { AppError } from "../utils/app-error.js";
import { auditJson } from "../utils/audit-json.js";
import { getParam, getQueryString } from "../utils/request.js";

const userSelect = {
  id: true,
  name: true,
  email: true,
  avatarUrl: true
} as const;

const staffingRequestInclude = {
  project: {
    include: {
      area: true,
      locality: true
    }
  },
  requester: {
    select: userSelect
  },
  responder: {
    select: userSelect
  },
  sourceArea: true,
  targetArea: true,
  targetLocality: true,
  position: true,
  role: true,
  requestedUser: {
    select: userSelect
  },
  assignments: {
    include: {
      user: {
        select: userSelect
      }
    },
    orderBy: {
      createdAt: "asc"
    }
  }
} satisfies Prisma.ProjectStaffingRequestInclude;

async function canManageAllStaffing(userId: string, workspaceId: string) {
  const member = await assertWorkspaceMember(userId, workspaceId);
  const canManage =
    (await roleHasPermission(member.roleId ?? undefined, "workspace.manage")) ||
    (await roleHasPermission(member.roleId ?? undefined, "member.manage"));

  return { member, canManage };
}

async function assertArea(workspaceId: string, areaId: string) {
  const area = await prisma.area.findFirst({
    where: {
      id: areaId,
      workspaceId
    }
  });

  if (!area) {
    throw new AppError(400, "AREA_INVALID", "Target area does not belong to this workspace.");
  }

  return area;
}

async function assertLocality(workspaceId: string, localityId: string, areaId?: string) {
  const locality = await prisma.locality.findFirst({
    where: {
      id: localityId,
      workspaceId
    }
  });

  if (!locality) {
    throw new AppError(400, "LOCALITY_INVALID", "Target locality does not belong to this workspace.");
  }

  if (areaId && locality.areaId && locality.areaId !== areaId) {
    throw new AppError(400, "LOCALITY_AREA_INVALID", "Target locality does not belong to the target area.");
  }

  return locality;
}

async function assertPosition(workspaceId: string, positionId: string, areaId: string) {
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
    throw new AppError(400, "POSITION_AREA_INVALID", "Position does not belong to the target area.");
  }

  return position;
}

async function assertRole(workspaceId: string, roleId: string) {
  const role = await prisma.role.findFirst({
    where: {
      id: roleId,
      workspaceId
    }
  });

  if (!role) {
    throw new AppError(400, "ROLE_INVALID", "Role does not belong to this workspace.");
  }

  return role;
}

async function getPendingStaffingRequest(requestId: string) {
  const staffingRequest = await prisma.projectStaffingRequest.findUnique({
    where: {
      id: requestId
    },
    include: staffingRequestInclude
  });

  if (!staffingRequest) {
    throw new AppError(404, "STAFFING_REQUEST_NOT_FOUND", "Staffing request not found.");
  }

  if (staffingRequest.status !== "PENDING") {
    throw new AppError(409, "STAFFING_REQUEST_CLOSED", "Only pending staffing requests can be answered.");
  }

  return staffingRequest;
}

async function assertCanRespond(userId: string, workspaceId: string, targetAreaId: string) {
  const { member, canManage } = await canManageAllStaffing(userId, workspaceId);
  const canRespond = await roleHasPermission(member.roleId ?? undefined, "staffing.respond");

  if (canManage) {
    return member;
  }

  if (!canRespond || member.areaId !== targetAreaId) {
    throw new AppError(403, "STAFFING_RESPONSE_DENIED", "Only the target area manager can answer this request.");
  }

  return member;
}

function uniqueUserIds(userIds: string[]) {
  return [...new Set(userIds)];
}

export async function listStaffingRequests(req: Request, res: Response) {
  const userId = req.auth!.userId;
  const workspaceId = getQueryString(req, "workspaceId");
  const { member, canManage } = await canManageAllStaffing(userId, workspaceId);
  const status = typeof req.query.status === "string" ? req.query.status as StaffingRequestStatus : undefined;
  const personalStaffingFilters: Prisma.ProjectStaffingRequestWhereInput[] = [
    { requesterId: userId },
    {
      project: {
        members: {
          some: { userId }
        }
      }
    }
  ];

  if (member.areaId) {
    personalStaffingFilters.push({ targetAreaId: member.areaId });
  }

  const scopedFilter: Prisma.ProjectStaffingRequestWhereInput = canManage
    ? {}
    : {
      OR: personalStaffingFilters
    };

  const staffingRequests = await prisma.projectStaffingRequest.findMany({
    where: {
      workspaceId,
      status,
      ...scopedFilter
    },
    include: staffingRequestInclude,
    orderBy: {
      createdAt: "desc"
    }
  });

  res.json({ staffingRequests });
}

export async function createStaffingRequest(req: Request, res: Response) {
  const userId = req.auth!.userId;
  const {
    projectId,
    targetAreaId,
    targetLocalityId,
    positionId,
    roleId,
    requestedUserId,
    quantity,
    note
  } = req.body;
  const { project, workspaceMember } = await assertProjectPermission(userId, projectId, "project.request_staffing");

  await assertArea(project.workspaceId, targetAreaId);

  if (targetLocalityId) {
    await assertLocality(project.workspaceId, targetLocalityId, targetAreaId);
  }

  if (positionId) {
    await assertPosition(project.workspaceId, positionId, targetAreaId);
  }

  if (roleId) {
    await assertRole(project.workspaceId, roleId);
  }

  if (requestedUserId) {
    const requestedMember = await prisma.workspaceMember.findUnique({
      where: {
        workspaceId_userId: {
          workspaceId: project.workspaceId,
          userId: requestedUserId
        }
      },
      include: {
        localityScopes: {
          select: {
            localityId: true
          }
        }
      }
    });
    const requestedMemberLocalityIds = requestedMember
      ? [
        ...(requestedMember.localityId ? [requestedMember.localityId] : []),
        ...requestedMember.localityScopes.map((localityScope) => localityScope.localityId)
      ]
      : [];

    if (
      !requestedMember ||
      requestedMember.status !== "ACTIVE" ||
      requestedMember.areaId !== targetAreaId ||
      (targetLocalityId && !requestedMemberLocalityIds.includes(targetLocalityId))
    ) {
      throw new AppError(400, "REQUESTED_USER_INVALID", "Requested user must be active in the target area/locality.");
    }
  }

  const staffingRequest = await prisma.$transaction(async (tx) => {
    const createdRequest = await tx.projectStaffingRequest.create({
      data: {
        workspaceId: project.workspaceId,
        projectId: project.id,
        requesterId: userId,
        sourceAreaId: workspaceMember.areaId,
        targetAreaId,
        targetLocalityId,
        positionId,
        roleId,
        requestedUserId,
        quantity,
        note
      },
      include: staffingRequestInclude
    });

    await tx.activityLog.create({
      data: {
        workspaceId: project.workspaceId,
        projectId: project.id,
        actorId: userId,
        entityType: "STAFFING_REQUEST",
        entityId: createdRequest.id,
        action: "staffing.requested",
        after: auditJson({
          targetAreaId,
          targetLocalityId,
          positionId,
          requestedUserId,
          quantity
        })
      }
    });

    return createdRequest;
  });

  emitRealtimeEvent({
    type: "staffing.requested",
    workspaceId: staffingRequest.workspaceId,
    projectId: staffingRequest.projectId,
    actorId: userId,
    title: "Solicitud de personal",
    message: `Se solicito apoyo para ${staffingRequest.project.name}.`
  });

  res.status(201).json({ staffingRequest });
}

export async function approveStaffingRequest(req: Request, res: Response) {
  const userId = req.auth!.userId;
  const requestId = getParam(req, "requestId");
  const staffingRequest = await getPendingStaffingRequest(requestId);
  await assertCanRespond(userId, staffingRequest.workspaceId, staffingRequest.targetAreaId);

  const approvedUserIds = uniqueUserIds(req.body.approvedUserIds);
  const activeMembers = await prisma.workspaceMember.findMany({
    where: {
      workspaceId: staffingRequest.workspaceId,
      userId: { in: approvedUserIds },
      status: "ACTIVE",
      areaId: staffingRequest.targetAreaId
    },
    include: {
      localityScopes: {
        select: {
          localityId: true
        }
      }
    }
  });
  const validActiveMembers = activeMembers.filter((member) => {
    if (!staffingRequest.targetLocalityId) {
      return true;
    }

    const memberLocalityIds = [
      ...(member.localityId ? [member.localityId] : []),
      ...member.localityScopes.map((localityScope) => localityScope.localityId)
    ];

    return memberLocalityIds.includes(staffingRequest.targetLocalityId);
  });
  const activeMemberByUserId = new Map(validActiveMembers.map((member) => [member.userId, member]));

  if (activeMemberByUserId.size !== approvedUserIds.length) {
    throw new AppError(400, "APPROVED_USERS_INVALID", "All approved users must be active in the target area/locality.");
  }

  const answeredAt = new Date();
  const updatedRequest = await prisma.$transaction(async (tx) => {
    for (const approvedUserId of approvedUserIds) {
      const approvedMember = activeMemberByUserId.get(approvedUserId);

      await tx.projectMember.upsert({
        where: {
          projectId_userId: {
            projectId: staffingRequest.projectId,
            userId: approvedUserId
          }
        },
        update: {
          roleId: staffingRequest.roleId || approvedMember?.roleId
        },
        create: {
          projectId: staffingRequest.projectId,
          userId: approvedUserId,
          roleId: staffingRequest.roleId || approvedMember?.roleId
        }
      });

      await tx.projectStaffingAssignment.upsert({
        where: {
          requestId_userId: {
            requestId: staffingRequest.id,
            userId: approvedUserId
          }
        },
        update: {},
        create: {
          requestId: staffingRequest.id,
          userId: approvedUserId,
          assignedById: userId
        }
      });
    }

    const request = await tx.projectStaffingRequest.update({
      where: {
        id: staffingRequest.id
      },
      data: {
        status: "APPROVED",
        respondedById: userId,
        respondedAt: answeredAt,
        responseNote: req.body.responseNote
      },
      include: staffingRequestInclude
    });

    await tx.activityLog.create({
      data: {
        workspaceId: staffingRequest.workspaceId,
        projectId: staffingRequest.projectId,
        actorId: userId,
        entityType: "STAFFING_REQUEST",
        entityId: staffingRequest.id,
        action: "staffing.approved",
        after: auditJson({
          approvedUserIds,
          responseNote: req.body.responseNote
        })
      }
    });

    return request;
  });

  emitRealtimeEvent({
    type: "staffing.approved",
    workspaceId: updatedRequest.workspaceId,
    projectId: updatedRequest.projectId,
    actorId: userId,
    title: "Solicitud aprobada",
    message: `Se aprobo apoyo para ${updatedRequest.project.name}.`
  });

  res.json({ staffingRequest: updatedRequest });
}

export async function rejectStaffingRequest(req: Request, res: Response) {
  const userId = req.auth!.userId;
  const requestId = getParam(req, "requestId");
  const staffingRequest = await getPendingStaffingRequest(requestId);
  await assertCanRespond(userId, staffingRequest.workspaceId, staffingRequest.targetAreaId);

  const answeredAt = new Date();
  const updatedRequest = await prisma.$transaction(async (tx) => {
    const request = await tx.projectStaffingRequest.update({
      where: {
        id: staffingRequest.id
      },
      data: {
        status: "REJECTED",
        respondedById: userId,
        respondedAt: answeredAt,
        responseNote: req.body.responseNote
      },
      include: staffingRequestInclude
    });

    await tx.activityLog.create({
      data: {
        workspaceId: staffingRequest.workspaceId,
        projectId: staffingRequest.projectId,
        actorId: userId,
        entityType: "STAFFING_REQUEST",
        entityId: staffingRequest.id,
        action: "staffing.rejected",
        after: auditJson({
          responseNote: req.body.responseNote
        })
      }
    });

    return request;
  });

  emitRealtimeEvent({
    type: "staffing.rejected",
    workspaceId: updatedRequest.workspaceId,
    projectId: updatedRequest.projectId,
    actorId: userId,
    title: "Solicitud rechazada",
    message: `Se rechazo apoyo para ${updatedRequest.project.name}.`
  });

  res.json({ staffingRequest: updatedRequest });
}
