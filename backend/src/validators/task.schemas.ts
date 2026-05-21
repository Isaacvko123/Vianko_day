import { z } from "zod";
import { dateString, paginationQuery, uuidParam } from "./common.schemas.js";

export const listTasksSchema = z.object({
  params: z.object({
    boardId: uuidParam
  }),
  query: paginationQuery.extend({
    statusId: uuidParam.optional(),
    assigneeId: uuidParam.optional(),
    view: z.enum(["active", "completed"]).default("active")
  })
});

export const taskIdParamsSchema = z.object({
  params: z.object({
    taskId: uuidParam
  })
});

export const createTaskSchema = z.object({
  params: z.object({
    boardId: uuidParam
  }),
  body: z.object({
    statusId: uuidParam.optional(),
    parentTaskId: uuidParam.optional(),
    title: z.string().trim().min(2).max(240),
    description: z.string().trim().max(10000).optional(),
    priority: z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]).default("MEDIUM"),
    startAt: dateString,
    dueAt: dateString,
    estimateMinutes: z.number().int().min(0).max(100000).optional(),
    assigneeIds: z.array(uuidParam).max(25).default([])
  })
});

export const updateTaskSchema = z.object({
  params: z.object({
    taskId: uuidParam
  }),
  body: z.object({
    title: z.string().trim().min(2).max(240).optional(),
    description: z.string().trim().max(10000).optional(),
    priority: z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]).optional(),
    startAt: dateString,
    dueAt: dateString,
    estimateMinutes: z.number().int().min(0).max(100000).optional(),
    progress: z.number().int().min(0).max(100).optional()
  })
});

export const changeTaskStatusSchema = z.object({
  params: z.object({
    taskId: uuidParam
  }),
  body: z.object({
    statusId: uuidParam
  })
});

export const taskAssigneeSchema = z.object({
  params: z.object({
    taskId: uuidParam,
    userId: uuidParam.optional()
  }),
  body: z.object({
    userId: uuidParam.optional()
  }).optional()
});

export const createCommentSchema = z.object({
  params: z.object({
    taskId: uuidParam
  }),
  body: z.object({
    body: z.string().trim().min(1).max(10000),
    isInternal: z.boolean().default(false)
  })
});

export const createTimeLogSchema = z.object({
  params: z.object({
    taskId: uuidParam
  }),
  body: z.object({
    minutes: z.number().int().min(1).max(1440),
    note: z.string().trim().max(2000).optional(),
    logDate: dateString,
    startedAt: dateString,
    endedAt: dateString
  })
});
