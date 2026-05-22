import { z } from "zod";
import { uuidParam } from "./common.schemas.js";

export const loginSchema = z.object({
  body: z.object({
    email: z.string().trim().email().max(320).toLowerCase(),
    password: z.string().min(1).max(256)
  })
});

export const refreshSchema = z.object({
  body: z.object({
    refreshToken: z.string().min(32).max(512)
  })
});

export const logoutSchema = refreshSchema;

export const acceptInvitationSchema = z.object({
  body: z.object({
    token: z.string().min(32).max(512),
    name: z.string().trim().min(2).max(120).optional(),
    password: z.string().min(8).max(256).optional()
  })
});

export const registrationOptionsSchema = z.object({
  query: z.object({
    workspaceSlug: z.string().trim().min(2).max(120)
  })
});

export const requestAccessSchema = z.object({
  body: z.object({
    workspaceSlug: z.string().trim().min(2).max(120),
    name: z.string().trim().min(2).max(120),
    email: z.string().trim().email().max(320).toLowerCase(),
    password: z.string().min(8).max(256),
    areaId: uuidParam,
    localityId: uuidParam,
    positionId: uuidParam,
    userType: z.enum(["INTERNAL", "EXTERNAL"]).default("INTERNAL")
  })
});
