import { Router } from "express";
import {
  addTaskAssignee,
  changeTaskStatus,
  createComment,
  createTask,
  createTimeLog,
  listComments,
  listSubtasks,
  listTaskEvents,
  listTasks,
  listTimeLogs,
  mentionTaskUser,
  removeTaskAssignee,
  updateTask
} from "../controllers/task.controller.js";
import { authenticate } from "../middleware/authenticate.js";
import { validate } from "../middleware/validate.js";
import { asyncHandler } from "../utils/async-handler.js";
import {
  changeTaskStatusSchema,
  createCommentSchema,
  createTaskSchema,
  createTimeLogSchema,
  listTasksSchema,
  taskIdParamsSchema,
  taskAssigneeSchema,
  updateTaskSchema
} from "../validators/task.schemas.js";

export const taskRouter = Router();

taskRouter.use(authenticate);
taskRouter.get("/boards/:boardId/tasks", validate(listTasksSchema), asyncHandler(listTasks));
taskRouter.post("/boards/:boardId/tasks", validate(createTaskSchema), asyncHandler(createTask));
taskRouter.get("/tasks/:taskId/subtasks", validate(taskIdParamsSchema), asyncHandler(listSubtasks));
taskRouter.patch("/tasks/:taskId", validate(updateTaskSchema), asyncHandler(updateTask));
taskRouter.patch("/tasks/:taskId/status", validate(changeTaskStatusSchema), asyncHandler(changeTaskStatus));
taskRouter.post("/tasks/:taskId/assignees", validate(taskAssigneeSchema), asyncHandler(addTaskAssignee));
taskRouter.post("/tasks/:taskId/mentions", validate(taskAssigneeSchema), asyncHandler(mentionTaskUser));
taskRouter.delete("/tasks/:taskId/assignees/:userId", validate(taskAssigneeSchema), asyncHandler(removeTaskAssignee));
taskRouter.get("/tasks/:taskId/comments", validate(createCommentSchema.pick({ params: true })), asyncHandler(listComments));
taskRouter.post("/tasks/:taskId/comments", validate(createCommentSchema), asyncHandler(createComment));
taskRouter.get("/tasks/:taskId/time-logs", validate(createTimeLogSchema.pick({ params: true })), asyncHandler(listTimeLogs));
taskRouter.post("/tasks/:taskId/time-logs", validate(createTimeLogSchema), asyncHandler(createTimeLog));
taskRouter.get("/tasks/:taskId/events", validate(createCommentSchema.pick({ params: true })), asyncHandler(listTaskEvents));
