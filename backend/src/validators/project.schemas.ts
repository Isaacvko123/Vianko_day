import { z } from "zod";
import { dateString, uuidParam } from "./common.schemas.js";

export const listProjectsSchema = z.object({
  query: z.object({
    workspaceId: uuidParam
  })
});

export const createProjectSchema = z.object({
  body: z.object({
    workspaceId: uuidParam,
    areaId: uuidParam.optional(),
    localityId: uuidParam.optional(),
    name: z.string().trim().min(2).max(160),
    description: z.string().trim().max(2000).optional(),
    visibility: z.enum(["WORKSPACE", "PRIVATE"]).default("WORKSPACE"),
    color: z.string().trim().max(32).optional(),
    startDate: dateString,
    endDate: dateString
  })
});

export const projectIdParamsSchema = z.object({
  params: z.object({
    projectId: uuidParam
  })
});

export const updateProjectSchema = z.object({
  params: z.object({
    projectId: uuidParam
  }),
  body: z.object({
    areaId: uuidParam.optional(),
    localityId: uuidParam.optional(),
    name: z.string().trim().min(2).max(160).optional(),
    description: z.string().trim().max(2000).optional(),
    visibility: z.enum(["WORKSPACE", "PRIVATE"]).optional(),
    color: z.string().trim().max(32).optional(),
    startDate: dateString,
    endDate: dateString
  })
});

export const addProjectMemberSchema = z.object({
  params: z.object({
    projectId: uuidParam
  }),
  body: z.object({
    userId: uuidParam,
    roleId: uuidParam.optional()
  })
});
