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
  active_tasks?: QueryNumber;
  completed_tasks: QueryNumber;
  blocked_tasks: QueryNumber;
  overdue_tasks: QueryNumber;
  late_tasks?: QueryNumber;
  unestimated_tasks?: QueryNumber;
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
  overdue_tasks?: QueryNumber;
  blocked_tasks?: QueryNumber;
  late_tasks?: QueryNumber;
  estimate_minutes?: QueryNumber;
  total_minutes: QueryNumber;
};

type ActivityReportRow = {
  task_id: string;
  project_id: string;
  project_name: string;
  title: string;
  description?: string;
  status_name: string;
  priority: string;
  start_at?: Date;
  due_at?: Date;
  completed_at?: Date;
  estimate_minutes?: QueryNumber;
  actual_minutes?: QueryNumber;
  assignee_names?: string;
  comment_count?: QueryNumber;
  subtask_count?: QueryNumber;
  delay_days?: QueryNumber;
};

type ReportPeriodKey = "week" | "month" | "bimester" | "semester" | "year";

const reportPeriods: Record<ReportPeriodKey, { label: string; days: number }> = {
  week: { label: "Semana", days: 7 },
  month: { label: "Mes", days: 30 },
  bimester: { label: "Bimestre", days: 60 },
  semester: { label: "Semestre", days: 183 },
  year: { label: "Año", days: 365 }
};

function getReportPeriod(req: Request) {
  const key = (typeof req.query.period === "string" ? req.query.period : "month") as ReportPeriodKey;
  const definition = reportPeriods[key] ?? reportPeriods.month;
  const end = new Date();
  const start = new Date(end);
  start.setDate(start.getDate() - definition.days + 1);
  start.setHours(0, 0, 0, 0);

  return {
    key,
    label: definition.label,
    start,
    end
  };
}

function taskPeriodSql(alias: "t" | "root" | "related", start: Date, end: Date) {
  const columnPrefix = Prisma.raw(`"${alias}".`);

  return Prisma.sql`
    AND (
      ${columnPrefix}"createdAt" BETWEEN ${start} AND ${end}
      OR ${columnPrefix}"startAt" BETWEEN ${start} AND ${end}
      OR ${columnPrefix}"dueAt" BETWEEN ${start} AND ${end}
      OR ${columnPrefix}"completedAt" BETWEEN ${start} AND ${end}
      OR EXISTS (
        SELECT 1
        FROM "TimeLog" period_tl
        WHERE period_tl."taskId" = ${columnPrefix}id
          AND period_tl."deletedAt" IS NULL
          AND period_tl."logDate" BETWEEN ${start} AND ${end}
      )
    )
  `;
}

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
    active_tasks: toOptionalNumber(row.active_tasks) ?? 0,
    completed_tasks: toNumber(row.completed_tasks),
    blocked_tasks: toNumber(row.blocked_tasks),
    overdue_tasks: toNumber(row.overdue_tasks),
    late_tasks: toOptionalNumber(row.late_tasks) ?? 0,
    unestimated_tasks: toOptionalNumber(row.unestimated_tasks) ?? 0,
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
    overdue_tasks: toOptionalNumber(row.overdue_tasks) ?? 0,
    blocked_tasks: toOptionalNumber(row.blocked_tasks) ?? 0,
    late_tasks: toOptionalNumber(row.late_tasks) ?? 0,
    estimate_minutes: toOptionalNumber(row.estimate_minutes) ?? 0,
    total_minutes: toNumber(row.total_minutes)
  };
}

function toIsoDate(value?: Date) {
  return value ? value.toISOString() : undefined;
}

function toActivityReportResponse(row: ActivityReportRow) {
  return {
    task_id: row.task_id,
    project_id: row.project_id,
    project_name: row.project_name,
    title: row.title,
    description: row.description ?? undefined,
    status_name: row.status_name,
    priority: row.priority,
    start_at: toIsoDate(row.start_at),
    due_at: toIsoDate(row.due_at),
    completed_at: toIsoDate(row.completed_at),
    estimate_minutes: toOptionalNumber(row.estimate_minutes) ?? 0,
    actual_minutes: toOptionalNumber(row.actual_minutes) ?? 0,
    assignee_names: row.assignee_names ?? "",
    comment_count: toOptionalNumber(row.comment_count) ?? 0,
    subtask_count: toOptionalNumber(row.subtask_count) ?? 0,
    delay_days: toOptionalNumber(row.delay_days) ?? 0
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
        COUNT(t.id) FILTER (WHERE bs."countsAsDone" = false) AS active_tasks,
        COUNT(t.id) FILTER (WHERE bs."countsAsDone" = true) AS completed_tasks,
        COUNT(t.id) FILTER (WHERE bs.category = 'BLOCKED') AS blocked_tasks,
        COUNT(t.id) FILTER (WHERE t."dueAt" < NOW() AND t."completedAt" IS NULL) AS overdue_tasks,
        COUNT(t.id) FILTER (WHERE t."completedAt" IS NOT NULL AND t."dueAt" IS NOT NULL AND t."completedAt" > t."dueAt") AS late_tasks,
        COUNT(t.id) FILTER (WHERE t."estimateMinutes" IS NULL) AS unestimated_tasks,
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
  const reportPeriod = getReportPeriod(req);

  await assertWorkspacePermission(userId, workspaceId, "report.view_workspace");

  const projectProgressRows = await prisma.$queryRaw<ProjectProgressRow[]>(
    Prisma.sql`
      WITH task_time AS (
        SELECT
          t.id AS task_id,
          COALESCE(SUM(tl.minutes), 0) AS actual_minutes
        FROM "Task" t
        LEFT JOIN "TimeLog" tl ON tl."taskId" = t.id AND tl."deletedAt" IS NULL
          AND tl."logDate" BETWEEN ${reportPeriod.start} AND ${reportPeriod.end}
        WHERE t."workspaceId" = ${workspaceId}
          AND t."deletedAt" IS NULL
          ${taskPeriodSql("t", reportPeriod.start, reportPeriod.end)}
        GROUP BY t.id
      )
      SELECT
        p.id AS project_id,
        p.name AS project_name,
        COUNT(t.id) AS total_tasks,
        COUNT(t.id) FILTER (WHERE bs."countsAsDone" = false) AS active_tasks,
        COUNT(t.id) FILTER (WHERE bs."countsAsDone" = true) AS completed_tasks,
        COUNT(t.id) FILTER (WHERE bs.category = 'BLOCKED') AS blocked_tasks,
        COUNT(t.id) FILTER (WHERE t."dueAt" < NOW() AND t."completedAt" IS NULL) AS overdue_tasks,
        COUNT(t.id) FILTER (WHERE t."completedAt" IS NOT NULL AND t."dueAt" IS NOT NULL AND t."completedAt" > t."dueAt") AS late_tasks,
        COUNT(t.id) FILTER (WHERE t."estimateMinutes" IS NULL) AS unestimated_tasks,
        COALESCE(SUM(t."estimateMinutes"), 0) AS estimate_minutes,
        COALESCE(SUM(task_time.actual_minutes), 0) AS actual_minutes,
        ROUND(
          COUNT(t.id) FILTER (WHERE bs."countsAsDone" = true)::decimal
          / NULLIF(COUNT(t.id), 0) * 100,
          2
        ) AS progress_percent
      FROM "Project" p
      LEFT JOIN "Task" t ON t."projectId" = p.id AND t."deletedAt" IS NULL
        ${taskPeriodSql("t", reportPeriod.start, reportPeriod.end)}
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
          COUNT(DISTINCT t.id) FILTER (WHERE t."completedAt" IS NOT NULL) AS completed_tasks,
          COUNT(DISTINCT t.id) FILTER (WHERE t."dueAt" < NOW() AND t."completedAt" IS NULL) AS overdue_tasks,
          COUNT(DISTINCT t.id) FILTER (WHERE bs.category = 'BLOCKED') AS blocked_tasks,
          COUNT(DISTINCT t.id) FILTER (WHERE t."completedAt" IS NOT NULL AND t."dueAt" IS NOT NULL AND t."completedAt" > t."dueAt") AS late_tasks,
          COALESCE(SUM(t."estimateMinutes"), 0) AS estimate_minutes
        FROM "TaskAssignee" ta
        JOIN "Task" t ON t.id = ta."taskId"
        JOIN "BoardStatus" bs ON bs.id = t."statusId"
        WHERE t."workspaceId" = ${workspaceId}
          AND t."deletedAt" IS NULL
          ${taskPeriodSql("t", reportPeriod.start, reportPeriod.end)}
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
          AND tl."logDate" BETWEEN ${reportPeriod.start} AND ${reportPeriod.end}
        GROUP BY tl."userId"
      )
      SELECT
        u.id AS user_id,
        u.name,
        COALESCE(assigned_tasks.assigned_tasks, 0) AS assigned_tasks,
        COALESCE(assigned_tasks.active_tasks, 0) AS active_tasks,
        COALESCE(assigned_tasks.completed_tasks, 0) AS completed_tasks,
        COALESCE(assigned_tasks.overdue_tasks, 0) AS overdue_tasks,
        COALESCE(assigned_tasks.blocked_tasks, 0) AS blocked_tasks,
        COALESCE(assigned_tasks.late_tasks, 0) AS late_tasks,
        COALESCE(assigned_tasks.estimate_minutes, 0) AS estimate_minutes,
        COALESCE(user_time.total_minutes, 0) AS total_minutes
      FROM "User" u
      JOIN "WorkspaceMember" wm ON wm."userId" = u.id AND wm."workspaceId" = ${workspaceId}
      LEFT JOIN assigned_tasks ON assigned_tasks.user_id = u.id
      LEFT JOIN user_time ON user_time.user_id = u.id
      WHERE wm.status = 'ACTIVE'
      GROUP BY u.id, u.name, assigned_tasks.assigned_tasks, assigned_tasks.active_tasks, assigned_tasks.completed_tasks, assigned_tasks.overdue_tasks, assigned_tasks.blocked_tasks, assigned_tasks.late_tasks, assigned_tasks.estimate_minutes, user_time.total_minutes
      ORDER BY completed_tasks DESC, total_minutes DESC
    `
  );

  const activityRows = await prisma.$queryRaw<ActivityReportRow[]>(
    Prisma.sql`
      WITH task_scope AS (
        SELECT
          root.id AS task_id,
          related.id AS related_task_id
        FROM "Task" root
        JOIN "Task" related ON related.id = root.id OR related."parentTaskId" = root.id
        WHERE root."workspaceId" = ${workspaceId}
          AND root."parentTaskId" IS NULL
          AND root."deletedAt" IS NULL
          AND related."deletedAt" IS NULL
          ${taskPeriodSql("root", reportPeriod.start, reportPeriod.end)}
      ),
      task_time AS (
        SELECT
          task_scope.task_id,
          COALESCE(SUM(tl.minutes), 0) AS actual_minutes
        FROM task_scope
        LEFT JOIN "TimeLog" tl ON tl."taskId" = task_scope.related_task_id
          AND tl."deletedAt" IS NULL
          AND tl."logDate" BETWEEN ${reportPeriod.start} AND ${reportPeriod.end}
        GROUP BY task_scope.task_id
      ),
      assignees AS (
        SELECT
          ta."taskId" AS task_id,
          STRING_AGG(u.name, ', ' ORDER BY u.name) AS assignee_names
        FROM "TaskAssignee" ta
        JOIN "User" u ON u.id = ta."userId"
        GROUP BY ta."taskId"
      )
      SELECT
        t.id AS task_id,
        p.id AS project_id,
        p.name AS project_name,
        t.title,
        t.description,
        bs.name AS status_name,
        t.priority,
        t."startAt" AS start_at,
        t."dueAt" AS due_at,
        t."completedAt" AS completed_at,
        COALESCE(t."estimateMinutes", 0) AS estimate_minutes,
        COALESCE(task_time.actual_minutes, 0) AS actual_minutes,
        COALESCE(assignees.assignee_names, '') AS assignee_names,
        COUNT(DISTINCT c.id) FILTER (WHERE c."deletedAt" IS NULL) AS comment_count,
        COUNT(DISTINCT st.id) FILTER (WHERE st."deletedAt" IS NULL) AS subtask_count,
        CASE
          WHEN t."dueAt" IS NULL THEN 0
          WHEN t."completedAt" IS NOT NULL AND t."completedAt" > t."dueAt" THEN CEIL(EXTRACT(EPOCH FROM (t."completedAt" - t."dueAt")) / 86400)
          WHEN t."completedAt" IS NULL AND t."dueAt" < NOW() THEN CEIL(EXTRACT(EPOCH FROM (NOW() - t."dueAt")) / 86400)
          ELSE 0
        END AS delay_days
      FROM "Task" t
      JOIN "Project" p ON p.id = t."projectId"
      JOIN "BoardStatus" bs ON bs.id = t."statusId"
      LEFT JOIN task_time ON task_time.task_id = t.id
      LEFT JOIN assignees ON assignees.task_id = t.id
      LEFT JOIN "Comment" c ON c."taskId" = t.id
      LEFT JOIN "Task" st ON st."parentTaskId" = t.id
      WHERE t."workspaceId" = ${workspaceId}
        AND t."parentTaskId" IS NULL
        AND t."deletedAt" IS NULL
        AND p."deletedAt" IS NULL
        ${taskPeriodSql("t", reportPeriod.start, reportPeriod.end)}
      GROUP BY t.id, p.id, p.name, bs.name, task_time.actual_minutes, assignees.assignee_names
      ORDER BY delay_days DESC, t."dueAt" ASC NULLS LAST, t."createdAt" DESC
      LIMIT 60
    `
  );

  res.json({
    period: {
      key: reportPeriod.key,
      label: reportPeriod.label,
      start: reportPeriod.start.toISOString(),
      end: reportPeriod.end.toISOString()
    },
    projects: projectProgressRows.map(toProjectProgressResponse),
    users: userProductivityRows.map(toUserProductivityResponse),
    activities: activityRows.map(toActivityReportResponse)
  });
}
