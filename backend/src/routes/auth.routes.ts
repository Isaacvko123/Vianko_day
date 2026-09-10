import { Router } from "express";
import { authenticationRateLimit, invitationRateLimit, loginAccountRateLimit, refreshRateLimit } from "../config/security.js";
import {
  acceptInvitation,
  login,
  logout,
  refresh
} from "../controllers/auth.controller.js";
import { asyncHandler } from "../utils/async-handler.js";
import { validate } from "../middleware/validate.js";
import {
  acceptInvitationSchema,
  loginSchema,
  logoutSchema,
  refreshSchema
} from "../validators/auth.schemas.js";

export const authRouter = Router();

authRouter.post("/login", authenticationRateLimit, loginAccountRateLimit, validate(loginSchema), asyncHandler(login));
authRouter.post("/refresh", refreshRateLimit, validate(refreshSchema), asyncHandler(refresh));
authRouter.post("/logout", validate(logoutSchema), asyncHandler(logout));
authRouter.post("/accept-invitation", invitationRateLimit, validate(acceptInvitationSchema), asyncHandler(acceptInvitation));
// New accounts are provisioned by invitation; no public organizational directory.
authRouter.all(['/workspaces', '/registration-options', '/request-access'], (_req, res) => {
  res.status(403).json({ error: { code: 'INVITATION_REQUIRED', message: 'Solicita una invitación al administrador de tu empresa para obtener acceso.' } });
});
