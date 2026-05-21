import type { Request } from "express";
import { prisma } from "../db/prisma.js";
import { env } from "../config/env.js";
import { AppError } from "../utils/app-error.js";
import { generateOpaqueToken, hashLogValue, hashToken, signAccessToken } from "../utils/crypto.js";
import { activeSessionFilter } from "../db/filters.js";

function getClientIp(req: Request) {
  return req.ip || req.socket.remoteAddress || "unknown";
}

/**
 * Crea un access token corto y un refresh token opaco de vida larga.
 * El refresh token se muestra una sola vez al cliente; la DB guarda solo su hash HMAC.
 */
export async function createSession(userId: string, req: Request) {
  const refreshToken = generateOpaqueToken();
  const refreshTokenExpiresAt = new Date(Date.now() + env.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000);

  await prisma.session.create({
    data: {
      userId,
      refreshTokenHash: hashToken(refreshToken),
      userAgent: req.header("user-agent")?.slice(0, 512),
      ipHash: hashLogValue(getClientIp(req)),
      expiresAt: refreshTokenExpiresAt
    }
  });

  return {
    accessToken: signAccessToken(userId),
    refreshToken,
    expiresIn: env.ACCESS_TOKEN_TTL_SECONDS
  };
}

/**
 * Rota refresh tokens en cada uso.
 * Si aparece un token ya revocado, asumimos robo y revocamos las sesiones activas del usuario.
 */
export async function rotateSession(refreshToken: string, req: Request) {
  const refreshTokenHash = hashToken(refreshToken);
  const currentSession = await prisma.session.findUnique({
    where: { refreshTokenHash }
  });

  if (!currentSession || currentSession.expiresAt <= new Date()) {
    throw new AppError(401, "REFRESH_INVALID", "Invalid refresh token.");
  }

  if (currentSession.revokedAt) {
    await prisma.session.updateMany({
      where: {
        userId: currentSession.userId,
        ...activeSessionFilter
      },
      data: {
        revokedAt: new Date()
      }
    });
    throw new AppError(401, "REFRESH_REUSED", "Refresh token reuse detected.");
  }

  await prisma.session.update({
    where: { id: currentSession.id },
    data: {
      revokedAt: new Date(),
      rotatedAt: new Date()
    }
  });

  return createSession(currentSession.userId, req);
}

export async function revokeSession(refreshToken: string) {
  await prisma.session.updateMany({
    where: {
      refreshTokenHash: hashToken(refreshToken),
      ...activeSessionFilter
    },
    data: {
      revokedAt: new Date()
    }
  });
}
