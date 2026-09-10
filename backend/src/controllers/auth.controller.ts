import { assertRoleGrant, assertWorkspaceMember, getRolePermissions } from "../services/access-control.service.js";
import { prisma } from "../db/prisma.js";
import { activeRecordFilter } from "../db/filters.js";
import type { Prisma, User } from "@prisma/client";
import { AppError } from "../utils/app-error.js";
import { generateOpaqueToken, hashPassword, hashToken, verifyPassword } from "../utils/crypto.js";
import { createSession, revokeSession, rotateSession } from "../services/auth.service.js";
import type { Request, Response } from "express";

function toPublicUser(user: Pick<User, "id" | "name" | "email" | "avatarUrl">) {
  const publicUser = {
    id: user.id,
    name: user.name,
    email: user.email
  };

  return user.avatarUrl ? { ...publicUser, avatarUrl: user.avatarUrl } : publicUser;
}

function uniqueStrings(values: string[]) {
  return [...new Set(values.filter((value) => value.length > 0))];
}

async function syncMemberLocalityScopes(
  tx: Prisma.TransactionClient,
  workspaceMemberId: string,
  localityIds: string[]
) {
  const selectedLocalityIds = uniqueStrings(localityIds);
  await tx.workspaceMemberLocality.deleteMany({
    where: { workspaceMemberId }
  });

  if (selectedLocalityIds.length === 0) {
    return;
  }

  await tx.workspaceMemberLocality.createMany({
    data: selectedLocalityIds.map((localityId) => ({
      workspaceMemberId,
      localityId
    }))
  });
}

export async function login(req: Request, res: Response) {
  const { email, password } = req.body;
  const userWithPassword = await prisma.user.findUnique({ where: { email } });

  if (!userWithPassword?.passwordHash || !userWithPassword.isActive) {
    throw new AppError(401, "INVALID_CREDENTIALS", "Invalid credentials.");
  }

  const passwordMatchesHash = await verifyPassword(userWithPassword.passwordHash, password);

  if (!passwordMatchesHash) {
    throw new AppError(401, "INVALID_CREDENTIALS", "Invalid credentials.");
  }

  await prisma.user.update({
    where: { id: userWithPassword.id },
    data: { lastLoginAt: new Date() }
  });

  const authTokens = await createSession(userWithPassword.id, req);

  res.json({
    user: toPublicUser(userWithPassword),
    tokens: authTokens
  });
}

export async function refresh(req: Request, res: Response) {
  const authTokens = await rotateSession(req.body.refreshToken, req);
  res.json({ tokens: authTokens });
}

export async function logout(req: Request, res: Response) {
  await revokeSession(req.body.refreshToken);
  res.status(204).send();
}

export async function acceptInvitation(req: Request, res: Response) {
  const { token, name, password } = req.body;
  const tokenHash = hashToken(token);

  const invitation = await prisma.invitation.findUnique({
    where: { tokenHash },
    include: {
      localityScopes: {
        select: {
          localityId: true
        },
        orderBy: { createdAt: "asc" }
      }
    }
  });

  if (
    !invitation ||
    invitation.status !== "PENDING" ||
    invitation.revokedAt ||
    invitation.expiresAt <= new Date()
  ) {
    throw new AppError(400, "INVITATION_INVALID", "Invitation is invalid or expired.");
  }

  if (!invitation.invitedById) throw new AppError(403, "INVITATION_REISSUE_REQUIRED", "Solicita una invitación nueva a administración.");
  const inviter = await assertWorkspaceMember(invitation.invitedById, invitation.workspaceId);
  const inviterPermissions = await getRolePermissions(inviter.roleId ?? undefined, invitation.workspaceId);
  if (inviter.userType !== "INTERNAL" || !inviterPermissions.includes("workspace.invite_users")) throw new AppError(403, "INVITATION_REVOKED", "La persona que invitó ya no puede autorizar accesos.");
  if (!inviterPermissions.includes("workspace.manage") && inviter.areaId !== invitation.areaId) throw new AppError(403, "INVITATION_SCOPE_CHANGED", "Solicita una invitación nueva al responsable de tu área.");
  if (!invitation.roleId) throw new AppError(400, "INVITATION_ROLE_REQUIRED", "Solicita una invitación con un rol definido.");
  await assertRoleGrant(invitation.invitedById, invitation.workspaceId, invitation.roleId, invitation.userType);

  const acceptedUser = await prisma.$transaction(async (tx) => {
    let invitedUser = await tx.user.findUnique({
      where: { email: invitation.email }
    });

    if (invitedUser && (!invitedUser.isActive || (invitedUser.passwordHash && (!password || !await verifyPassword(invitedUser.passwordHash, password))))) {
      throw new AppError(401, "INVALID_CREDENTIALS", "Introduce la contraseña de tu cuenta existente para aceptar la invitación.");
    }
    if (invitedUser) {
      const membership = await tx.workspaceMember.findUnique({ where: { workspaceId_userId: { workspaceId: invitation.workspaceId, userId: invitedUser.id } } });
      if (membership && membership.status !== "PENDING_APPROVAL" && membership.status !== "INVITED") throw new AppError(409, "MEMBER_ALREADY_EXISTS", "Tu acceso ya está definido. Administración debe modificarlo desde Personas.");
    }
    if (invitedUser && !invitedUser.passwordHash && !password) throw new AppError(400, "PASSWORD_REQUIRED", "Define una contraseña para tu cuenta.");

    if (!invitedUser) {
      if (!name || !password) {
        throw new AppError(400, "INVITATION_PROFILE_REQUIRED", "Name and password are required for new users.");
      }

      invitedUser = await tx.user.create({
        data: {
          name,
          email: invitation.email,
          passwordHash: await hashPassword(password)
        }
      });
    } else if (!invitedUser.passwordHash && password) {
      invitedUser = await tx.user.update({
        where: { id: invitedUser.id },
        data: {
          passwordHash: await hashPassword(password)
        }
      });
    }

    const invitationLocalityIds = uniqueStrings([
      ...invitation.localityScopes.map((localityScope) => localityScope.localityId),
      ...(invitation.localityId ? [invitation.localityId] : [])
    ]);

    const workspaceMember = await tx.workspaceMember.upsert({
      where: {
        workspaceId_userId: {
          workspaceId: invitation.workspaceId,
          userId: invitedUser.id
        }
      },
      update: {
        roleId: invitation.roleId,
        areaId: invitation.areaId,
        localityId: invitation.localityId,
        positionId: invitation.positionId,
        userType: invitation.userType,
        status: "ACTIVE",
        joinedAt: new Date()
      },
      create: {
        workspaceId: invitation.workspaceId,
        userId: invitedUser.id,
        roleId: invitation.roleId,
        areaId: invitation.areaId,
        localityId: invitation.localityId,
        positionId: invitation.positionId,
        userType: invitation.userType,
        status: "ACTIVE",
        joinedAt: new Date()
      }
    });

    await syncMemberLocalityScopes(tx, workspaceMember.id, invitationLocalityIds);

    if (invitation.projectId) {
      await tx.projectMember.upsert({
        where: {
          projectId_userId: {
            projectId: invitation.projectId,
            userId: invitedUser.id
          }
        },
        update: {
          roleId: invitation.roleId
        },
        create: {
          projectId: invitation.projectId,
          userId: invitedUser.id,
          roleId: invitation.roleId
        }
      });
    }

    await tx.invitation.update({
      where: { id: invitation.id, status: "PENDING" },
      data: {
        status: "ACCEPTED",
        acceptedAt: new Date()
      }
    });

    await tx.activityLog.create({
      data: {
        workspaceId: invitation.workspaceId,
        projectId: invitation.projectId,
        actorId: invitedUser.id,
        entityType: "INVITATION",
        entityId: invitation.id,
        action: "user.joined",
        after: {
          userId: invitedUser.id,
          userType: invitation.userType
        }
      }
    });

    return invitedUser;
  });

  const authTokens = await createSession(acceptedUser.id, req);

  res.json({
    user: toPublicUser(acceptedUser),
    tokens: authTokens
  });
}

export async function createInvitationToken() {
  const rawToken = generateOpaqueToken();
  return {
    rawToken,
    tokenHash: hashToken(rawToken)
  };
}

