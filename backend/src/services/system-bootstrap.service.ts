import type { Prisma } from "@prisma/client";
import { env } from "../config/env.js";
import { prisma } from "../db/prisma.js";
import { activeRecordFilter } from "../db/filters.js";
import { hashPassword } from "../utils/crypto.js";
import {
  ensureDefaultAreaAndPositions,
  ensureDefaultBoard,
  ensureDefaultLocality,
  createDefaultRoles
} from "./workspace-bootstrap.service.js";

type Tx = Prisma.TransactionClient;

function requireBootstrapRecord<T>(record: T | undefined, label: string) {
  if (!record) {
    throw new Error(`System bootstrap could not resolve ${label}.`);
  }

  return record;
}

async function upsertInitialAdmin(tx: Tx) {
  const existingUser = await tx.user.findUnique({
    where: {
      email: env.INITIAL_ADMIN_EMAIL
    }
  });

  if (existingUser) {
    const updateData: Prisma.UserUpdateInput = {
      name: env.INITIAL_ADMIN_NAME,
      isActive: true
    };

    if (!existingUser.passwordHash) {
      updateData.passwordHash = await hashPassword(env.INITIAL_ADMIN_PASSWORD);
    }

    return tx.user.update({
      where: {
        id: existingUser.id
      },
      data: updateData
    });
  }

  return tx.user.create({
    data: {
      name: env.INITIAL_ADMIN_NAME,
      email: env.INITIAL_ADMIN_EMAIL,
      passwordHash: await hashPassword(env.INITIAL_ADMIN_PASSWORD),
      isActive: true
    }
  });
}

async function ensureInitialProject(tx: Tx, input: {
  workspaceId: string;
  areaId: string;
  localityId: string;
  adminUserId: string;
  adminRoleId: string;
}) {
  const projectName = "Operaciones TI";
  const existingProject = await tx.project.findFirst({
    where: {
      workspaceId: input.workspaceId,
      name: projectName,
      ...activeRecordFilter
    }
  });

  const project = existingProject
    ? await tx.project.update({
      where: {
        id: existingProject.id
      },
      data: {
        areaId: input.areaId,
        localityId: input.localityId,
        visibility: "PRIVATE"
      }
    })
    : await tx.project.create({
      data: {
        workspaceId: input.workspaceId,
        areaId: input.areaId,
        localityId: input.localityId,
        name: projectName,
        description: "Proyecto base para administrar soporte y seguimiento interno de TI.",
        visibility: "PRIVATE",
        createdById: input.adminUserId
      }
    });

  await tx.projectMember.upsert({
    where: {
      projectId_userId: {
        projectId: project.id,
        userId: input.adminUserId
      }
    },
    update: {
      roleId: input.adminRoleId
    },
    create: {
      projectId: project.id,
      userId: input.adminUserId,
      roleId: input.adminRoleId
    }
  });

  const board = await ensureDefaultBoard(tx, input.workspaceId, project.id);
  return { project, board };
}

/**
 * Bootstrap operativo del sistema.
 * Se ejecuta al iniciar el backend para que el primer admin exista siempre y con roles consistentes.
 */
export async function ensureSystemBootstrap() {
  await prisma.$transaction(async (tx) => {
    const workspace = await tx.workspace.upsert({
      where: {
        slug: env.INITIAL_WORKSPACE_SLUG
      },
      update: {
        name: env.INITIAL_WORKSPACE_NAME,
        isActive: true
      },
      create: {
        name: env.INITIAL_WORKSPACE_NAME,
        slug: env.INITIAL_WORKSPACE_SLUG,
        isActive: true
      }
    });

    const adminUser = await upsertInitialAdmin(tx);
    const rolesByName = await createDefaultRoles(tx, workspace.id);
    const { area: defaultArea, positionsByName } = await ensureDefaultAreaAndPositions(
      tx,
      workspace.id,
      env.INITIAL_DEFAULT_AREA_NAME
    );
    const defaultLocality = await ensureDefaultLocality(tx, workspace.id, {
      areaId: defaultArea.id,
      name: env.INITIAL_DEFAULT_LOCALITY_NAME,
      code: env.INITIAL_DEFAULT_LOCALITY_CODE
    });
    const adminRole = requireBootstrapRecord(rolesByName.get("Admin"), "Admin role");
    const adminPosition = requireBootstrapRecord(positionsByName.get("Admin TI"), "Admin TI position");
    const now = new Date();

    const adminMembership = await tx.workspaceMember.upsert({
      where: {
        workspaceId_userId: {
          workspaceId: workspace.id,
          userId: adminUser.id
        }
      },
      update: {
        roleId: adminRole.id,
        areaId: defaultArea.id,
        localityId: defaultLocality.id,
        positionId: adminPosition.id,
        userType: "INTERNAL",
        status: "ACTIVE",
        approvedById: adminUser.id,
        approvedAt: now,
        joinedAt: now
      },
      create: {
        workspaceId: workspace.id,
        userId: adminUser.id,
        roleId: adminRole.id,
        areaId: defaultArea.id,
        localityId: defaultLocality.id,
        positionId: adminPosition.id,
        userType: "INTERNAL",
        status: "ACTIVE",
        approvedById: adminUser.id,
        approvedAt: now,
        joinedAt: now
      }
    });

    await tx.workspaceMemberLocality.upsert({
      where: {
        workspaceMemberId_localityId: {
          workspaceMemberId: adminMembership.id,
          localityId: defaultLocality.id
        }
      },
      update: {},
      create: {
        workspaceMemberId: adminMembership.id,
        localityId: defaultLocality.id
      }
    });

    const { project, board } = await ensureInitialProject(tx, {
      workspaceId: workspace.id,
      areaId: defaultArea.id,
      localityId: defaultLocality.id,
      adminUserId: adminUser.id,
      adminRoleId: adminRole.id
    });

    await tx.activityLog.create({
      data: {
        workspaceId: workspace.id,
        projectId: project.id,
        actorId: adminUser.id,
        entityType: "WORKSPACE",
        entityId: workspace.id,
        action: "system.bootstrap_checked",
        after: {
          workspaceId: workspace.id,
          adminUserId: adminUser.id,
          areaId: defaultArea.id,
          localityId: defaultLocality.id,
          projectId: project.id,
          boardId: board.id
        }
      }
    });
  });
}
