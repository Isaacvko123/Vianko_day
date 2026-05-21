import type { Request, Response } from "express";
import { Prisma } from "@prisma/client";
import { prisma } from "../db/prisma.js";
import { assertProjectPermission, assertWorkspacePermission } from "../services/access-control.service.js";
import { getParam } from "../utils/request.js";

type QueryNumber = number | bigint | Prisma.Decimal | undefined;

type ProjectProgressRow = {
  project_id: string;
  project_name: string;
  total_tasks: QueryNumber;
  completed_tasks: QueryNumber;
  blocked_tasks: QueryNumber;
  overdue_tasks: QueryNumber;
  estimate_minutes?: QueryNumber;
  actual_minutes?: QueryNumber;
  progress_percent?: QueryNumber;
};

type UserProductivityRow = {
  user_id: string;
  name: string;
  assigned_tasks?: QueryNumber;
  active_tasks?: QueryNumber;
  completed_tasks: QueryNumber;
  total_minutes: QueryNumber;
};

function toNumber(value: QueryNumber) {
  if (value instanceof Prisma.Decimal) {
    return value.toNumber();
  }

  return typeof value === "bigint" ? Number(value) : Number(value ?? 0);
}

function toOptionalNumber(value: QueryNumber) {
  return value == undefined ? undefined : toNumber(value);
}

function toProjectProgressResponse(row: ProjectProgressRow) {
  return {
    project_id: row.project_id,
    project_name: row.project_name,
    total_tasks: toNumber(row.total_tasks),
    completed_tasks: toNumber(row.completed_tasks),
    blocked_tasks: toNumber(row.blocked_tasks),
    overdue_tasks: toNumber(row.overdue_tasks),
    estimate_minutes: toOptionalNumber(row.estimate_minutes),
    actual_minutes: toOptionalNumber(row.actual_minutes),
    progress_percent: toOptionalNumber(row.progress_percent)
  };
}

function toUserProductivityResponse(row: UserProductivityRow) {
  return {
    user_id: row.user_id,
    name: row.name,
    assigned_tasks: toOptionalNumber(row.assigned_tasks) ?? 0,
    active_tasks: toOptionalNumber(row.active_tasks) ?? 0,
    completed_tasks: toNumber(row.completed_tasks),
    total_minutes: toNumber(row.total_minutes)
  };
}

export async function projectProgress(req: Request, res: Response) {
  const userId = req.auth!.userId;
  const projectId = getParam(req, "projectId");
  const { project } = await assertProjectPermission(userId, projectId, "report.view_project");

  // Primero agregamos tiempo por tarea; unir TimeLog directo duplica estimaciones.
  const [summary] = await prisma.$queryRaw<ProjectProgressRow[]>(
    Prisma.sql`
      WITH task_time AS (
        SELECT
          t.id AS task_id,
          COALESCE(SUM(tl.minutes), 0) AS actual_minutes
        FROM "Task" t
        LEFT JOIN "TimeLog" tl ON tl."taskId" = t.id AND tl."deletedAt" IS NULL
        WHERE t."projectId" = ${project.id}
          AND t."deletedAt" IS NULL
        GROUP BY t.id
      )
      SELECT
        p.id AS project_id,
        p.name AS project_name,
        COUNT(t.id) AS total_tasks,
        COUNT(t.id) FILTER (WHERE bs."countsAsDone" = true) AS completed_tasks,
        COUNT(t.id) FILTER (WHERE bs.category = 'BLOCKED') AS blocked_tasks,
        COUNT(t.id) FILTER (WHERE t."dueAt" < NOW() AND t."completedAt" IS NULL) AS overdue_tasks,
        COALESCE(SUM(t."estimateMinutes"), 0) AS estimate_minutes,
        COALESCE(SUM(task_time.actual_minutes), 0) AS actual_minutes,
        ROUND(
          COUNT(t.id) FILTER (WHERE bs."countsAsDone" = true)::decimal
          / NULLIF(COUNT(t.id), 0) * 100,
          2
        ) AS progress_percent
      FROM "Project" p
      LEFT JOIN "Task" t ON t."projectId" = p.id AND t."deletedAt" IS NULL
      LEFT JOIN "BoardStatus" bs ON bs.id = t."statusId"
      LEFT JOIN task_time ON task_time.task_id = t.id
      WHERE p.id = ${project.id}
      GROUP BY p.id, p.name
    `
  );

  res.json({
    summary: summary ? toProjectProgressResponse(summary) : undefined
  });
}

export async function workspaceSummary(req: Request, res: Response) {
  const userId = req.auth!.userId;
  const workspaceId = getParam(req, "workspaceId");

  await assertWorkspacePermission(userId, workspaceId, "report.view_workspace");

  const projectProgressRows = await prisma.$queryRaw<ProjectProgressRow[]>(
    Prisma.sql`
      WITH task_time AS (
        SELECT
          t.id AS task_id,
          COALESCE(SUM(tl.minutes), 0) AS actual_minutes
        FROM "Task" t
        LEFT JOIN "TimeLog" tl ON tl."taskId" = t.id AND tl."deletedAt" IS NULL
        WHERE t."workspaceId" = ${workspaceId}
          AND t."deletedAt" IS NULL
        GROUP BY t.id
      )
      SELECT
        p.id AS project_id,
        p.name AS project_name,
        COUNT(t.id) AS total_tasks,
        COUNT(t.id) FILTER (WHERE bs."countsAsDone" = true) AS completed_tasks,
        COUNT(t.id) FILTER (WHERE bs.category = 'BLOCKED') AS blocked_tasks,
        COUNT(t.id) FILTER (WHERE t."dueAt" < NOW() AND t."completedAt" IS NULL) AS overdue_tasks,
        COALESCE(SUM(t."estimateMinutes"), 0) AS estimate_minutes,
        COALESCE(SUM(task_time.actual_minutes), 0) AS actual_minutes,
        ROUND(
          COUNT(t.id) FILTER (WHERE bs."countsAsDone" = true)::decimal
          / NULLIF(COUNT(t.id), 0) * 100,
          2
        ) AS progress_percent
      FROM "Project" p
      LEFT JOIN "Task" t ON t."projectId" = p.id AND t."deletedAt" IS NULL
      LEFT JOIN "BoardStatus" bs ON bs.id = t."statusId"
      LEFT JOIN task_time ON task_time.task_id = t.id
      WHERE p."workspaceId" = ${workspaceId}
        AND p."deletedAt" IS NULL
      GROUP BY p.id, p.name
      ORDER BY p.name
    `
  );

  const userProductivityRows = await prisma.$queryRaw<UserProductivityRow[]>(
    Prisma.sql`
      WITH assigned_tasks AS (
        SELECT
          ta."userId" AS user_id,
          COUNT(DISTINCT t.id) AS assigned_tasks,
          COUNT(DISTINCT t.id) FILTER (WHERE t."completedAt" IS NULL) AS active_tasks,
          COUNT(DISTINCT t.id) FILTER (WHERE t."completedAt" IS NOT NULL) AS completed_tasks
        FROM "TaskAssignee" ta
        JOIN "Task" t ON t.id = ta."taskId"
        WHERE t."workspaceId" = ${workspaceId}
          AND t."deletedAt" IS NULL
        GROUP BY ta."userId"
      ),
      user_time AS (
        SELECT
          tl."userId" AS user_id,
          COALESCE(SUM(tl.minutes), 0) AS total_minutes
        FROM "TimeLog" tl
        JOIN "Task" t ON t.id = tl."taskId"
        WHERE t."workspaceId" = ${workspaceId}
          AND t."deletedAt" IS NULL
          AND tl."deletedAt" IS NULL
        GROUP BY tl."userId"
      )
      SELECT
        u.id AS user_id,
        u.name,
        COALESCE(assigned_tasks.assigned_tasks, 0) AS assigned_tasks,
        COALESCE(assigned_tasks.active_tasks, 0) AS active_tasks,
        COALESCE(assigned_tasks.completed_tasks, 0) AS completed_tasks,
        COALESCE(user_time.total_minutes, 0) AS total_minutes
      FROM "User" u
      JOIN "WorkspaceMember" wm ON wm."userId" = u.id AND wm."workspaceId" = ${workspaceId}
      LEFT JOIN assigned_tasks ON assigned_tasks.user_id = u.id
      LEFT JOIN user_time ON user_time.user_id = u.id
      WHERE wm.status = 'ACTIVE'
      GROUP BY u.id, u.name, assigned_tasks.assigned_tasks, assigned_tasks.active_tasks, assigned_tasks.completed_tasks, user_time.total_minutes
      ORDER BY completed_tasks DESC, total_minutes DESC
    `
  );

  res.json({
    projects: projectProgressRows.map(toProjectProgressResponse),
    users: userProductivityRows.map(toUserProductivityResponse)
  });
}
