import { Router } from "express";
import { updateOrganization, updateOrganizationSchema } from '../controllers/organization.controller.js';
import { listWorkItems } from '../controllers/work-items.controller.js';
import { createRole, updateRole, deleteRole, roleCatalog } from '../controllers/role.controller.js';
import { createRoleSchema, updateRoleSchema, deleteRoleSchema } from '../validators/role.schemas.js';
import {
  approveWorkspaceMember,
  createWorkspace,
  createWorkspaceArea,
  createWorkspaceLocality,
  createWorkspacePosition,
  inviteUser,
  listWorkspaceInvitations,
  revokeWorkspaceInvitation,
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
  revokeInvitationSchema,
  updateMemberSchema,
  workspaceIdParamsSchema
} from "../validators/workspace.schemas.js";

export const workspaceRouter = Router();

workspaceRouter.use(authenticate);
workspaceRouter.get("/", asyncHandler(listWorkspaces));
workspaceRouter.post("/", validate(createWorkspaceSchema), asyncHandler(createWorkspace));
workspaceRouter.get("/:workspaceId/members", validate(workspaceIdParamsSchema), asyncHandler(listWorkspaceMembers));
workspaceRouter.get('/:workspaceId/work-items', validate(workspaceIdParamsSchema), asyncHandler(listWorkItems));
workspaceRouter.patch('/:workspaceId/organization/:kind/:recordId', validate(updateOrganizationSchema), asyncHandler(updateOrganization));
workspaceRouter.get("/:workspaceId/members/pending", validate(workspaceIdParamsSchema), asyncHandler(listPendingWorkspaceMembers));
workspaceRouter.patch("/:workspaceId/members/:memberId", validate(updateMemberSchema), asyncHandler(updateWorkspaceMember));
workspaceRouter.patch("/:workspaceId/members/:memberId/approve", validate(approveMemberSchema), asyncHandler(approveWorkspaceMember));
workspaceRouter.get("/:workspaceId/roles", validate(workspaceIdParamsSchema), asyncHandler(listWorkspaceRoles));
workspaceRouter.get('/:workspaceId/roles/catalog', validate(workspaceIdParamsSchema), asyncHandler(roleCatalog));
workspaceRouter.post('/:workspaceId/roles', validate(createRoleSchema), asyncHandler(createRole));
workspaceRouter.patch('/:workspaceId/roles/:roleId', validate(updateRoleSchema), asyncHandler(updateRole));
workspaceRouter.delete('/:workspaceId/roles/:roleId', validate(deleteRoleSchema), asyncHandler(deleteRole));
workspaceRouter.get("/:workspaceId/areas", validate(workspaceIdParamsSchema), asyncHandler(listWorkspaceAreas));
workspaceRouter.post("/:workspaceId/areas", validate(createAreaSchema), asyncHandler(createWorkspaceArea));
workspaceRouter.get("/:workspaceId/localities", validate(workspaceIdParamsSchema), asyncHandler(listWorkspaceLocalities));
workspaceRouter.post("/:workspaceId/localities", validate(createLocalitySchema), asyncHandler(createWorkspaceLocality));
workspaceRouter.get("/:workspaceId/positions", validate(workspaceIdParamsSchema), asyncHandler(listWorkspacePositions));
workspaceRouter.post("/:workspaceId/positions", validate(createPositionSchema), asyncHandler(createWorkspacePosition));
workspaceRouter.post("/:workspaceId/invitations", validate(inviteUserSchema), asyncHandler(inviteUser));
workspaceRouter.get('/:workspaceId/invitations', validate(workspaceIdParamsSchema), asyncHandler(listWorkspaceInvitations));
workspaceRouter.patch('/:workspaceId/invitations/:invitationId/revoke', validate(revokeInvitationSchema), asyncHandler(revokeWorkspaceInvitation));
