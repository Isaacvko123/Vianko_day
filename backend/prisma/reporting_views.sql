CREATE OR REPLACE VIEW vw_task_time_summary AS
SELECT
  t.id AS task_id,
  t."workspaceId" AS workspace_id,
  t."projectId" AS project_id,
  t.title,
  t."estimateMinutes" AS estimate_minutes,
  COALESCE(SUM(tl.minutes), 0) AS actual_minutes,
  COALESCE(SUM(tl.minutes), 0) - COALESCE(t."estimateMinutes", 0) AS difference_minutes
FROM "Task" t
LEFT JOIN "TimeLog" tl
  ON tl."taskId" = t.id
  AND tl."deletedAt" IS NULL
WHERE t."deletedAt" IS NULL
GROUP BY
  t.id,
  t."workspaceId",
  t."projectId",
  t.title,
  t."estimateMinutes";

CREATE OR REPLACE VIEW vw_project_progress AS
SELECT
  p.id AS project_id,
  p."workspaceId" AS workspace_id,
  p.name AS project_name,
  COUNT(t.id) AS total_tasks,
  COUNT(t.id) FILTER (WHERE bs."countsAsDone" = true) AS completed_tasks,
  COUNT(t.id) FILTER (WHERE bs.category = 'BLOCKED') AS blocked_tasks,
  COUNT(t.id) FILTER (WHERE t."dueAt" < NOW() AND t."completedAt" IS NULL) AS overdue_tasks,
  ROUND(
    COUNT(t.id) FILTER (WHERE bs."countsAsDone" = true)::decimal
    / NULLIF(COUNT(t.id), 0) * 100,
    2
  ) AS progress_percent
FROM "Project" p
LEFT JOIN "Task" t
  ON t."projectId" = p.id
  AND t."deletedAt" IS NULL
LEFT JOIN "BoardStatus" bs
  ON bs.id = t."statusId"
WHERE p."deletedAt" IS NULL
GROUP BY p.id, p."workspaceId", p.name;
