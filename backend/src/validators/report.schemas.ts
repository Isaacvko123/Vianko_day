import { z } from "zod";
import { uuidParam } from "./common.schemas.js";

export const projectReportSchema = z.object({
  params: z.object({
    projectId: uuidParam
  })
});

export const workspaceReportSchema = z.object({
  params: z.object({
    workspaceId: uuidParam
  })
});
