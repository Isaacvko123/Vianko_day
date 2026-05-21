import { z } from "zod";
import { uuidParam } from "./common.schemas.js";

export const createWorkspaceSchema = z.object({
  body: z.object({
    name: z.string().trim().min(2).max(120)
  })
});

export const workspaceIdParamsSchema = z.object({
  params: z.object({
    workspaceId: uuidParam
  })
});

export const inviteUserSchema = z.object({
  params: z.object({
    workspaceId: uuidParam
  }),
  body: z.object({
    email: z.string().trim().email().max(320).toLowerCase(),
    roleId: uuidParam.optional(),
    areaId: uuidParam.optional(),
    localityId: uuidParam.optional(),
    localityIds: z.array(uuidParam).max(50).optional(),
    positionId: uuidParam.optional(),
    userType: z.enum(["INTERNAL", "EXTERNAL"]).default("INTERNAL"),
    projectId: uuidParam.optional(),
    expiresInDays: z.number().int().min(1).max(30).default(7)
  })
});

export const createAreaSchema = z.object({
  params: z.object({
    workspaceId: uuidParam
  }),
  body: z.object({
    name: z.string().trim().min(2).max(120),
    description: z.string().trim().max(500).optional()
  })
});

export const createLocalitySchema = z.object({
  params: z.object({
    workspaceId: uuidParam
  }),
  body: z.object({
    areaId: uuidParam.optional(),
    name: z.string().trim().min(2).max(120),
    code: z.string().trim().min(2).max(24).transform((value) => value.toUpperCase()),
    description: z.string().trim().max(500).optional()
  })
});

export const createPositionSchema = z.object({
  params: z.object({
    workspaceId: uuidParam
  }),
  body: z.object({
    areaId: uuidParam.optional(),
    name: z.string().trim().min(2).max(120),
    description: z.string().trim().max(500).optional(),
    isManager: z.boolean().default(false)
  })
});

export const memberIdParamsSchema = z.object({
  params: z.object({
    workspaceId: uuidParam,
    memberId: uuidParam
  })
});

export const approveMemberSchema = z.object({
  params: z.object({
    workspaceId: uuidParam,
    memberId: uuidParam
  }),
  body: z.object({
    roleId: uuidParam.optional(),
    areaId: uuidParam.optional(),
    localityId: uuidParam.optional(),
    localityIds: z.array(uuidParam).max(50).optional(),
    positionId: uuidParam.optional(),
    userType: z.enum(["INTERNAL", "EXTERNAL"]).optional()
  })
});

export const updateMemberSchema = approveMemberSchema;
