/** Monday–Friday working days (weekends excluded). */

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

export function isWeekend(d: Date): boolean {
  const day = d.getDay();
  return day === 0 || day === 6;
}

export function parseDateOnly(iso: string): Date {
  const ymd = iso.slice(0, 10);
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(y!, m! - 1, d!);
}

export function formatDateOnly(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Last calendar day of a span of `workDays` working days starting on `start` (inclusive). */
export function addWorkDays(start: Date, workDays: number): Date {
  const d = startOfDay(start);
  if (workDays <= 1) {
    return d;
  }
  let remaining = workDays - 1;
  while (remaining > 0) {
    d.setDate(d.getDate() + 1);
    if (!isWeekend(d)) {
      remaining -= 1;
    }
  }
  return d;
}

/** First calendar day of a span of `workDays` working days ending on `end` (inclusive). */
export function subtractWorkDays(end: Date, workDays: number): Date {
  const d = startOfDay(end);
  if (workDays <= 1) {
    return d;
  }
  let remaining = workDays - 1;
  while (remaining > 0) {
    d.setDate(d.getDate() - 1);
    if (!isWeekend(d)) {
      remaining -= 1;
    }
  }
  return d;
}

/** Count working days from `start` through `end`, inclusive. */
export function countWorkDays(start: Date, end: Date): number {
  const a = startOfDay(start);
  const b = startOfDay(end);
  if (b < a) {
    return countWorkDays(b, a);
  }
  let count = 0;
  const cursor = new Date(a);
  while (cursor <= b) {
    if (!isWeekend(cursor)) {
      count += 1;
    }
    cursor.setDate(cursor.getDate() + 1);
  }
  return count;
}

export function resolveGanttTaskDates(task: {
  startAt: string | null;
  endAt: string | null;
  estDays: number | null;
}): { start: string; end: string } {
  const duration =
    task.estDays != null && task.estDays > 0 ? Math.round(task.estDays) : 1;
  const hasStart = Boolean(task.startAt);
  const hasEnd = Boolean(task.endAt);

  let startDate: Date;
  let endDate: Date;

  if (hasStart && hasEnd) {
    startDate = parseDateOnly(task.startAt!);
    endDate = parseDateOnly(task.endAt!);
  } else if (hasStart) {
    startDate = parseDateOnly(task.startAt!);
    endDate = addWorkDays(startDate, duration);
  } else if (hasEnd) {
    endDate = parseDateOnly(task.endAt!);
    startDate = subtractWorkDays(endDate, duration);
  } else {
    startDate = startOfDay(new Date());
    endDate = addWorkDays(startDate, duration);
  }

  if (endDate < startDate) {
    endDate = addWorkDays(startDate, duration);
  }

  return {
    start: formatDateOnly(startDate),
    end: formatDateOnly(endDate),
  };
}
