import { z } from "zod";
import { uuidParam } from "./common.schemas.js";

export const listStaffingRequestsSchema = z.object({
  query: z.object({
    workspaceId: uuidParam,
    status: z.enum(["PENDING", "APPROVED", "REJECTED", "CANCELLED"]).optional()
  })
});

export const createStaffingRequestSchema = z.object({
  body: z.object({
    projectId: uuidParam,
    targetAreaId: uuidParam,
    targetLocalityId: uuidParam.optional(),
    positionId: uuidParam.optional(),
    roleId: uuidParam.optional(),
    requestedUserId: uuidParam.optional(),
    quantity: z.number().int().min(1).max(25).default(1),
    note: z.string().trim().max(2000).optional()
  })
});

export const staffingRequestIdParamsSchema = z.object({
  params: z.object({
    requestId: uuidParam
  })
});

export const approveStaffingRequestSchema = z.object({
  params: z.object({
    requestId: uuidParam
  }),
  body: z.object({
    approvedUserIds: z.array(uuidParam).min(1).max(25),
    responseNote: z.string().trim().max(2000).optional()
  })
});

export const rejectStaffingRequestSchema = z.object({
  params: z.object({
    requestId: uuidParam
  }),
  body: z.object({
    responseNote: z.string().trim().min(2).max(2000)
  })
});
