import type { BoardStatus, Task, TaskPriority } from "../types";
import { getDueSummary } from "./format";

export const priorityLabels: Record<TaskPriority, string> = { LOW: "Baja", MEDIUM: "Media", HIGH: "Alta", URGENT: "Urgente" };
const priorityOrder: Record<TaskPriority, number> = { URGENT: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };

export type TaskFocus = "all" | "mine" | "overdue" | "today" | "blocked" | "unassigned";
export type TaskSort = "due" | "priority" | "updated" | "title";
export type TaskFilters = { search: string; focus: TaskFocus; priority: string; assigneeId: string; sort: TaskSort };
export const defaultTaskFilters: TaskFilters = { search: "", focus: "all", priority: "", assigneeId: "", sort: "due" };

export function isTaskDone(task: Task, statuses: BoardStatus[] = []) {
  return (statuses.find((status) => status.id === task.statusId) ?? task.status)?.countsAsDone ?? Boolean(task.completedAt);
}

export function canMoveTask(task: Task, statuses: BoardStatus[], userId: string, canChangeStatus: boolean, canReopen: boolean) {
  return task.capabilities?.canChangeStatus === true;
}

function normalize(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("es");
}

export function filterAndSortTasks(tasks: Task[], statuses: BoardStatus[], filters: TaskFilters, userId: string) {
  const words = normalize(filters.search.trim()).split(/\s+/).filter(Boolean);
  return tasks.filter((task) => {
    const assignees = task.assignees ?? [];
    const status = statuses.find((item) => item.id === task.statusId) ?? task.status;
    const searchable = normalize([task.title, task.description, ...assignees.map((item) => item.user.name)].join(" "));
    if (!words.every((word) => searchable.includes(word))) return false;
    if (filters.priority && task.priority !== filters.priority) return false;
    if (filters.assigneeId && !assignees.some((item) => item.userId === filters.assigneeId)) return false;
    const due = getDueSummary(task.dueAt, isTaskDone(task, statuses));
    switch (filters.focus) {
      case "mine": return assignees.some((item) => item.userId === userId);
      case "overdue": return due.tone === "overdue";
      case "today": return due.tone === "today";
      case "blocked": return status?.category === "BLOCKED" && !isTaskDone(task, statuses);
      case "unassigned": return assignees.length === 0 && !isTaskDone(task, statuses);
      default: return true;
    }
  }).sort((left, right) => {
    let result = 0;
    switch (filters.sort) {
      case "priority": result = priorityOrder[left.priority] - priorityOrder[right.priority]; break;
      case "updated": result = right.updatedAt.localeCompare(left.updatedAt); break;
      case "title": result = left.title.localeCompare(right.title, "es"); break;
      case "due": result = (left.dueAt ?? "9999").localeCompare(right.dueAt ?? "9999"); break;
    }
    return result || left.id.localeCompare(right.id);
  });
}

// The API omits cleared fields; replace them explicitly instead of retaining stale values.
export function mergeTaskUpdate(current: Task, updated: Task): Task {
  return { ...current, ...updated, completedAt: updated.completedAt, startAt: updated.startAt,
    dueAt: updated.dueAt, estimateMinutes: updated.estimateMinutes, description: updated.description };
}

export function taskStatusOptions(task: Task, statuses: BoardStatus[]) {
  return statuses.filter((status) => status.id === task.statusId || task.capabilities?.allowedStatusIds.includes(status.id));
}
