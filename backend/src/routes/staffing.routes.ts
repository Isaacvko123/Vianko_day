import { Router } from "express";
import {
  approveStaffingRequest,
  createStaffingRequest,
  listStaffingRequests,
  rejectStaffingRequest
} from "../controllers/staffing.controller.js";
import { authenticate } from "../middleware/authenticate.js";
import { validate } from "../middleware/validate.js";
import { asyncHandler } from "../utils/async-handler.js";
import {
  approveStaffingRequestSchema,
  createStaffingRequestSchema,
  listStaffingRequestsSchema,
  rejectStaffingRequestSchema
} from "../validators/staffing.schemas.js";

export const staffingRouter = Router();

staffingRouter.use(authenticate);
staffingRouter.get("/", validate(listStaffingRequestsSchema), asyncHandler(listStaffingRequests));
staffingRouter.post("/", validate(createStaffingRequestSchema), asyncHandler(createStaffingRequest));
staffingRouter.patch("/:requestId/approve", validate(approveStaffingRequestSchema), asyncHandler(approveStaffingRequest));
staffingRouter.patch("/:requestId/reject", validate(rejectStaffingRequestSchema), asyncHandler(rejectStaffingRequest));
