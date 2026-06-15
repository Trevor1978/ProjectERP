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

/** Task end timestamp from start + work days (inclusive), preserving start time-of-day. */
export function computeTaskEndAt(startAt: Date, estDays: number): Date {
  const days = Math.max(1, Math.round(estDays));
  const endDay = addWorkDays(startAt, days);
  const end = new Date(endDay);
  end.setHours(
    startAt.getHours(),
    startAt.getMinutes(),
    startAt.getSeconds(),
    startAt.getMilliseconds(),
  );
  return end;
}

export function formatTaskEndIso(
  startAt: string | null,
  estDays: number | null,
): string | null {
  if (!startAt) return null;
  const start = new Date(startAt);
  if (Number.isNaN(start.getTime())) return null;
  return computeTaskEndAt(start, estDays ?? 1).toISOString();
}

export function resolveGanttTaskDates(task: {
  startAt: string | null;
  endAt: string | null;
  estDays: number | null;
}): { start: string; end: string } {
  const duration =
    task.estDays != null && task.estDays > 0 ? Math.round(task.estDays) : 1;

  const startDate = task.startAt
    ? parseDateOnly(task.startAt)
    : startOfDay(new Date());
  const endDate = addWorkDays(startDate, duration);

  return {
    start: formatDateOnly(startDate),
    end: formatDateOnly(endDate),
  };
}
