export function formatMinutes(minutes: number) {
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;

  if (hours === 0) {
    return `${remainingMinutes} min`;
  }

  if (remainingMinutes === 0) {
    return `${hours} h`;
  }

  return `${hours} h ${remainingMinutes} min`;
}

const dayInMilliseconds = 24 * 60 * 60 * 1000;

function calendarTimestamp(value: string) {
  const [yearText, monthText, dayText] = value.slice(0, 10).split("-");
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);

  if (!year || !month || !day) {
    return undefined;
  }

  return Date.UTC(year, month - 1, day);
}

function todayCalendarTimestamp() {
  const today = new Date();
  return Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
}

export function formatDate(value?: string) {
  if (!value) {
    return "Sin fecha";
  }

  return new Intl.DateTimeFormat("es-MX", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC"
  }).format(new Date(value));
}

export function getRangeLabel(startAt?: string, dueAt?: string) {
  if (!startAt && !dueAt) {
    return "Sin rango";
  }

  if (!startAt) {
    return "Solo fin definido";
  }

  if (!dueAt) {
    return "Solo inicio definido";
  }

  const startDay = calendarTimestamp(startAt);
  const dueDay = calendarTimestamp(dueAt);

  if (startDay === undefined || dueDay === undefined) {
    return "Fechas invalidas";
  }

  const durationDays = Math.round((dueDay - startDay) / dayInMilliseconds) + 1;

  if (durationDays < 1) {
    return "Fechas invertidas";
  }

  if (durationDays === 1) {
    return "Plazo 1 dia";
  }

  return `Plazo ${durationDays} dias`;
}

export function getDueSummary(dueAt?: string, isDone = false) {
  if (isDone) {
    return {
      label: "Completada",
      tone: "done"
    };
  }

  if (!dueAt) {
    return {
      label: "Sin fecha fin",
      tone: "none"
    };
  }

  const dueDay = calendarTimestamp(dueAt);

  if (dueDay === undefined) {
    return {
      label: "Fecha invalida",
      tone: "none"
    };
  }

  const daysLeft = Math.round((dueDay - todayCalendarTimestamp()) / dayInMilliseconds);

  if (daysLeft < 0) {
    const overdueDays = Math.abs(daysLeft);
    return {
      label: overdueDays === 1 ? "Vencida ayer" : `Vencida hace ${overdueDays} dias`,
      tone: "overdue"
    };
  }

  if (daysLeft === 0) {
    return {
      label: "Vence hoy",
      tone: "today"
    };
  }

  if (daysLeft === 1) {
    return {
      label: "Vence manana",
      tone: "soon"
    };
  }

  return {
    label: `Faltan ${daysLeft} dias`,
    tone: daysLeft <= 3 ? "soon" : "ok"
  };
}

export function initials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}
