import { listTaskPeople } from '../services/task-people.service.js';
import { effectivePermissions } from "../models/business-policy.js";
import type { Prisma } from "@prisma/client";
import type { Request, Response } from "express";
import { prisma } from "../db/prisma.js";
import { activeRecordFilter } from "../db/filters.js";
import {
  projectVisibilityFilter,
  assertRoleGrant,
  getRolePermissions,
  assertProjectAccess,
  assertProjectPermission,
  assertWorkspaceMember,
  assertWorkspacePermission,
  getWorkspaceMemberLocalityIds,
  roleHasPermission
} from "../services/access-control.service.js";
import { emitRealtimeEvent } from "../services/realtime.service.js";
import { AppError } from "../utils/app-error.js";
import { createDefaultBoard } from "../services/workspace-bootstrap.service.js";
import { getParam, getQueryString } from "../utils/request.js";

async function assertProjectAreaScope(input: {
  workspaceId: string;
  requesterAreaId?: string;
  requesterLocalityId?: string;
  requesterLocalityIds?: string[];
  requesterRoleId?: string;
  areaId?: string;
  localityId?: string | null;
}) {
  const selectedAreaId = input.areaId || input.requesterAreaId;
  const selectedLocalityId = input.localityId !== undefined ? input.localityId : input.areaId && input.areaId !== input.requesterAreaId ? null : input.requesterLocalityId;
  const requesterLocalityIds = input.requesterLocalityIds ?? (input.requesterLocalityId ? [input.requesterLocalityId] : []);

  if (!selectedAreaId) {
    throw new AppError(400, "PROJECT_AREA_REQUIRED", "Project area is required.");
  }

  const canManageAcrossWorkspace =
    (await roleHasPermission(input.requesterRoleId, "project.view_all")) ||
    (await roleHasPermission(input.requesterRoleId, "area.manage"));

  if (input.areaId && input.areaId !== input.requesterAreaId && !canManageAcrossWorkspace) {
    throw new AppError(403, "AREA_SCOPE_DENIED", "You can only manage projects in your area.");
  }

  if (
    requesterLocalityIds.length > 0 &&
    (!selectedLocalityId || !requesterLocalityIds.includes(selectedLocalityId)) &&
    !canManageAcrossWorkspace
  ) {
    throw new AppError(403, "LOCALITY_SCOPE_DENIED", "You can only manage projects in your assigned locality.");
  }

  const projectArea = await prisma.area.findFirst({
    where: {
      id: selectedAreaId,
      workspaceId: input.workspaceId
    }
  });

  if (!projectArea) {
    throw new AppError(400, "AREA_INVALID", "Area does not belong to this workspace.");
  }

  if (selectedLocalityId) {
    const projectLocality = await prisma.locality.findFirst({
      where: {
        id: selectedLocalityId,
        workspaceId: input.workspaceId
      }
    });

    if (!projectLocality) {
      throw new AppError(400, "LOCALITY_INVALID", "Locality does not belong to this workspace.");
    }

    if (projectLocality.areaId && projectLocality.areaId !== projectArea.id) {
      throw new AppError(400, "LOCALITY_AREA_INVALID", "Locality does not belong to the selected area.");
    }
  }

  return { selectedAreaId: projectArea.id, selectedLocalityId };
}

export async function listProjects(req: Request, res: Response) {
  const userId = req.auth!.userId;
  const workspaceId = getQueryString(req, "workspaceId");
  const workspaceMembership = await assertWorkspaceMember(userId, workspaceId);
  const visibilityFilter = await projectVisibilityFilter(userId, workspaceMembership);

  const projects = await prisma.project.findMany({
    where: {
      workspaceId,
      ...activeRecordFilter,
      ...visibilityFilter
    },
    include: {
      area: true,
      locality: true,
      members: {
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              avatarUrl: true
            }
          },
          role: true
        }
      }
    },
    orderBy: {
      createdAt: "asc"
    }
  });

  const workspacePermissions = await getRolePermissions(workspaceMembership.roleId ?? undefined, workspaceId);
  res.json({ projects: await Promise.all(projects.map(async (project) => {
    const roleId = project.members.find((member) => member.userId === userId)?.roleId;
    return { ...project, permissions: effectivePermissions(workspacePermissions,
      roleId ? await getRolePermissions(roleId, workspaceId) : undefined, workspaceMembership.userType) };
  })) });
}

export async function createProject(req: Request, res: Response) {
  const userId = req.auth!.userId;
  const { workspaceId, areaId, localityId, name, description, visibility, color, startDate, endDate } = req.body;

  const workspaceMembership = await assertWorkspacePermission(userId, workspaceId, "project.create");
  if (startDate && endDate && new Date(startDate) > new Date(endDate)) throw new AppError(400, "PROJECT_DATES_INVALID", "La entrega debe ser posterior al inicio.");
  const requesterLocalityIds = await getWorkspaceMemberLocalityIds(workspaceMembership);
  const { selectedAreaId, selectedLocalityId } = await assertProjectAreaScope({
    workspaceId,
    requesterAreaId: workspaceMembership.areaId ?? undefined,
    requesterLocalityId: workspaceMembership.localityId ?? undefined,
    requesterLocalityIds,
    requesterRoleId: workspaceMembership.roleId ?? undefined,
    areaId,
    localityId
  });

  const result = await prisma.$transaction(async (tx) => {
    const project = await tx.project.create({
      data: {
        workspaceId,
        areaId: selectedAreaId,
        localityId: selectedLocalityId,
        name,
        description,
        visibility,
        color,
        startDate: startDate ? new Date(startDate) : undefined,
        endDate: endDate ? new Date(endDate) : undefined,
        createdById: userId
      }
    });

    const creatorWorkspaceMembership = await tx.workspaceMember.findUnique({
      where: {
        workspaceId_userId: {
          workspaceId,
          userId
        }
      }
    });

    await tx.projectMember.create({
      data: {
        projectId: project.id,
        userId,
        roleId: undefined
      }
    });

    const board = await createDefaultBoard(tx, workspaceId, project.id);

    await tx.activityLog.create({
      data: {
        workspaceId,
        projectId: project.id,
        actorId: userId,
        entityType: "PROJECT",
        entityId: project.id,
        action: "project.created",
        after: {
          name,
          areaId: selectedAreaId,
          localityId: selectedLocalityId,
          visibility,
          boardId: board.id
        }
      }
    });

    return { project, board };
  });

  emitRealtimeEvent({
    type: "project.created",
    workspaceId,
    projectId: result.project.id,
    actorId: userId,
    recipientUserIds: [userId],
    visibility: "recipients",
    title: "Proyecto creado",
    message: `Se creo el proyecto ${result.project.name}.`
  });

  res.status(201).json(result);
}

export async function getProject(req: Request, res: Response) {
  const userId = req.auth!.userId;
  const projectId = getParam(req, "projectId");
  const { project, permissions } = await assertProjectAccess(userId, projectId);

  const fullProject = await prisma.project.findUnique({
    where: { id: project.id },
    include: {
      boards: {
        where: activeRecordFilter,
        include: {
          statuses: {
            orderBy: { position: "asc" }
          }
        },
        orderBy: { position: "asc" }
      },
      area: true,
      locality: true,
      members: {
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              avatarUrl: true
            }
          },
          role: true
        }
      }
    }
  });

  res.json({ project: { ...fullProject, permissions } });
}

export async function updateProject(req: Request, res: Response) {
  const userId = req.auth!.userId;
  const projectId = getParam(req, "projectId");
  const { project, workspaceMember } = await assertProjectPermission(userId, projectId, "project.update");
  const requesterLocalityIds = await getWorkspaceMemberLocalityIds(workspaceMember);
  const { selectedAreaId, selectedLocalityId } = await assertProjectAreaScope({
    workspaceId: project.workspaceId,
    requesterAreaId: workspaceMember.areaId ?? undefined,
    requesterLocalityId: workspaceMember.localityId ?? undefined,
    requesterLocalityIds,
    requesterRoleId: workspaceMember.roleId ?? undefined,
    areaId: req.body.areaId ?? project.areaId ?? undefined,
    localityId: req.body.localityId !== undefined ? req.body.localityId : project.localityId
  });

  const nextStart = req.body.startDate === null ? null : req.body.startDate ? new Date(req.body.startDate) : project.startDate;
  const nextEnd = req.body.endDate === null ? null : req.body.endDate ? new Date(req.body.endDate) : project.endDate;
  if (nextStart && nextEnd && nextStart > nextEnd) throw new AppError(400, "PROJECT_DATES_INVALID", "La entrega debe ser posterior al inicio.");
  const updatedProject = await prisma.project.update({
    where: { id: project.id, updatedAt: req.body.expectedUpdatedAt ? new Date(req.body.expectedUpdatedAt) : project.updatedAt },
    data: {
      areaId: selectedAreaId,
      localityId: selectedLocalityId,
      name: req.body.name,
      description: req.body.description,
      visibility: req.body.visibility,
      color: req.body.color,
      startDate: nextStart,
      endDate: nextEnd
    },
    include: {
      area: true,
      locality: true,
      members: {
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              avatarUrl: true
            }
          },
          role: true
        }
      }
    }
  });

  await prisma.activityLog.create({
    data: {
      workspaceId: project.workspaceId,
      projectId: project.id,
      actorId: userId,
      entityType: "PROJECT",
      entityId: project.id,
      action: "project.updated",
      before: {
        name: project.name,
        areaId: project.areaId,
        localityId: project.localityId,
        visibility: project.visibility,
        startDate: project.startDate,
        endDate: project.endDate
      },
      after: {
        name: updatedProject.name,
        areaId: updatedProject.areaId,
        localityId: updatedProject.localityId,
        visibility: updatedProject.visibility,
        startDate: updatedProject.startDate,
        endDate: updatedProject.endDate
      }
    }
  });

  emitRealtimeEvent({
    type: "project.updated",
    workspaceId: project.workspaceId,
    projectId: project.id,
    actorId: userId,
    title: "Proyecto actualizado",
    message: `Se actualizo el proyecto ${updatedProject.name}.`
  });

  res.json({ project: { ...updatedProject, permissions: (await assertProjectAccess(userId, projectId)).permissions } });
}

async function getProjectArchiveRecipientUserIds(project: {
  id: string;
  workspaceId: string;
  areaId?: string | null;
}) {
  const recipients = await prisma.workspaceMember.findMany({
    where: {
      workspaceId: project.workspaceId,
      status: "ACTIVE",
      OR: [
        {
          user: {
            projectMembers: {
              some: {
                projectId: project.id
              }
            }
          }
        },
        {
          role: {
            permissions: {
              some: {
                permission: {
                  key: "workspace.manage"
                }
              }
            }
          }
        },
        {
          areaId: project.areaId ?? undefined,
          role: {
            permissions: {
              some: {
                permission: {
                  key: "project.view_all"
                }
              }
            }
          }
        }
      ]
    },
    select: {
      userId: true
    }
  });

  return [...new Set(recipients.map((recipient) => recipient.userId))];
}

export async function archiveProject(req: Request, res: Response) {
  const userId = req.auth!.userId;
  const projectId = getParam(req, "projectId");
  const { project } = await assertProjectPermission(userId, projectId, "project.delete");
  const archiveDate = new Date();
  const recipientUserIds = await getProjectArchiveRecipientUserIds(project);

  const archivedProject = await prisma.$transaction(async (tx) => {
    const updatedProject = await tx.project.update({
      where: {
        id: project.id
      },
      data: {
        archivedAt: archiveDate,
        deletedAt: archiveDate
      },
      include: {
        area: true,
        locality: true,
        members: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                email: true,
                avatarUrl: true
              }
            },
            role: true
          }
        }
      }
    });

    await tx.activityLog.create({
      data: {
        workspaceId: project.workspaceId,
        projectId: project.id,
        actorId: userId,
        entityType: "PROJECT",
        entityId: project.id,
        action: "project.archived",
        before: {
          name: project.name,
          archivedAt: project.archivedAt,
          deletedAt: project.deletedAt
        },
        after: {
          name: project.name,
          archivedAt: archiveDate,
          deletedAt: archiveDate
        }
      }
    });

    return updatedProject;
  });

  emitRealtimeEvent({
    type: "project.archived",
    workspaceId: project.workspaceId,
    projectId: project.id,
    actorId: userId,
    recipientUserIds,
    visibility: "recipients",
    title: "Proyecto archivado",
    message: `Se archivo el proyecto ${project.name}.`
  });

  res.json({ project: archivedProject });
}

export async function addProjectMember(req: Request, res: Response) {
  const userId = req.auth!.userId;
  const projectId = getParam(req, "projectId");
  const { userId: targetUserId, roleId } = req.body;
  const { project } = await assertProjectPermission(userId, projectId, "project.manage_members");
  const requesterWorkspaceMembership = await assertWorkspaceMember(userId, project.workspaceId);
  const canManageAllProjectMembers = await roleHasPermission(requesterWorkspaceMembership.roleId ?? undefined, "project.view_all");

  const targetWorkspaceMembership = await prisma.workspaceMember.findUnique({
    where: {
      workspaceId_userId: {
        workspaceId: project.workspaceId,
        userId: targetUserId
      }
    }
  });

  if (!targetWorkspaceMembership || targetWorkspaceMembership.status !== "ACTIVE") {
    throw new AppError(400, "MEMBER_INVALID", "User is not an active workspace member.");
  }

  if (!canManageAllProjectMembers && targetWorkspaceMembership.areaId !== project.areaId) {
    throw new AppError(403, "PROJECT_MEMBER_AREA_DENIED", "Managers can only add users from their project area.");
  }

  const targetLocalityIds = await getWorkspaceMemberLocalityIds(targetWorkspaceMembership);
  if (
    !canManageAllProjectMembers &&
    project.localityId &&
    targetLocalityIds.length > 0 &&
    !targetLocalityIds.includes(project.localityId)
  ) {
    throw new AppError(403, "PROJECT_MEMBER_LOCALITY_DENIED", "Managers can only add users from the project locality scope.");
  }

  if (roleId) {
    await assertRoleGrant(userId, project.workspaceId, roleId, targetWorkspaceMembership.userType);
    const role = await prisma.role.findFirst({
      where: {
        id: roleId,
        workspaceId: project.workspaceId
      }
    });

    if (!role) {
      throw new AppError(400, "ROLE_INVALID", "Role does not belong to this workspace.");
    }
  }

  const projectMembership = await prisma.projectMember.upsert({
    where: {
      projectId_userId: {
        projectId,
        userId: targetUserId
      }
    },
    update: {
      roleId
    },
    create: {
      projectId,
      userId: targetUserId,
      roleId
    },
    include: {
      user: {
        select: {
          id: true,
          name: true,
          email: true,
          avatarUrl: true
        }
      },
      role: true
    }
  });

  await prisma.activityLog.create({
    data: {
      workspaceId: project.workspaceId,
      projectId: project.id,
      actorId: userId,
      entityType: "PROJECT",
      entityId: project.id,
      action: "project.member_added",
      after: {
        userId: targetUserId,
        roleId
      }
    }
  });

  emitRealtimeEvent({
    type: "project.member_added",
    workspaceId: project.workspaceId,
    projectId: project.id,
    actorId: userId,
    recipientUserIds: [targetUserId],
    visibility: "project",
    title: "Miembro agregado",
    message: `${projectMembership.user.name} fue agregado a ${project.name}.`
  });

  res.status(201).json({ member: projectMembership });
}

export async function getTaskPeople(req: Request, res: Response) {
  const access = await assertProjectPermission(req.auth!.userId, getParam(req, "projectId"), "task.assign");
  res.json({ people: await listTaskPeople(access) });
}
