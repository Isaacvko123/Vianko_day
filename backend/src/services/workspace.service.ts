import type { Prisma } from "@prisma/client";
import { env } from "../config/env.js";
import { generateOpaqueToken } from "../utils/crypto.js";
import { toSlug } from "../utils/slug.js";
import {
  createDefaultBoard,
  createDefaultRoles,
  ensureDefaultAreaAndPositions,
  ensureDefaultLocality
} from "./workspace-bootstrap.service.js";

type Tx = Prisma.TransactionClient;

/**
 * Crea la configuracion minima util de una empresa:
 * workspace, roles, membresia del owner, proyecto inicial y tablero con estados base.
 */
export async function bootstrapWorkspaceForOwner(tx: Tx, input: {
  ownerId: string;
  workspaceName: string;
}) {
  const workspaceSlug = `${toSlug(input.workspaceName) || "workspace"}-${generateOpaqueToken(4).slice(0, 8)}`;

  const workspace = await tx.workspace.create({
    data: {
      name: input.workspaceName,
      slug: workspaceSlug
    }
  });

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
  const adminRole = rolesByName.get("Admin");
  const adminPosition = positionsByName.get("Admin TI");

  if (!adminRole) {
    throw new Error("Admin role was not created.");
  }

  const ownerMembership = await tx.workspaceMember.create({
    data: {
      workspaceId: workspace.id,
      userId: input.ownerId,
      roleId: adminRole.id,
      areaId: defaultArea.id,
      localityId: defaultLocality.id,
      positionId: adminPosition?.id,
      status: "ACTIVE",
      userType: "INTERNAL",
      joinedAt: new Date()
    }
  });

  await tx.workspaceMemberLocality.create({
    data: {
      workspaceMemberId: ownerMembership.id,
      localityId: defaultLocality.id
    }
  });

  const project = await tx.project.create({
    data: {
      workspaceId: workspace.id,
      areaId: defaultArea.id,
      localityId: defaultLocality.id,
      name: "Proyecto inicial",
      description: "Primer proyecto operativo.",
      visibility: "WORKSPACE",
      createdById: input.ownerId
    }
  });

  await tx.projectMember.create({
    data: {
      projectId: project.id,
      userId: input.ownerId,
      roleId: adminRole.id
    }
  });

  const board = await createDefaultBoard(tx, workspace.id, project.id);

  await tx.activityLog.create({
    data: {
      workspaceId: workspace.id,
      projectId: project.id,
      actorId: input.ownerId,
      entityType: "WORKSPACE",
      entityId: workspace.id,
      action: "workspace.created",
      after: {
        workspaceId: workspace.id,
        projectId: project.id,
        boardId: board.id
      }
    }
  });

  return {
    workspace,
    project,
    board
  };
}
