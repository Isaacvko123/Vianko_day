export type GanttTask = {
  id: string;
  projectId: string;
  title: string;
  startAt?: string;
  dueAt?: string;
  progress: number;
  status: { name: string; category: string };
  project: { id: string; name: string };
  assignees: { user: { id: string; name: string } }[];
};

// Use calendar days, not elapsed hours, so daylight saving never moves a bar by a day.
export function calendarDay(value: Date | string) {
  const date = typeof value === 'string' ? new Date(value) : value;
  return Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86_400_000;
}

export function localDate(day: number) {
  const date = new Date(day * 86_400_000);
  return new Date(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

export function weekStart(day: number) {
  return day - (localDate(day).getDay() + 6) % 7;
}

export function taskDates(task: GanttTask) {
  const start = task.startAt ? calendarDay(task.startAt) : undefined;
  const due = task.dueAt ? calendarDay(task.dueAt) : undefined;
  const invalid = start !== undefined && due !== undefined && due < start;
  return { start, due, first: start ?? due, last: due ?? start, invalid };
}

export const shortDate = (day: number) => localDate(day).toLocaleDateString('es-MX', { day: 'numeric', month: 'short' });

export function describeDates(task: GanttTask) {
  const { start, due, invalid } = taskDates(task);
  if (invalid) return 'Revisar fechas: la entrega es anterior al inicio';
  if (start !== undefined && due !== undefined) return `${shortDate(start)} → ${shortDate(due)}`;
  if (due !== undefined) return `Entrega ${shortDate(due)} · sin inicio definido`;
  if (start !== undefined) return `Inicio ${shortDate(start)} · sin entrega definida`;
  return 'Sin fechas definidas';
}
