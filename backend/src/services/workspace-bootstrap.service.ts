import type { Position, Prisma, Role } from "@prisma/client";
import { DEFAULT_BOARD_STATUSES, PERMISSIONS, ROLE_DEFINITIONS } from "../models/permissions.js";

type Tx = Prisma.TransactionClient;

const DEFAULT_POSITIONS = [
  {
    name: "Admin TI",
    description: "Administracion tecnica completa del sistema.",
    isManager: true
  },
  {
    name: "Lider TI",
    description: "Coordina soporte, usuarios y seguimiento tecnico sin crear proyectos.",
    isManager: true
  },
  {
    name: "Developer",
    description: "Actualiza estados, avances, comentarios y tiempo trabajado.",
    isManager: false
  },
  {
    name: "Gerente",
    description: "Responsable de proyectos, actividades y aprobacion de su area.",
    isManager: true
  },
  {
    name: "Colaborador",
    description: "Participa en actividades asignadas y reporta avance.",
    isManager: false
  }
] as const;

/** Crea permisos primero y luego los conecta a los roles del workspace. */
export async function createDefaultRoles(tx: Tx, workspaceId: string) {
  const permissionIdByKey = new Map<string, string>();

  for (const permission of PERMISSIONS) {
    const permissionRecord = await tx.permission.upsert({
      where: {
        workspaceId_key: {
          workspaceId,
          key: permission.key
        }
      },
      update: {
        description: permission.description
      },
      create: {
        workspaceId,
        key: permission.key,
        description: permission.description
      }
    });

    permissionIdByKey.set(permission.key, permissionRecord.id);
  }

  const roleByName = new Map<string, Role>();

  for (const roleDefinition of ROLE_DEFINITIONS) {
    const role = await tx.role.upsert({
      where: {
        workspaceId_name: {
          workspaceId,
          name: roleDefinition.name
        }
      },
      update: {
        description: roleDefinition.description,
        isSystem: true
      },
      create: {
        workspaceId,
        name: roleDefinition.name,
        description: roleDefinition.description,
        isSystem: true
      }
    });

    roleByName.set(role.name, role);

    const expectedPermissionIds: string[] = [];

    for (const permissionKey of roleDefinition.permissions) {
      const permissionId = permissionIdByKey.get(permissionKey);

      if (!permissionId) {
        continue;
      }

      expectedPermissionIds.push(permissionId);

      await tx.rolePermission.upsert({
        where: {
          roleId_permissionId: {
            roleId: role.id,
            permissionId
          }
        },
        update: {},
        create: {
          roleId: role.id,
          permissionId
        }
      });
    }

    await tx.rolePermission.deleteMany({
      where: {
        roleId: role.id,
        permissionId: {
          notIn: expectedPermissionIds
        }
      }
    });
  }

  return roleByName;
}

/**
 * Toda empresa nace con un area operativa de TI y puestos base.
 * Los roles autorizan; los puestos explican la estructura humana del area.
 */
export async function ensureDefaultAreaAndPositions(tx: Tx, workspaceId: string, areaName: string) {
  const area = await tx.area.upsert({
    where: {
      workspaceId_name: {
        workspaceId,
        name: areaName
      }
    },
    update: {
      description: "Area tecnica inicial del workspace.",
      isDefault: true
    },
    create: {
      workspaceId,
      name: areaName,
      description: "Area tecnica inicial del workspace.",
      isDefault: true
    }
  });

  const positionsByName = new Map<string, Position>();

  for (const positionSeed of DEFAULT_POSITIONS) {
    const position = await tx.position.upsert({
      where: {
        workspaceId_areaId_name: {
          workspaceId,
          areaId: area.id,
          name: positionSeed.name
        }
      },
      update: {
        description: positionSeed.description,
        isManager: positionSeed.isManager
      },
      create: {
        workspaceId,
        areaId: area.id,
        name: positionSeed.name,
        description: positionSeed.description,
        isManager: positionSeed.isManager
      }
    });

    positionsByName.set(position.name, position);
  }

  return { area, positionsByName };
}

/** Localidad inicial para que TI nazca en GDL y despues puedan agregarse mas sedes. */
export async function ensureDefaultLocality(tx: Tx, workspaceId: string, input: {
  areaId: string;
  name: string;
  code: string;
}) {
  const existingLocality = await tx.locality.findFirst({
    where: {
      workspaceId,
      code: input.code
    }
  });

  if (existingLocality) {
    return tx.locality.update({
      where: {
        id: existingLocality.id
      },
      data: {
        areaId: input.areaId,
        name: input.name,
        description: "Localidad inicial del workspace.",
        isDefault: true
      }
    });
  }

  const locality = await tx.locality.create({
    data: {
      workspaceId,
      areaId: input.areaId,
      name: input.name,
      code: input.code,
      description: "Localidad inicial del workspace.",
      isDefault: true
    }
  });

  return locality;
}

async function createDefaultStatuses(tx: Tx, boardId: string) {
  for (const status of DEFAULT_BOARD_STATUSES) {
    await tx.boardStatus.upsert({
      where: {
        boardId_name: {
          boardId,
          name: status.name
        }
      },
      update: {
        color: status.color,
        position: status.position,
        category: status.category,
        countsAsDone: status.countsAsDone,
        isDefault: status.isDefault
      },
      create: {
        boardId,
        name: status.name,
        color: status.color,
        position: status.position,
        category: status.category,
        countsAsDone: status.countsAsDone,
        isDefault: status.isDefault
      }
    });
  }
}

/** El primer tablero es simple a proposito: estados utiles primero, personalizacion despues. */
export async function createDefaultBoard(tx: Tx, workspaceId: string, projectId: string) {
  const board = await tx.board.create({
    data: {
      workspaceId,
      projectId,
      name: "Actividades",
      description: "Tablero operativo principal.",
      position: 0
    }
  });

  await createDefaultStatuses(tx, board.id);

  return board;
}

/** Version idempotente para arranque del sistema; no duplica tableros ni estados. */
export async function ensureDefaultBoard(tx: Tx, workspaceId: string, projectId: string) {
  const existingBoard = await tx.board.findFirst({
    where: {
      workspaceId,
      projectId,
      name: "Actividades"
    }
  });

  if (existingBoard) {
    await createDefaultStatuses(tx, existingBoard.id);
    return existingBoard;
  }

  return createDefaultBoard(tx, workspaceId, projectId);
}
