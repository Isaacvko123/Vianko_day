import { enrollTaskPeople, taskPeopleWhere } from '../services/task-people.service.js';
import { canManageProjectTasks } from "../models/business-policy.js";
import { Prisma } from "@prisma/client";
import { assertTaskDateRange, resolveTaskPlanning } from "../services/task-planning.service.js";
import type { Request, Response } from "express";
import { prisma } from "../db/prisma.js";
import { activeRecordFilter } from "../db/filters.js";
import { clearNullableTimestamp } from "../db/nullable-values.js";
import { AppError } from "../utils/app-error.js";
import { assertProjectPermission, assertTaskPermission, assertTaskStatusChangePermission, capabilitiesForTask, canSeeInternalComments, roleHasPermission } from "../services/access-control.service.js";
import { emitRealtimeEvent } from "../services/realtime.service.js";
import { auditJson } from "../utils/audit-json.js";
import { decryptText, encryptText } from "../utils/crypto.js";
import { getParam } from "../utils/request.js";

const completedTaskActiveWindowDays = 1;

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isInternalCommentEvent(action: string, after: unknown) {
  return action === "comment.created" && isObjectRecord(after) && after.isInternal === true;
}

async function assertTaskCanStillBeEdited(task: { completedAt: Date | undefined }, roleId: string | undefined) {
  if (!task.completedAt) {
    return;
  }

  const isWorkspaceAdmin = await roleHasPermission(roleId, "workspace.manage");

  if (!isWorkspaceAdmin) {
    throw new AppError(403, "TASK_COMPLETED_LOCKED", "Completed tasks are locked. Only admin can edit them.");
  }
}

async function assertCompletedTaskCanBeReopened(task: { completedAt: Date | undefined }, roleId: string | undefined, targetCountsAsDone: boolean) {
  if (!task.completedAt || targetCountsAsDone) {
    return;
  }

  const canManageWorkspace = await roleHasPermission(roleId, "workspace.manage");
  const canReopenCompletedTasks = await roleHasPermission(roleId, "task.reopen");

  if (!canManageWorkspace && !canReopenCompletedTasks) {
    throw new AppError(403, "TASK_REOPEN_DENIED", "Only admin or area managers can reopen completed tasks.");
  }
}

function getCompletedTaskVisibilityCutoff() {
  return new Date(Date.now() - completedTaskActiveWindowDays * 24 * 60 * 60 * 1000);
}

function parseOptionalDate(value?: string) {
  if (!value) {
    return undefined;
  }

  return new Date(value);
}

async function getBoardAndAuthorizeTaskOperation(
  boardId: string,
  userId: string,
  permission: "task.view_all" | "task.create"
) {
  const board = await prisma.board.findFirst({
    where: {
      id: boardId,
      ...activeRecordFilter
    },
    include: {
      project: true,
      statuses: true
    }
  });

  if (!board) {
    throw new AppError(404, "BOARD_NOT_FOUND", "Board not found.");
  }

  const access = await assertProjectPermission(userId, board.projectId, permission);
  return { ...board, access };
}

type BoardForTaskOperation = Awaited<ReturnType<typeof getBoardAndAuthorizeTaskOperation>>;

function getUniqueAssigneeIds(assigneeIds: string[] | undefined) {
  return [...new Set<string>(assigneeIds ?? [])];
}

async function assertParentTaskBelongsToSameProject(board: BoardForTaskOperation, userId: string, parentTaskId?: string) {
  if (!parentTaskId) {
    return;
  }

  const parentTask = await prisma.task.findFirst({
    where: {
      id: parentTaskId,
      workspaceId: board.workspaceId,
      projectId: board.projectId,
      boardId: board.id,
      parentTaskId: null,
      completedAt: null,
      ...activeRecordFilter
    }
  });

  if (!parentTask) {
    throw new AppError(400, "PARENT_TASK_INVALID", "La tarea principal debe estar abierta, en el mismo tablero y no ser una subtarea.");
  }
  await assertTaskPermission(userId, parentTaskId, "task.create");
}


async function assertMentionedUserBelongsToWorkspace(workspaceId: string, targetUserId: string) {
  const workspaceMembership = await prisma.workspaceMember.findUnique({
    where: {
      workspaceId_userId: {
        workspaceId,
        userId: targetUserId
      }
    }, include: { user: { select: { isActive: true } } }
  });

  if (!workspaceMembership || workspaceMembership.status !== "ACTIVE" || !workspaceMembership.user.isActive) {
    throw new AppError(400, "MENTION_USER_INVALID", "Mentioned user must be an active workspace member.");
  }
}

async function getInternalProjectMemberUserIds(workspaceId: string, projectId: string) {
  const internalMembersWithTaskVisibility = await prisma.workspaceMember.findMany({
    where: {
      workspaceId,
      status: "ACTIVE",
      userType: "INTERNAL",
      OR: [
        {
          user: {
            projectMembers: {
              some: {
                projectId
              }
            }
          }
        },
        {
          role: {
            permissions: {
              some: {
                permission: {
                  key: {
                    in: ["workspace.manage", "project.view_all"]
                  }
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

  return internalMembersWithTaskVisibility.map((member) => member.userId);
}

export async function listTasks(req: Request, res: Response) {
  const userId = req.auth!.userId;
  const boardId = getParam(req, "boardId");
  const { limit, offset, statusId, assigneeId, view } = req.query;
  const taskView = view === "completed" ? "completed" : "active";

  const board = await getBoardAndAuthorizeTaskOperation(boardId, userId, "task.view_all");
  const canSeeEveryTask = canManageProjectTasks(board.access.permissions);
  const stateFilter = taskView === "completed"
    ? {
        OR: [
          { completedAt: { not: clearNullableTimestamp } },
          { status: { countsAsDone: true } }
        ]
      }
    : {
        OR: [
          { status: { countsAsDone: false } },
          { completedAt: { gte: getCompletedTaskVisibilityCutoff() } }
        ]
      };
  const visibilityFilter = canSeeEveryTask
    ? {}
    : {
        OR: [
          { createdById: userId },
          { assignees: { some: { userId } } },
          { mentions: { some: { userId } } }
        ]
      };

  const tasks = await prisma.task.findMany({
    where: {
      boardId,
      ...activeRecordFilter,
      AND: [stateFilter, visibilityFilter],
      statusId: statusId ? String(statusId) : undefined,
      assignees: assigneeId ? { some: { userId: String(assigneeId) } } : undefined
    },
    include: {
      parentTask: { select: { completedAt: true } },
      status: true,
      assignees: {
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              avatarUrl: true
            }
          }
        }
      },
      mentions: {
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              avatarUrl: true
            }
          }
        }
      },
      timeLogs: {
        where: {
          deletedAt: clearNullableTimestamp
        },
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              avatarUrl: true
            }
          }
        },
        orderBy: {
          logDate: "desc"
        }
      },
      _count: {
        select: {
          comments: { where: { deletedAt: null, ...(board.access.workspaceMember.userType === "EXTERNAL" ? { isInternal: false } : {}) } },
          timeLogs: true,
          subtasks: true
        }
      }
    },
    orderBy: taskView === "completed"
      ? [{ completedAt: "desc" }, { updatedAt: "desc" }, { id: "asc" }]
      : [{ dueAt: "asc" }, { createdAt: "desc" }, { id: "asc" }],
    take: limit ? Number(limit) : undefined,
    skip: offset ? Number(offset) : undefined
  });

  res.json({ tasks: tasks.map((task) => ({ ...task, capabilities: capabilitiesForTask(task, userId, board.access, board.statuses) })) });
}

export async function listSubtasks(req: Request, res: Response) {
  const userId = req.auth!.userId;
  const taskId = getParam(req, "taskId");
  const access = await assertTaskPermission(userId, taskId, "task.view_all");
  const { task } = access;

  const subtasks = await prisma.task.findMany({
    where: {
      parentTaskId: task.id,
      ...activeRecordFilter
    },
    include: {
      parentTask: { select: { completedAt: true } },
      status: true,
      assignees: {
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              avatarUrl: true
            }
          }
        }
      },
      mentions: {
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              avatarUrl: true
            }
          }
        }
      },
      timeLogs: {
        where: {
          deletedAt: clearNullableTimestamp
        },
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              avatarUrl: true
            }
          }
        },
        orderBy: {
          logDate: "desc"
        }
      },
      _count: {
        select: {
          comments: { where: { deletedAt: null, ...(access.workspaceMember.userType === "EXTERNAL" ? { isInternal: false } : {}) } },
          timeLogs: true,
          subtasks: true
        }
      }
    },
    orderBy: [
      { completedAt: "asc" },
      { dueAt: "asc" },
      { createdAt: "desc" }
    ]
  });

  res.json({ subtasks: subtasks.map((subtask) => ({ ...subtask, capabilities: capabilitiesForTask({ ...subtask, parentTask: task }, userId, access, task.board.statuses) })).filter((subtask) => subtask.capabilities.canView) });
}

export async function createTask(req: Request, res: Response) {
  const userId = req.auth!.userId;
  const boardId = getParam(req, "boardId");
  const board = await getBoardAndAuthorizeTaskOperation(boardId, userId, "task.create");
  const defaultBoardStatus = board.statuses.find((status) => status.isDefault) ?? board.statuses[0];

  if (!defaultBoardStatus) {
    throw new AppError(400, "BOARD_STATUS_REQUIRED", "Board must have at least one status.");
  }

  const selectedStatusId = req.body.statusId ?? defaultBoardStatus.id;
  const selectedStatus = board.statuses.find((status) => status.id === selectedStatusId);

  if (!selectedStatus) {
    throw new AppError(400, "STATUS_INVALID", "Status does not belong to this board.");
  }

  if (selectedStatus.countsAsDone || selectedStatus.category === "CANCELLED") throw new AppError(400, "INITIAL_STATUS_INVALID", "Crea la tarea en un estado de trabajo; el cierre ocurre después de la revisión.");
  const assigneeIds = getUniqueAssigneeIds(req.body.assigneeIds);

  await assertParentTaskBelongsToSameProject(board, userId, req.body.parentTaskId);
  const eligiblePeople = await taskPeopleWhere(board.access);

  assertTaskDateRange(req.body);
  const initialCompletedAt = selectedStatus.countsAsDone ? new Date() : undefined;

  const task = await prisma.$transaction(async (tx) => {
    await enrollTaskPeople(tx, board.access, assigneeIds, userId, eligiblePeople);
    if (req.body.parentTaskId) {
      const parent = await tx.task.findFirst({ where: { id: req.body.parentTaskId, boardId, deletedAt: null }, include: { status: true } });
      if (!parent || parent.parentTaskId || parent.status.countsAsDone) throw new AppError(409, "PARENT_TASK_CHANGED", "La tarea principal ya no admite subtareas. Revisa su estado.");
    }
    const createdTask = await tx.task.create({
      data: {
        workspaceId: board.workspaceId,
        projectId: board.projectId,
        boardId,
        statusId: selectedStatusId,
        parentTaskId: req.body.parentTaskId,
        title: req.body.title,
        description: req.body.description,
        priority: req.body.priority,
        startAt: parseOptionalDate(req.body.startAt),
        dueAt: parseOptionalDate(req.body.dueAt),
        estimateMinutes: req.body.estimateMinutes,
        completedAt: initialCompletedAt,
        createdById: userId,
        assignees: {
          create: assigneeIds.map((assignedUserId) => ({
            userId: assignedUserId,
            assignedById: userId
          }))
        }
      },
      include: {
        status: true,
        assignees: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                email: true,
                avatarUrl: true
              }
            }
          }
        },
        mentions: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                email: true,
                avatarUrl: true
              }
            }
          }
        },
        _count: {
          select: {
            comments: true,
            timeLogs: true,
            subtasks: true
          }
        }
      }
    });

    await tx.activityLog.create({
      data: {
        workspaceId: board.workspaceId,
        projectId: board.projectId,
        taskId: createdTask.id,
        actorId: userId,
        entityType: "TASK",
        entityId: createdTask.id,
        action: "task.created",
        after: auditJson({
          title: createdTask.title,
          statusId: selectedStatusId,
          assigneeIds
        })
      }
    });

    return createdTask;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

  emitRealtimeEvent({
    type: "task.created",
    workspaceId: board.workspaceId,
    projectId: board.projectId,
    boardId,
    taskId: task.id,
    actorId: userId,
    recipientUserIds: assigneeIds,
    visibility: "project",
    title: req.body.parentTaskId ? "Nueva subtarea" : "Nueva tarea",
    message: req.body.parentTaskId ? `Se creo la subtarea ${task.title}.` : `Se creo la actividad ${task.title}.`
  });

  const access = await assertTaskPermission(userId, task.id, "task.view_all");
  res.status(201).json({ task: { ...task, capabilities: access.capabilities } });
}

export async function updateTask(req: Request, res: Response) {
  const userId = req.auth!.userId;
  const taskId = getParam(req, "taskId");
  const requestedFields = Object.keys(req.body).filter((field) => field !== "expectedUpdatedAt");
  const progressOnlyUpdate = requestedFields.length > 0 && requestedFields.every((field) => field === "progress");
  const requiredPermission = progressOnlyUpdate ? "task.update_progress" : "task.update";
  const { task, workspaceMember } = await assertTaskPermission(userId, taskId, requiredPermission);
  await assertTaskCanStillBeEdited({ completedAt: task.completedAt ?? undefined }, workspaceMember.roleId ?? undefined);

  const taskUpdates = {
    title: req.body.title,
    description: req.body.description,
    priority: req.body.priority,
    ...resolveTaskPlanning(req.body, task),
    progress: req.body.progress
  };

  const updated = await prisma.$transaction(async (tx) => {
    const updatedTask = await tx.task.update({
      where: { id: task.id, updatedAt: req.body.expectedUpdatedAt ? new Date(req.body.expectedUpdatedAt) : task.updatedAt },
      data: taskUpdates,
      include: {
        status: true,
        assignees: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                email: true,
                avatarUrl: true
              }
            }
          }
        },
        mentions: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                email: true,
                avatarUrl: true
              }
            }
          }
        }
      }
    });

    await tx.activityLog.create({
      data: {
        workspaceId: task.workspaceId,
        projectId: task.projectId,
        taskId: task.id,
        actorId: userId,
        entityType: "TASK",
        entityId: task.id,
        action: "task.updated",
        before: auditJson({
          title: task.title,
          description: task.description,
          priority: task.priority,
          startAt: task.startAt,
          dueAt: task.dueAt,
          estimateMinutes: task.estimateMinutes,
          progress: task.progress
        }),
        after: auditJson(taskUpdates)
      }
    });

    return updatedTask;
  }).catch((error: unknown) => {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
      throw new AppError(409, "TASK_UPDATE_CONFLICT", "La tarea cambió mientras la editabas. Actualiza el tablero y revisa los cambios antes de guardar.");
    }
    throw error;
  });

  emitRealtimeEvent({
    type: "task.updated",
    workspaceId: task.workspaceId,
    projectId: task.projectId,
    boardId: task.boardId,
    taskId: task.id,
    actorId: userId,
    title: "Tarea actualizada",
    message: `Se actualizó «${task.title}».`
  });

  const access = await assertTaskPermission(userId, task.id, "task.view_all");
  res.json({ task: { ...updated, capabilities: access.capabilities } });
}

export async function changeTaskStatus(req: Request, res: Response) {
  const userId = req.auth!.userId;
  const taskId = getParam(req, "taskId");
  const { task, workspaceMember, capabilities } = await assertTaskStatusChangePermission(userId, taskId);

  const targetBoardStatus = await prisma.boardStatus.findFirst({
    where: {
      id: req.body.statusId,
      boardId: task.boardId
    }
  });

  if (!targetBoardStatus) {
    throw new AppError(400, "STATUS_INVALID", "Status does not belong to this task board.");
  }

  await assertCompletedTaskCanBeReopened(
    { completedAt: task.completedAt ?? undefined },
    workspaceMember.roleId ?? undefined,
    targetBoardStatus.countsAsDone
  );

  if (!capabilities.allowedStatusIds.includes(targetBoardStatus.id)) {
    throw new AppError(403, "TASK_TRANSITION_DENIED", "Tu rol puede reportar el avance y enviar a revisión. El cierre corresponde a coordinación.");
  }

  // completedAt pertenece al cambio de estado, no a updatedAt.
  // Los reportes de terminado deben confiar en este timestamp.
  const completedAt = targetBoardStatus.countsAsDone ? task.completedAt ?? new Date() : clearNullableTimestamp;
  const auditAction = targetBoardStatus.countsAsDone
    ? "task.completed"
    : task.completedAt
      ? "task.reopened"
      : "task.status_changed";

  const updated = await prisma.$transaction(async (tx) => {
    if (targetBoardStatus.countsAsDone) {
      const pending = await tx.task.count({ where: { parentTaskId: task.id, ...activeRecordFilter,
        status: { countsAsDone: false, category: { not: "CANCELLED" } } } });
      if (pending) throw new AppError(409, "SUBTASKS_PENDING", "Completa o cancela las subtareas pendientes antes de cerrar la tarea principal.");
    }
    const result = await tx.task.update({
    where: { id: task.id, updatedAt: task.updatedAt },
    data: {
      statusId: targetBoardStatus.id,
      completedAt
    },
    include: {
      status: true
    }
  });

  await tx.activityLog.create({
    data: {
      workspaceId: task.workspaceId,
      projectId: task.projectId,
      taskId: task.id,
      actorId: userId,
      entityType: "TASK",
      entityId: task.id,
      action: auditAction,
      before: auditJson({
        statusId: task.statusId,
        completedAt: task.completedAt
      }),
      after: auditJson({
        statusId: targetBoardStatus.id,
        completedAt
      })
    }
  });

    return result;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

  emitRealtimeEvent({
    type: auditAction,
    workspaceId: task.workspaceId,
    projectId: task.projectId,
    boardId: task.boardId,
    taskId: task.id,
    actorId: userId,
    title: targetBoardStatus.countsAsDone ? "Actividad terminada" : task.completedAt ? "Actividad reabierta" : "Estado actualizado",
    message: `${task.title} cambio a ${targetBoardStatus.name}.`
  });

  const access = await assertTaskPermission(userId, task.id, "task.view_all");
  res.json({ task: { ...updated, capabilities: access.capabilities } });
}

export async function addTaskAssignee(req: Request, res: Response) {
  const userId = req.auth!.userId;
  const targetUserId = req.body?.userId;
  const taskId = getParam(req, "taskId");
  const { task, workspaceMember } = await assertTaskPermission(userId, taskId, "task.assign");
  await assertTaskCanStillBeEdited({ completedAt: task.completedAt ?? undefined }, workspaceMember.roleId ?? undefined);

  if (!targetUserId) {
    throw new AppError(400, "ASSIGNEE_REQUIRED", "userId is required.");
  }

  const projectAccess = await assertProjectPermission(userId, task.projectId, 'task.assign');
  const eligiblePeople = await taskPeopleWhere(projectAccess);

  const assignee = await prisma.$transaction(async (tx) => {
    await enrollTaskPeople(tx, projectAccess, [targetUserId], userId, eligiblePeople);
    await tx.task.update({ where: { id: task.id, updatedAt: task.updatedAt }, data: { updatedAt: new Date() } });
  const assignee = await tx.taskAssignee.upsert({
    where: {
      taskId_userId: {
        taskId: task.id,
        userId: targetUserId
      }
    },
    update: {},
    create: {
      taskId: task.id,
      userId: targetUserId,
      assignedById: userId
    }
  });

  await tx.activityLog.create({
    data: {
      workspaceId: task.workspaceId,
      projectId: task.projectId,
      taskId: task.id,
      actorId: userId,
      entityType: "TASK",
      entityId: task.id,
      action: "task.assigned",
      after: auditJson({
        userId: targetUserId
      })
    }
  });

    return assignee;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

  emitRealtimeEvent({
    type: "task.assigned",
    workspaceId: task.workspaceId,
    projectId: task.projectId,
    boardId: task.boardId,
    taskId: task.id,
    actorId: userId,
    recipientUserIds: [targetUserId],
    visibility: "project",
    title: "Responsable asignado",
    message: `Se asignó una persona a «${task.title}».`
  });

  res.status(201).json({ assignee });
}

export async function mentionTaskUser(req: Request, res: Response) {
  const userId = req.auth!.userId;
  const targetUserId = req.body?.userId;
  const taskId = getParam(req, "taskId");
  const { task, workspaceMember } = await assertTaskPermission(userId, taskId, "task.assign");
  await assertTaskCanStillBeEdited({ completedAt: task.completedAt ?? undefined }, workspaceMember.roleId ?? undefined);

  if (!targetUserId) {
    throw new AppError(400, "MENTION_USER_REQUIRED", "userId is required.");
  }

  await assertMentionedUserBelongsToWorkspace(task.workspaceId, targetUserId);
  const mentionedProjectMember = await prisma.projectMember.findUnique({ where: { projectId_userId: { projectId: task.projectId, userId: targetUserId } } });
  if (!mentionedProjectMember) throw new AppError(400, "MENTION_PROJECT_REQUIRED", "Agrega a la persona al proyecto antes de mencionarla.");

  const mention = await prisma.$transaction(async (tx) => {
    await tx.task.update({ where: { id: task.id, updatedAt: task.updatedAt }, data: { updatedAt: new Date() } });
  const mention = await tx.taskMention.upsert({
    where: {
      taskId_userId: {
        taskId: task.id,
        userId: targetUserId
      }
    },
    update: {
      mentionedById: userId
    },
    create: {
      taskId: task.id,
      userId: targetUserId,
      mentionedById: userId
    },
    include: {
      user: {
        select: {
          id: true,
          name: true,
          email: true,
          avatarUrl: true
        }
      }
    }
  });

  await tx.activityLog.create({
    data: {
      workspaceId: task.workspaceId,
      projectId: task.projectId,
      taskId: task.id,
      actorId: userId,
      entityType: "TASK",
      entityId: task.id,
      action: "task.mentioned",
      after: auditJson({
        userId: targetUserId
      })
    }
  });

    return mention;
  });

  emitRealtimeEvent({
    type: "task.mentioned",
    workspaceId: task.workspaceId,
    projectId: task.projectId,
    boardId: task.boardId,
    taskId: task.id,
    actorId: userId,
    recipientUserIds: [targetUserId],
    visibility: "project",
    title: "Seguimiento compartido",
    message: `Se menciono a ${mention.user.name} en ${task.title}.`
  });

  res.status(201).json({ mention });
}

export async function removeTaskAssignee(req: Request, res: Response) {
  const userId = req.auth!.userId;
  const taskId = getParam(req, "taskId");
  const targetUserId = getParam(req, "userId");
  const { task, workspaceMember } = await assertTaskPermission(userId, taskId, "task.assign");
  await assertTaskCanStillBeEdited({ completedAt: task.completedAt ?? undefined }, workspaceMember.roleId ?? undefined);

  await prisma.$transaction(async (tx) => {
    await tx.task.update({ where: { id: task.id, updatedAt: task.updatedAt }, data: { updatedAt: new Date() } });
  await tx.taskAssignee.deleteMany({
    where: {
      taskId: task.id,
      userId: targetUserId
    }
  });

  await tx.activityLog.create({
    data: {
      workspaceId: task.workspaceId,
      projectId: task.projectId,
      taskId: task.id,
      actorId: userId,
      entityType: "TASK",
      entityId: task.id,
      action: "task.unassigned",
      after: auditJson({
        userId: targetUserId
      })
    }
  });

  });

  emitRealtimeEvent({
    type: "task.unassigned",
    workspaceId: task.workspaceId,
    projectId: task.projectId,
    boardId: task.boardId,
    taskId: task.id,
    actorId: userId,
    title: "Responsable retirado",
    message: `Se removio un asignado de ${task.title}.`
  });

  res.status(204).send();
}

export async function listComments(req: Request, res: Response) {
  const userId = req.auth!.userId;
  const taskId = getParam(req, "taskId");
  const showInternal = await canSeeInternalComments(userId, taskId);

  const comments = await prisma.comment.findMany({
    where: {
      taskId,
      ...activeRecordFilter,
      isInternal: showInternal ? undefined : false
    },
    include: {
      user: {
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

  res.json({
    comments: comments.map((comment) => ({
      id: comment.id,
      taskId: comment.taskId,
      userId: comment.userId,
      body: decryptText(comment),
      isInternal: comment.isInternal,
      createdAt: comment.createdAt,
      updatedAt: comment.updatedAt,
      user: comment.user
    }))
  });
}

export async function createComment(req: Request, res: Response) {
  const userId = req.auth!.userId;
  const taskId = getParam(req, "taskId");
  const { task, workspaceMember } = await assertTaskPermission(userId, taskId, "task.comment");
  await assertTaskCanStillBeEdited({ completedAt: task.completedAt ?? undefined }, workspaceMember.roleId ?? undefined);

  if (req.body.isInternal && workspaceMember.userType !== "INTERNAL") {
    throw new AppError(403, "INTERNAL_COMMENT_DENIED", "External users cannot create internal comments.");
  }

  const encryptedBody = encryptText(req.body.body);
  const canCommentWhenClosed = await roleHasPermission(workspaceMember.roleId ?? undefined, "workspace.manage");

  const comment = await prisma.$transaction(async (tx) => {
    const writable = await tx.task.updateMany({ where: { id: task.id, deletedAt: null, ...(canCommentWhenClosed ? {} : { status: { countsAsDone: false, category: { not: 'CANCELLED' } } }) }, data: { updatedAt: new Date() } });
    if (!writable.count) throw new AppError(409, 'TASK_COMMENT_CLOSED', 'La tarea se cerró antes de enviar el mensaje. Tu texto se conserva.');
  const comment = await tx.comment.create({
    data: {
      taskId: task.id,
      userId,
      isInternal: req.body.isInternal,
      ...encryptedBody
    },
    include: {
      user: {
        select: {
          id: true,
          name: true,
          email: true,
          avatarUrl: true
        }
      }
    }
  });

  await tx.activityLog.create({
    data: {
      workspaceId: task.workspaceId,
      projectId: task.projectId,
      taskId: task.id,
      actorId: userId,
      entityType: "COMMENT",
      entityId: comment.id,
      action: "comment.created",
      after: auditJson({
        isInternal: comment.isInternal
      })
    }
  });

    return comment;
  });

  const internalRecipients = comment.isInternal
    ? await getInternalProjectMemberUserIds(task.workspaceId, task.projectId)
    : undefined;

  emitRealtimeEvent({
    type: "comment.created",
    workspaceId: task.workspaceId,
    projectId: task.projectId,
    boardId: task.boardId,
    taskId: task.id,
    actorId: userId,
    recipientUserIds: internalRecipients,
    visibility: comment.isInternal ? "recipients" : "project",
    commentId: comment.id,
    title: comment.isInternal ? "Mensaje interno" : "Nuevo mensaje",
    message: `${comment.user.name} escribió en «${task.title}».`
  });

  res.status(201).json({
    comment: {
      id: comment.id,
      taskId: comment.taskId,
      userId: comment.userId,
      body: req.body.body,
      isInternal: comment.isInternal,
      createdAt: comment.createdAt,
      updatedAt: comment.updatedAt,
      user: comment.user
    }
  });
}

export async function createTimeLog(req: Request, res: Response) {
  const userId = req.auth!.userId;
  const taskId = getParam(req, "taskId");
  const { task, workspaceMember } = await assertTaskPermission(userId, taskId, "task.log_time");
  await assertTaskCanStillBeEdited({ completedAt: task.completedAt ?? undefined }, workspaceMember.roleId ?? undefined);

  const timeLog = await prisma.$transaction(async (tx) => {
    await tx.task.update({ where: { id: task.id, updatedAt: task.updatedAt }, data: { updatedAt: new Date() } });
  const timeLog = await tx.timeLog.create({
    data: {
      taskId: task.id,
      userId,
      minutes: req.body.minutes,
      note: req.body.note,
      logDate: parseOptionalDate(req.body.logDate) ?? new Date(),
      startedAt: parseOptionalDate(req.body.startedAt),
      endedAt: parseOptionalDate(req.body.endedAt)
    },
    include: {
      user: {
        select: {
          id: true,
          name: true,
          email: true,
          avatarUrl: true
        }
      }
    }
  });

  await tx.activityLog.create({
    data: {
      workspaceId: task.workspaceId,
      projectId: task.projectId,
      taskId: task.id,
      actorId: userId,
      entityType: "TIME_LOG",
      entityId: timeLog.id,
      action: "time.logged",
      after: auditJson({
        minutes: timeLog.minutes,
        logDate: timeLog.logDate
      })
    }
  });

    return timeLog;
  });

  emitRealtimeEvent({
    type: "time.logged",
    workspaceId: task.workspaceId,
    projectId: task.projectId,
    boardId: task.boardId,
    taskId: task.id,
    actorId: userId,
    title: "Tiempo registrado",
    message: `Se registraron ${timeLog.minutes} minutos en ${task.title}.`
  });

  res.status(201).json({ timeLog });
}

export async function listTimeLogs(req: Request, res: Response) {
  const userId = req.auth!.userId;
  const taskId = getParam(req, "taskId");
  await assertTaskPermission(userId, taskId, "task.view_all");

  const timeLogs = await prisma.timeLog.findMany({
    where: {
      taskId,
      ...activeRecordFilter
    },
    include: {
      user: {
        select: {
          id: true,
          name: true,
          email: true,
          avatarUrl: true
        }
      }
    },
    orderBy: {
      logDate: "desc"
    }
  });

  res.json({ timeLogs });
}

export async function listTaskEvents(req: Request, res: Response) {
  const userId = req.auth!.userId;
  const taskId = getParam(req, "taskId");
  await assertTaskPermission(userId, taskId, "task.view_all");
  const showInternal = await canSeeInternalComments(userId, taskId);

  const events = await prisma.activityLog.findMany({
    where: {
      taskId
    },
    include: {
      actor: {
        select: {
          id: true,
          name: true,
          email: true,
          avatarUrl: true
        }
      }
    },
    orderBy: {
      createdAt: "desc"
    },
    take: 80
  });

  res.json({
    events: events
      .filter((event) => showInternal || !isInternalCommentEvent(event.action, event.after))
      .map((event) => ({
        id: event.id,
        workspaceId: event.workspaceId,
        projectId: event.projectId,
        taskId: event.taskId,
        actorId: event.actorId,
        actor: event.actor,
        entityType: event.entityType,
        entityId: event.entityId,
        action: event.action,
        before: event.before,
        after: event.after,
        metadata: event.metadata,
        createdAt: event.createdAt
      }))
  });
}

export async function deleteTask(req: Request,res: Response) {
  const userId=req.auth!.userId;
  const {task,workspaceMember}=await assertTaskPermission(userId,getParam(req,'taskId'),'task.delete');
  await assertTaskCanStillBeEdited({completedAt:task.completedAt??undefined},workspaceMember.roleId??undefined);
  await prisma.$transaction(async tx=>{
    const deletedAt=new Date();
    await tx.task.update({where:{id:task.id,updatedAt:new Date(req.body.expectedUpdatedAt),deletedAt:null},data:{deletedAt}});
    await tx.task.updateMany({where:{parentTaskId:task.id,deletedAt:null},data:{deletedAt}});
    await tx.activityLog.create({data:{workspaceId:task.workspaceId,projectId:task.projectId,taskId:task.id,actorId:userId,entityType:'TASK',entityId:task.id,action:'task.deleted'}});
  });
  // The event contains no deleted task title and is authorized against current project access.
  emitRealtimeEvent({type:'task.deleted',workspaceId:task.workspaceId,projectId:task.projectId,boardId:task.boardId,actorId:userId,title:'Tarea eliminada',message:'El tablero del proyecto se actualizó.'});
  res.status(204).send();
}
