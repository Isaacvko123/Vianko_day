import type { Request, Response } from "express";
import { prisma } from "../db/prisma.js";
import { activeRecordFilter } from "../db/filters.js";
import { clearNullableTimestamp } from "../db/nullable-values.js";
import { AppError } from "../utils/app-error.js";
import { assertProjectPermission, assertTaskPermission, assertTaskStatusChangePermission, canSeeEveryTaskInProject, canSeeInternalComments, roleHasPermission } from "../services/access-control.service.js";
import { emitRealtimeEvent } from "../services/realtime.service.js";
import { auditJson } from "../utils/audit-json.js";
import { decryptText, encryptText } from "../utils/crypto.js";
import { getParam } from "../utils/request.js";

const completedTaskActiveWindowDays = 3;

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
  const canManageProjectMembers = await roleHasPermission(roleId, "project.manage_members");

  if (!canManageWorkspace && !canManageProjectMembers) {
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

  await assertProjectPermission(userId, board.projectId, permission);
  return board;
}

type BoardForTaskOperation = Awaited<ReturnType<typeof getBoardAndAuthorizeTaskOperation>>;

function getUniqueAssigneeIds(assigneeIds: string[] | undefined) {
  return [...new Set<string>(assigneeIds ?? [])];
}

async function assertParentTaskBelongsToSameProject(board: BoardForTaskOperation, parentTaskId?: string) {
  if (!parentTaskId) {
    return;
  }

  const parentTask = await prisma.task.findFirst({
    where: {
      id: parentTaskId,
      workspaceId: board.workspaceId,
      projectId: board.projectId,
      ...activeRecordFilter
    }
  });

  if (!parentTask) {
    throw new AppError(400, "PARENT_TASK_INVALID", "Parent task must belong to the same project.");
  }
}

async function assertAssigneesCanWorkOnTask(board: BoardForTaskOperation, assigneeIds: string[]) {
  if (assigneeIds.length === 0) {
    return;
  }

  const activeWorkspaceMembers = await prisma.workspaceMember.findMany({
    where: {
      workspaceId: board.workspaceId,
      userId: { in: assigneeIds },
      status: "ACTIVE"
    }
  });

  if (activeWorkspaceMembers.length !== assigneeIds.length) {
    throw new AppError(400, "ASSIGNEE_INVALID", "All assignees must be active workspace members.");
  }

  const projectMemberCount = await prisma.projectMember.count({
    where: {
      projectId: board.projectId,
      userId: { in: assigneeIds }
    }
  });

  if (projectMemberCount !== assigneeIds.length) {
    throw new AppError(
      400,
      "ASSIGNEE_PROJECT_REQUIRED",
      "Assignees must belong to the project before they can receive tasks."
    );
  }
}

async function assertMentionedUserBelongsToWorkspace(workspaceId: string, targetUserId: string) {
  const workspaceMembership = await prisma.workspaceMember.findUnique({
    where: {
      workspaceId_userId: {
        workspaceId,
        userId: targetUserId
      }
    }
  });

  if (!workspaceMembership || workspaceMembership.status !== "ACTIVE") {
    throw new AppError(400, "MENTION_USER_INVALID", "Mentioned user must be an active workspace member.");
  }
}

export async function listTasks(req: Request, res: Response) {
  const userId = req.auth!.userId;
  const boardId = getParam(req, "boardId");
  const { limit, offset, statusId, assigneeId, view } = req.query;
  const taskView = view === "completed" ? "completed" : "active";

  const board = await getBoardAndAuthorizeTaskOperation(boardId, userId, "task.view_all");
  const [workspaceMember, projectMember] = await Promise.all([
    prisma.workspaceMember.findUnique({
      where: {
        workspaceId_userId: {
          workspaceId: board.workspaceId,
          userId
        }
      }
    }),
    prisma.projectMember.findFirst({
      where: {
        projectId: board.projectId,
        userId
      }
    })
  ]);
  const canSeeEveryTask = await canSeeEveryTaskInProject(workspaceMember?.roleId ?? undefined, projectMember?.roleId ?? undefined);
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
          comments: true,
          timeLogs: true,
          subtasks: true
        }
      }
    },
    orderBy: taskView === "completed"
      ? [{ completedAt: "desc" }, { updatedAt: "desc" }]
      : [{ dueAt: "asc" }, { createdAt: "desc" }],
    take: limit ? Number(limit) : undefined,
    skip: offset ? Number(offset) : undefined
  });

  res.json({ tasks });
}

export async function listSubtasks(req: Request, res: Response) {
  const userId = req.auth!.userId;
  const taskId = getParam(req, "taskId");
  const { task } = await assertTaskPermission(userId, taskId, "task.view_all");

  const subtasks = await prisma.task.findMany({
    where: {
      parentTaskId: task.id,
      ...activeRecordFilter
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
          comments: true,
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

  res.json({ subtasks });
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

  const assigneeIds = getUniqueAssigneeIds(req.body.assigneeIds);

  await assertParentTaskBelongsToSameProject(board, req.body.parentTaskId);
  await assertAssigneesCanWorkOnTask(board, assigneeIds);

  const initialCompletedAt = selectedStatus.countsAsDone ? new Date() : undefined;

  const task = await prisma.$transaction(async (tx) => {
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
  });

  emitRealtimeEvent({
    type: "task.created",
    workspaceId: board.workspaceId,
    projectId: board.projectId,
    boardId,
    taskId: task.id,
    actorId: userId,
    title: req.body.parentTaskId ? "Nueva subtarea" : "Nueva actividad",
    message: req.body.parentTaskId ? `Se creo la subtarea ${task.title}.` : `Se creo la actividad ${task.title}.`
  });

  res.status(201).json({ task });
}

export async function updateTask(req: Request, res: Response) {
  const userId = req.auth!.userId;
  const taskId = getParam(req, "taskId");
  const requestedFields = Object.keys(req.body);
  const progressOnlyUpdate = requestedFields.length > 0 && requestedFields.every((field) => field === "progress");
  const requiredPermission = progressOnlyUpdate ? "task.update_progress" : "task.update";
  const { task, workspaceMember } = await assertTaskPermission(userId, taskId, requiredPermission);
  await assertTaskCanStillBeEdited({ completedAt: task.completedAt ?? undefined }, workspaceMember.roleId ?? undefined);

  const taskUpdates = {
    title: req.body.title,
    description: req.body.description,
    priority: req.body.priority,
    startAt: parseOptionalDate(req.body.startAt),
    dueAt: parseOptionalDate(req.body.dueAt),
    estimateMinutes: req.body.estimateMinutes,
    progress: req.body.progress
  };

  const updated = await prisma.task.update({
    where: { id: task.id },
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

  await prisma.activityLog.create({
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

  emitRealtimeEvent({
    type: "task.updated",
    workspaceId: task.workspaceId,
    projectId: task.projectId,
    boardId: task.boardId,
    taskId: task.id,
    actorId: userId,
    title: "Actividad actualizada",
    message: `Se actualizo ${task.title}.`
  });

  res.json({ task: updated });
}

export async function changeTaskStatus(req: Request, res: Response) {
  const userId = req.auth!.userId;
  const taskId = getParam(req, "taskId");
  const { task, workspaceMember } = await assertTaskStatusChangePermission(userId, taskId);

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

  // completedAt pertenece al cambio de estado, no a updatedAt.
  // Los reportes de terminado deben confiar en este timestamp.
  const completedAt = targetBoardStatus.countsAsDone ? task.completedAt ?? new Date() : clearNullableTimestamp;
  const auditAction = targetBoardStatus.countsAsDone
    ? "task.completed"
    : task.completedAt
      ? "task.reopened"
      : "task.status_changed";

  const updated = await prisma.task.update({
    where: { id: task.id },
    data: {
      statusId: targetBoardStatus.id,
      completedAt
    },
    include: {
      status: true
    }
  });

  await prisma.activityLog.create({
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

  res.json({ task: updated });
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

  const workspaceMembership = await prisma.workspaceMember.findUnique({
    where: {
      workspaceId_userId: {
        workspaceId: task.workspaceId,
        userId: targetUserId
      }
    }
  });

  if (!workspaceMembership || workspaceMembership.status !== "ACTIVE") {
    throw new AppError(400, "ASSIGNEE_INVALID", "Assignee must be an active workspace member.");
  }

  const projectMember = await prisma.projectMember.findUnique({
    where: {
      projectId_userId: {
        projectId: task.projectId,
        userId: targetUserId
      }
    }
  });

  if (!projectMember) {
    throw new AppError(400, "ASSIGNEE_PROJECT_REQUIRED", "Assignee must belong to the project.");
  }

  const assignee = await prisma.taskAssignee.upsert({
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

  await prisma.activityLog.create({
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

  emitRealtimeEvent({
    type: "task.assigned",
    workspaceId: task.workspaceId,
    projectId: task.projectId,
    boardId: task.boardId,
    taskId: task.id,
    actorId: userId,
    title: "Asignado agregado",
    message: `Se agrego un asignado a ${task.title}.`
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

  const mention = await prisma.taskMention.upsert({
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

  await prisma.activityLog.create({
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

  emitRealtimeEvent({
    type: "task.mentioned",
    workspaceId: task.workspaceId,
    projectId: task.projectId,
    boardId: task.boardId,
    taskId: task.id,
    actorId: userId,
    title: "Usuario mencionado",
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

  await prisma.taskAssignee.deleteMany({
    where: {
      taskId: task.id,
      userId: targetUserId
    }
  });

  await prisma.activityLog.create({
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

  emitRealtimeEvent({
    type: "task.unassigned",
    workspaceId: task.workspaceId,
    projectId: task.projectId,
    boardId: task.boardId,
    taskId: task.id,
    actorId: userId,
    title: "Asignado removido",
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

  const comment = await prisma.comment.create({
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

  await prisma.activityLog.create({
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

  emitRealtimeEvent({
    type: "comment.created",
    workspaceId: task.workspaceId,
    projectId: task.projectId,
    boardId: task.boardId,
    taskId: task.id,
    actorId: userId,
    title: comment.isInternal ? "Comentario interno" : "Nuevo comentario",
    message: `Se agrego un comentario en ${task.title}.`
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

  const timeLog = await prisma.timeLog.create({
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

  await prisma.activityLog.create({
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
