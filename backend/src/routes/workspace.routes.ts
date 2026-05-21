import { Router } from "express";
import {
  approveWorkspaceMember,
  createWorkspace,
  createWorkspaceArea,
  createWorkspaceLocality,
  createWorkspacePosition,
  inviteUser,
  listPendingWorkspaceMembers,
  listWorkspaceAreas,
  listWorkspaceLocalities,
  listWorkspaceMembers,
  listWorkspacePositions,
  listWorkspaceRoles,
  listWorkspaces,
  updateWorkspaceMember
} from "../controllers/workspace.controller.js";
import { authenticate } from "../middleware/authenticate.js";
import { validate } from "../middleware/validate.js";
import { asyncHandler } from "../utils/async-handler.js";
import {
  approveMemberSchema,
  createAreaSchema,
  createLocalitySchema,
  createPositionSchema,
  createWorkspaceSchema,
  inviteUserSchema,
  updateMemberSchema,
  workspaceIdParamsSchema
} from "../validators/workspace.schemas.js";

export const workspaceRouter = Router();

workspaceRouter.use(authenticate);
workspaceRouter.get("/", asyncHandler(listWorkspaces));
workspaceRouter.post("/", validate(createWorkspaceSchema), asyncHandler(createWorkspace));
workspaceRouter.get("/:workspaceId/members", validate(workspaceIdParamsSchema), asyncHandler(listWorkspaceMembers));
workspaceRouter.get("/:workspaceId/members/pending", validate(workspaceIdParamsSchema), asyncHandler(listPendingWorkspaceMembers));
workspaceRouter.patch("/:workspaceId/members/:memberId", validate(updateMemberSchema), asyncHandler(updateWorkspaceMember));
workspaceRouter.patch("/:workspaceId/members/:memberId/approve", validate(approveMemberSchema), asyncHandler(approveWorkspaceMember));
workspaceRouter.get("/:workspaceId/roles", validate(workspaceIdParamsSchema), asyncHandler(listWorkspaceRoles));
workspaceRouter.get("/:workspaceId/areas", validate(workspaceIdParamsSchema), asyncHandler(listWorkspaceAreas));
workspaceRouter.post("/:workspaceId/areas", validate(createAreaSchema), asyncHandler(createWorkspaceArea));
workspaceRouter.get("/:workspaceId/localities", validate(workspaceIdParamsSchema), asyncHandler(listWorkspaceLocalities));
workspaceRouter.post("/:workspaceId/localities", validate(createLocalitySchema), asyncHandler(createWorkspaceLocality));
workspaceRouter.get("/:workspaceId/positions", validate(workspaceIdParamsSchema), asyncHandler(listWorkspacePositions));
workspaceRouter.post("/:workspaceId/positions", validate(createPositionSchema), asyncHandler(createWorkspacePosition));
workspaceRouter.post("/:workspaceId/invitations", validate(inviteUserSchema), asyncHandler(inviteUser));
