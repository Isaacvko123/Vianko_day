import { Router } from "express";
import { projectProgress, workspaceSummary } from "../controllers/report.controller.js";
import { authenticate } from "../middleware/authenticate.js";
import { validate } from "../middleware/validate.js";
import { asyncHandler } from "../utils/async-handler.js";
import { projectReportSchema, workspaceReportSchema } from "../validators/report.schemas.js";

export const reportRouter = Router();

reportRouter.use(authenticate);
reportRouter.get("/project/:projectId/progress", validate(projectReportSchema), asyncHandler(projectProgress));
reportRouter.get("/workspace/:workspaceId/summary", validate(workspaceReportSchema), asyncHandler(workspaceSummary));
