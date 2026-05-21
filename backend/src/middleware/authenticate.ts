import type { NextFunction, Request, Response } from "express";
import { prisma } from "../db/prisma.js";
import { AppError } from "../utils/app-error.js";
import { verifyAccessToken } from "../utils/crypto.js";

export async function authenticate(req: Request, _res: Response, next: NextFunction) {
  const authorizationHeader = req.header("Authorization");

  if (!authorizationHeader?.startsWith("Bearer ")) {
    next(new AppError(401, "AUTH_REQUIRED", "Authentication is required."));
    return;
  }

  const accessToken = authorizationHeader.slice("Bearer ".length).trim();

  try {
    const payload = verifyAccessToken(accessToken);
    const user = await prisma.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, isActive: true }
    });

    if (!user?.isActive) {
      throw new AppError(401, "AUTH_INVALID", "Invalid or inactive user.");
    }

    req.auth = { userId: user.id };
    next();
  } catch (error) {
    next(error instanceof AppError ? error : new AppError(401, "AUTH_INVALID", "Invalid access token."));
  }
}
