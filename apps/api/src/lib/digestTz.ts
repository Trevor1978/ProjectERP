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
