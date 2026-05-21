import { Router } from "express";
import { createBoard, createBoardStatus, listBoards } from "../controllers/board.controller.js";
import { authenticate } from "../middleware/authenticate.js";
import { validate } from "../middleware/validate.js";
import { asyncHandler } from "../utils/async-handler.js";
import { createBoardSchema, createBoardStatusSchema, listBoardsSchema } from "../validators/board.schemas.js";

export const boardRouter = Router();

boardRouter.use(authenticate);
boardRouter.get("/projects/:projectId/boards", validate(listBoardsSchema), asyncHandler(listBoards));
boardRouter.post("/projects/:projectId/boards", validate(createBoardSchema), asyncHandler(createBoard));
boardRouter.post("/boards/:boardId/statuses", validate(createBoardStatusSchema), asyncHandler(createBoardStatus));
