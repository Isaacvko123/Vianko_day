import { AppError } from "../utils/app-error.js";

type Planning = { startAt?: string | Date | null; dueAt?: string | Date | null };

export function assertTaskDateRange(planning: Planning) {
  if (planning.startAt && planning.dueAt && new Date(planning.dueAt) < new Date(planning.startAt)) {
    throw new AppError(400, "TASK_DATE_RANGE_INVALID", "La fecha de vencimiento no puede ser anterior al inicio.");
  }
}

export function resolveTaskPlanning(
  input: { startAt?: string; dueAt?: string; estimateMinutes?: number; clearFields?: string[] },
  current: Planning
) {
  const clearFields = new Set(input.clearFields ?? []);
  const updates = {
    startAt: clearFields.has("startAt") ? null : input.startAt === undefined ? undefined : new Date(input.startAt),
    dueAt: clearFields.has("dueAt") ? null : input.dueAt === undefined ? undefined : new Date(input.dueAt),
    estimateMinutes: clearFields.has("estimateMinutes") ? null : input.estimateMinutes
  };
  assertTaskDateRange({
    startAt: updates.startAt === undefined ? current.startAt : updates.startAt,
    dueAt: updates.dueAt === undefined ? current.dueAt : updates.dueAt
  });
  return updates;
}
