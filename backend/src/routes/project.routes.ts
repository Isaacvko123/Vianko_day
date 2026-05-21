import { Router } from "express";
import { addProjectMember, createProject, getProject, listProjects, updateProject } from "../controllers/project.controller.js";
import { authenticate } from "../middleware/authenticate.js";
import { validate } from "../middleware/validate.js";
import { asyncHandler } from "../utils/async-handler.js";
import {
  addProjectMemberSchema,
  createProjectSchema,
  listProjectsSchema,
  projectIdParamsSchema,
  updateProjectSchema
} from "../validators/project.schemas.js";

export const projectRouter = Router();

projectRouter.use(authenticate);
projectRouter.get("/", validate(listProjectsSchema), asyncHandler(listProjects));
projectRouter.post("/", validate(createProjectSchema), asyncHandler(createProject));
projectRouter.get("/:projectId", validate(projectIdParamsSchema), asyncHandler(getProject));
projectRouter.patch("/:projectId", validate(updateProjectSchema), asyncHandler(updateProject));
projectRouter.post("/:projectId/members", validate(addProjectMemberSchema), asyncHandler(addProjectMember));
