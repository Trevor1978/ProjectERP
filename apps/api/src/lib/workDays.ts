/** Monday–Friday working days (weekends excluded). Shared with web task scheduling. */

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function isWeekend(d: Date): boolean {
  const day = d.getDay();
  return day === 0 || day === 6;
}

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

export function resolveTaskEndAt(
  startAt: Date | null,
  estDays: number | null,
): Date | null {
  if (!startAt) return null;
  const days = estDays != null && estDays > 0 ? estDays : 1;
  return computeTaskEndAt(startAt, days);
}
