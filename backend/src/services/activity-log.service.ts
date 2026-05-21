import type { ActivityEntityType, Prisma } from "@prisma/client";
import { prisma } from "../db/prisma.js";

type ActivityLogInput = {
  workspaceId: string;
  projectId?: string;
  taskId?: string;
  actorId?: string;
  entityType: ActivityEntityType;
  entityId: string;
  action: string;
  before?: Prisma.InputJsonValue;
  after?: Prisma.InputJsonValue;
  metadata?: Prisma.InputJsonValue;
};

export async function writeActivityLog(input: ActivityLogInput) {
  await prisma.activityLog.create({
    data: {
      workspaceId: input.workspaceId,
      projectId: input.projectId,
      taskId: input.taskId,
      actorId: input.actorId,
      entityType: input.entityType,
      entityId: input.entityId,
      action: input.action,
      before: input.before ?? undefined,
      after: input.after ?? undefined,
      metadata: input.metadata ?? undefined
    }
  });
}
