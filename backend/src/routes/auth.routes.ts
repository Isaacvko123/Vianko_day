import { Router } from "express";
import { authenticationRateLimit } from "../config/security.js";
import {
  acceptInvitation,
  getRegistrationOptions,
  login,
  logout,
  refresh,
  register,
  requestAccess
} from "../controllers/auth.controller.js";
import { asyncHandler } from "../utils/async-handler.js";
import { validate } from "../middleware/validate.js";
import {
  acceptInvitationSchema,
  loginSchema,
  logoutSchema,
  refreshSchema,
  registerSchema,
  registrationOptionsSchema,
  requestAccessSchema
} from "../validators/auth.schemas.js";

export const authRouter = Router();

authRouter.post("/register", authenticationRateLimit, validate(registerSchema), asyncHandler(register));
authRouter.post("/login", authenticationRateLimit, validate(loginSchema), asyncHandler(login));
authRouter.post("/refresh", authenticationRateLimit, validate(refreshSchema), asyncHandler(refresh));
authRouter.post("/logout", validate(logoutSchema), asyncHandler(logout));
authRouter.post("/accept-invitation", authenticationRateLimit, validate(acceptInvitationSchema), asyncHandler(acceptInvitation));
authRouter.get("/registration-options", validate(registrationOptionsSchema), asyncHandler(getRegistrationOptions));
authRouter.post("/request-access", authenticationRateLimit, validate(requestAccessSchema), asyncHandler(requestAccess));
