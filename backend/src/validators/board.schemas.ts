import { z } from "zod";
import { uuidParam } from "./common.schemas.js";

export const listBoardsSchema = z.object({
  params: z.object({
    projectId: uuidParam
  })
});

export const createBoardSchema = z.object({
  params: z.object({
    projectId: uuidParam
  }),
  body: z.object({
    name: z.string().trim().min(2).max(120),
    description: z.string().trim().max(1000).optional()
  })
});

export const createBoardStatusSchema = z.object({
  params: z.object({
    boardId: uuidParam
  }),
  body: z.object({
    name: z.string().trim().min(2).max(80),
    color: z.string().trim().max(32).optional(),
    position: z.number().int().min(0),
    category: z.enum(["TODO", "IN_PROGRESS", "BLOCKED", "REVIEW", "DONE", "CANCELLED"]).default("TODO"),
    countsAsDone: z.boolean().default(false),
    isDefault: z.boolean().default(false)
  }).superRefine((body, context) => {
    if (body.countsAsDone !== (body.category === "DONE")) context.addIssue({ code: z.ZodIssueCode.custom, message: "Solo la categoría Terminado puede contar como completada." });
    if (body.isDefault && body.category !== "TODO") context.addIssue({ code: z.ZodIssueCode.custom, message: "El estado inicial debe pertenecer a Por hacer." });
  })
});
