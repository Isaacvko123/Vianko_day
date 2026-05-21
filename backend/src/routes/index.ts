import { Router } from "express";
import { authRouter } from "./auth.routes.js";
import { boardRouter } from "./board.routes.js";
import { projectRouter } from "./project.routes.js";
import { reportRouter } from "./report.routes.js";
import { staffingRouter } from "./staffing.routes.js";
import { taskRouter } from "./task.routes.js";
import { workspaceRouter } from "./workspace.routes.js";

export const apiRouter = Router();

apiRouter.use("/auth", authRouter);
apiRouter.use("/workspaces", workspaceRouter);
apiRouter.use("/projects", projectRouter);
apiRouter.use("/", boardRouter);
apiRouter.use("/", taskRouter);
apiRouter.use("/staffing-requests", staffingRouter);
apiRouter.use("/reports", reportRouter);
