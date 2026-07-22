/** Digest schedule timezone (fixed UTC+10). */
export function digestTimeZone(): string {
  return process.env.DIGEST_TZ?.trim() || "Australia/Brisbane";
}

type ZonedParts = {
  ymd: string;
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  weekday: string;
};

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

export function zonedParts(date: Date, timeZone = digestTimeZone()): ZonedParts {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    weekday: "short",
    hourCycle: "h23",
  }).formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? "";
  const year = Number(get("year"));
  const month = Number(get("month"));
  const day = Number(get("day"));
  return {
    ymd: `${year}-${pad2(month)}-${pad2(day)}`,
    year,
    month,
    day,
    hour: Number(get("hour")),
    minute: Number(get("minute")),
    second: Number(get("second")),
    weekday: get("weekday"),
  };
}

/** Convert a wall-clock time in `timeZone` to a UTC Date. */
export function fromZonedTime(
  ymd: string,
  hour: number,
  minute: number,
  second: number,
  timeZone = digestTimeZone(),
): Date {
  const [y, mo, d] = ymd.split("-").map(Number) as [number, number, number];
  const asUtc = Date.UTC(y, mo - 1, d, hour, minute, second);
  const guess = new Date(asUtc);
  const p = zonedParts(guess, timeZone);
  const asIfUtc = Date.UTC(
    p.year,
    p.month - 1,
    p.day,
    p.hour,
    p.minute,
    p.second,
  );
  return new Date(asUtc - (asIfUtc - guess.getTime()));
}

export function addCalendarDays(ymd: string, days: number): string {
  const [y, mo, d] = ymd.split("-").map(Number) as [number, number, number];
  const dt = new Date(Date.UTC(y, mo - 1, d + days));
  return `${dt.getUTCFullYear()}-${pad2(dt.getUTCMonth() + 1)}-${pad2(dt.getUTCDate())}`;
}

/** Monday of the week containing `ymd` (ISO-style Mon–Sun). */
export function mondayOfWeek(ymd: string): string {
  const [y, mo, d] = ymd.split("-").map(Number) as [number, number, number];
  const dt = new Date(Date.UTC(y, mo - 1, d));
  const dow = dt.getUTCDay(); // 0=Sun
  const offset = dow === 0 ? -6 : 1 - dow;
  return addCalendarDays(ymd, offset);
}

export function isMondayYmd(ymd: string): boolean {
  const [y, mo, d] = ymd.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(y, mo - 1, d)).getUTCDay() === 1;
}

export function dayBucket(
  due: Date,
  todayYmd: string,
  timeZone = digestTimeZone(),
): "overdue" | "today" | "tomorrow" | "later" {
  const dueYmd = zonedParts(due, timeZone).ymd;
  if (dueYmd < todayYmd) return "overdue";
  if (dueYmd === todayYmd) return "today";
  if (dueYmd === addCalendarDays(todayYmd, 1)) return "tomorrow";
  return "later";
}

export function formatDueForEmail(due: Date, timeZone = digestTimeZone()): string {
  return new Intl.DateTimeFormat("en-AU", {
    timeZone,
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(due);
}

/**
 * Parse an AI-produced datetime into UTC ISO.
 * Models often append `Z` to local wall times; treat missing/`Z`/`+00:00`
 * offsets as org timezone wall clock. Explicit non-UTC offsets are trusted.
 */
export function parseAiDateTime(
  raw: string | null | undefined,
  timeZone = digestTimeZone(),
): string | null {
  if (raw == null) return null;
  const s = raw.trim();
  if (!s) return null;

  const m = s.match(
    /^(\d{4}-\d{2}-\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?(?:\.\d+)?(Z|[+-]\d{2}:?\d{2})?$/i,
  );
  if (!m) {
    const d = new Date(s);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }

  const ymd = m[1]!;
  const hour = Number(m[2]);
  const minute = Number(m[3]);
  const second = Number(m[4] ?? "0");
  const offset = m[5];

  if (offset && !/^Z$/i.test(offset) && !/^[+-]00:?00$/.test(offset)) {
    const d = new Date(s);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }

  return fromZonedTime(ymd, hour, minute, second, timeZone).toISOString();
}

/** Current wall-clock ISO with offset for prompts (e.g. 2026-07-22T15:04:05+10:00). */
export function nowInTimeZoneIso(timeZone = digestTimeZone()): string {
  const now = new Date();
  const p = zonedParts(now, timeZone);
  const asUtc = fromZonedTime(p.ymd, p.hour, p.minute, p.second, timeZone);
  const wallAsUtc = Date.UTC(
    p.year,
    p.month - 1,
    p.day,
    p.hour,
    p.minute,
    p.second,
  );
  const offsetMinutes = Math.round((wallAsUtc - asUtc.getTime()) / 60000);
  const sign = offsetMinutes >= 0 ? "+" : "-";
  const abs = Math.abs(offsetMinutes);
  return `${p.ymd}T${pad2(p.hour)}:${pad2(p.minute)}:${pad2(p.second)}${sign}${pad2(Math.floor(abs / 60))}:${pad2(abs % 60)}`;
}
