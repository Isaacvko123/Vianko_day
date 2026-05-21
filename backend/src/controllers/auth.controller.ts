import { prisma } from "../db/prisma.js";
import { activeRecordFilter } from "../db/filters.js";
import type { Prisma, User } from "@prisma/client";
import { AppError } from "../utils/app-error.js";
import { generateOpaqueToken, hashPassword, hashToken, verifyPassword } from "../utils/crypto.js";
import { createSession, revokeSession, rotateSession } from "../services/auth.service.js";
import { bootstrapWorkspaceForOwner } from "../services/workspace.service.js";
import type { Request, Response } from "express";
import { getQueryString } from "../utils/request.js";

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

export async function register(req: Request, res: Response) {
  const { name, email, password, workspaceName } = req.body;
  const passwordHash = await hashPassword(password);

  const registrationResult = await prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: {
        name,
        email,
        passwordHash
      }
    });

    const initialWorkspace = await bootstrapWorkspaceForOwner(tx, {
      ownerId: user.id,
      workspaceName
    });

    return {
      user,
      ...initialWorkspace
    };
  });

  const authTokens = await createSession(registrationResult.user.id, req);

  res.status(201).json({
    user: toPublicUser(registrationResult.user),
    workspace: registrationResult.workspace,
    project: registrationResult.project,
    board: registrationResult.board,
    tokens: authTokens
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

  const acceptedUser = await prisma.$transaction(async (tx) => {
    let invitedUser = await tx.user.findUnique({
      where: { email: invitation.email }
    });

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
      where: { id: invitation.id },
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

export async function getRegistrationOptions(req: Request, res: Response) {
  const workspaceSlug = getQueryString(req, "workspaceSlug");
  const workspace = await prisma.workspace.findFirst({
    where: {
      slug: workspaceSlug,
      isActive: true,
      ...activeRecordFilter
    },
    select: {
      id: true,
      name: true,
      slug: true,
      areas: {
        orderBy: [{ isDefault: "desc" }, { name: "asc" }]
      },
      positions: {
        include: {
          area: true
        },
        orderBy: [{ isManager: "desc" }, { name: "asc" }]
      },
      localities: {
        include: {
          area: true
        },
        orderBy: [{ isDefault: "desc" }, { name: "asc" }]
      }
    }
  });

  if (!workspace) {
    throw new AppError(404, "WORKSPACE_NOT_FOUND", "Workspace was not found.");
  }

  res.json({
    workspace: {
      id: workspace.id,
      name: workspace.name,
      slug: workspace.slug
    },
    areas: workspace.areas,
    localities: workspace.localities,
    positions: workspace.positions
  });
}

export async function requestAccess(req: Request, res: Response) {
  const { workspaceSlug, name, email, password, areaId, localityId, positionId, userType } = req.body;
  const workspace = await prisma.workspace.findFirst({
    where: {
      slug: workspaceSlug,
      isActive: true,
      ...activeRecordFilter
    }
  });

  if (!workspace) {
    throw new AppError(404, "WORKSPACE_NOT_FOUND", "Workspace was not found.");
  }

  const area = await prisma.area.findFirst({
    where: {
      id: areaId,
      workspaceId: workspace.id
    }
  });

  if (!area) {
    throw new AppError(400, "AREA_INVALID", "Area does not belong to this workspace.");
  }

  const locality = await prisma.locality.findFirst({
    where: {
      id: localityId,
      workspaceId: workspace.id
    }
  });

  if (!locality) {
    throw new AppError(400, "LOCALITY_INVALID", "Locality does not belong to this workspace.");
  }

  if (locality.areaId && locality.areaId !== area.id) {
    throw new AppError(400, "LOCALITY_AREA_INVALID", "Locality does not belong to the selected area.");
  }

  const position = await prisma.position.findFirst({
    where: {
      id: positionId,
      workspaceId: workspace.id
    }
  });

  if (!position) {
    throw new AppError(400, "POSITION_INVALID", "Position does not belong to this workspace.");
  }

  if (position.areaId && position.areaId !== area.id) {
    throw new AppError(400, "POSITION_AREA_INVALID", "Position does not belong to the selected area.");
  }

  const member = await prisma.$transaction(async (tx) => {
    const existingUser = await tx.user.findUnique({
      where: { email }
    });

    const user = existingUser
      ? await tx.user.update({
        where: { id: existingUser.id },
        data: existingUser.passwordHash
          ? { name }
          : {
            name,
            passwordHash: await hashPassword(password)
          }
      })
      : await tx.user.create({
        data: {
          name,
          email,
          passwordHash: await hashPassword(password)
        }
      });

    const existingMember = await tx.workspaceMember.findUnique({
      where: {
        workspaceId_userId: {
          workspaceId: workspace.id,
          userId: user.id
        }
      }
    });

    if (existingMember?.status === "ACTIVE") {
      throw new AppError(409, "MEMBER_ALREADY_ACTIVE", "This user already belongs to the workspace.");
    }

    if (existingMember?.status === "SUSPENDED" || existingMember?.status === "REMOVED") {
      throw new AppError(409, "MEMBER_BLOCKED", "This user cannot request access from the public form.");
    }

    const requestedMember = await tx.workspaceMember.upsert({
      where: {
        workspaceId_userId: {
          workspaceId: workspace.id,
          userId: user.id
        }
      },
      update: {
        areaId: area.id,
        localityId: locality.id,
        positionId: position.id,
        userType,
        status: "PENDING_APPROVAL"
      },
      create: {
        workspaceId: workspace.id,
        userId: user.id,
        areaId: area.id,
        localityId: locality.id,
        positionId: position.id,
        userType,
        status: "PENDING_APPROVAL"
      }
    });

    await syncMemberLocalityScopes(tx, requestedMember.id, [locality.id]);

    await tx.activityLog.create({
      data: {
        workspaceId: workspace.id,
        actorId: user.id,
        entityType: "USER",
        entityId: user.id,
        action: "user.registration_requested",
        after: {
          userId: user.id,
          areaId: area.id,
          localityId: locality.id,
          positionId: position.id,
          userType
        }
      }
    });

    return requestedMember;
  });

  res.status(202).json({
    status: member.status,
    memberId: member.id,
    workspace: {
      id: workspace.id,
      name: workspace.name,
      slug: workspace.slug
    }
  });
}
