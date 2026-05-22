import { z } from "zod";
import { uuidParam } from "./common.schemas.js";

const reportPeriod = z.enum(["week", "month", "bimester", "semester", "year"]).default("month");

export const projectReportSchema = z.object({
  params: z.object({
    projectId: uuidParam
  })
});

export const workspaceReportSchema = z.object({
  params: z.object({
    workspaceId: uuidParam
  }),
  query: z.object({
    period: reportPeriod
  })
});
