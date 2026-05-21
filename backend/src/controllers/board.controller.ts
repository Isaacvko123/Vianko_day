import type { Request, Response } from "express";
import { prisma } from "../db/prisma.js";
import { activeRecordFilter } from "../db/filters.js";
import { assertProjectPermission } from "../services/access-control.service.js";
import { emitRealtimeEvent } from "../services/realtime.service.js";
import { AppError } from "../utils/app-error.js";
import { getParam } from "../utils/request.js";

export async function listBoards(req: Request, res: Response) {
  const userId = req.auth!.userId;
  const projectId = getParam(req, "projectId");

  await assertProjectPermission(userId, projectId, "task.view_all");

  const boards = await prisma.board.findMany({
    where: {
      projectId,
      ...activeRecordFilter
    },
    include: {
      statuses: {
        orderBy: { position: "asc" }
      }
    },
    orderBy: { position: "asc" }
  });

  res.json({ boards });
}

export async function createBoard(req: Request, res: Response) {
  const userId = req.auth!.userId;
  const projectId = getParam(req, "projectId");
  const { name, description } = req.body;
  const { project } = await assertProjectPermission(userId, projectId, "board.create");

  const board = await prisma.board.create({
    data: {
      workspaceId: project.workspaceId,
      projectId,
      name,
      description
    }
  });

  await prisma.activityLog.create({
    data: {
      workspaceId: project.workspaceId,
      projectId,
      actorId: userId,
      entityType: "BOARD",
      entityId: board.id,
      action: "board.created",
      after: {
        name
      }
    }
  });

  emitRealtimeEvent({
    type: "board.created",
    workspaceId: project.workspaceId,
    projectId,
    boardId: board.id,
    actorId: userId,
    title: "Tablero creado",
    message: `Se creo el tablero ${board.name}.`
  });

  res.status(201).json({ board });
}

export async function createBoardStatus(req: Request, res: Response) {
  const userId = req.auth!.userId;
  const boardId = getParam(req, "boardId");
  const board = await prisma.board.findFirst({
    where: {
      id: boardId,
      ...activeRecordFilter
    }
  });

  if (!board) {
    throw new AppError(404, "BOARD_NOT_FOUND", "Board not found.");
  }

  await assertProjectPermission(userId, board.projectId, "board.update");

  const status = await prisma.boardStatus.create({
    data: {
      boardId,
      name: req.body.name,
      color: req.body.color,
      position: req.body.position,
      category: req.body.category,
      countsAsDone: req.body.countsAsDone,
      isDefault: req.body.isDefault
    }
  });

  emitRealtimeEvent({
    type: "board.status_created",
    workspaceId: board.workspaceId,
    projectId: board.projectId,
    boardId,
    actorId: userId,
    title: "Estado creado",
    message: `Se creo el estado ${status.name}.`
  });

  res.status(201).json({ status });
}
