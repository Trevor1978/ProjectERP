import { and, eq } from "drizzle-orm";
import { db, digestRun } from "@project-erp/db";
import { buildDailyEmail, buildWeeklyEmail } from "./digestEmail.js";
import {
  addCalendarDays,
  digestTimeZone,
  formatDueForEmail,
  isMondayYmd,
  mondayOfWeek,
  zonedParts,
} from "./digestTz.js";
import {
  alreadyNotifiedToday,
  groupByUser,
  itemTypeLabel,
  loadDailyDueItems,
  loadWeeklyDueItems,
  type DueItem,
} from "./dueItems.js";
import { createNotification } from "./notifications.js";
import { sendResendEmail } from "./resend.js";

export type DigestRunResult = {
  runDate: string;
  daily: {
    skipped: boolean;
    notificationsCreated: number;
    emailsSent: number;
    emailErrors: string[];
  };
  weekly: {
    skipped: boolean;
    emailsSent: number;
    emailErrors: string[];
  };
};

async function hasDigestRun(
  runDate: string,
  kind: "daily" | "weekly",
): Promise<boolean> {
  const rows = await db
    .select({ id: digestRun.id })
    .from(digestRun)
    .where(and(eq(digestRun.runDate, runDate), eq(digestRun.kind, kind)))
    .limit(1);
  return rows.length > 0;
}

async function recordDigestRun(
  runDate: string,
  kind: "daily" | "weekly",
): Promise<void> {
  try {
    await db.insert(digestRun).values({ runDate, kind });
  } catch (e) {
    // Unique violation = another runner won the race
    console.warn("[digest] digest_run insert race:", e);
  }
}

function dateLabel(ymd: string): string {
  const [y, mo, d] = ymd.split("-").map(Number) as [number, number, number];
  return new Intl.DateTimeFormat("en-AU", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(y, mo - 1, d, 12)));
}

function weekRangeLabel(weekStartYmd: string): string {
  const weekEnd = addCalendarDays(weekStartYmd, 6);
  return `${dateLabel(weekStartYmd)} – ${dateLabel(weekEnd)}`;
}

function bucketLabel(bucket: DueItem["bucket"]): string {
  if (bucket === "overdue") return "Overdue";
  if (bucket === "today") return "Due today";
  if (bucket === "tomorrow") return "Due tomorrow";
  return "Due soon";
}

async function createInAppForDaily(
  items: DueItem[],
  todayYmd: string,
): Promise<number> {
  let created = 0;
  for (const item of items) {
    if (await alreadyNotifiedToday(item.userId, item.entityId, todayYmd)) {
      continue;
    }
    await createNotification({
      userId: item.userId,
      kind: "due_soon",
      title: `${bucketLabel(item.bucket)}: ${item.title}`,
      body: `${itemTypeLabel(item.entityType)} — ${formatDueForEmail(item.dueAt)}`,
      data: {
        entityType: item.entityType,
        entityId: item.entityId,
        dueAt: item.dueAt.toISOString(),
      },
    });
    created += 1;
  }
  return created;
}

async function sendDailyEmails(
  byUser: Map<string, DueItem[]>,
  todayYmd: string,
): Promise<{ sent: number; errors: string[] }> {
  const errors: string[] = [];
  let sent = 0;
  const label = dateLabel(todayYmd);

  for (const items of byUser.values()) {
    if (items.length === 0) continue;
    const first = items[0]!;
    const mail = buildDailyEmail({
      userName: first.userName,
      dateLabel: label,
      items,
    });
    const result = await sendResendEmail({
      to: first.userEmail,
      subject: mail.subject,
      html: mail.html,
      text: mail.text,
    });
    if (result.ok) {
      sent += 1;
    } else {
      errors.push(`${first.userEmail}: ${result.error}`);
    }
  }
  return { sent, errors };
}

async function sendWeeklyEmails(
  byUser: Map<string, DueItem[]>,
  weekStartYmd: string,
): Promise<{ sent: number; errors: string[] }> {
  const errors: string[] = [];
  let sent = 0;
  const range = weekRangeLabel(weekStartYmd);

  for (const items of byUser.values()) {
    if (items.length === 0) continue;
    const first = items[0]!;
    const mail = buildWeeklyEmail({
      userName: first.userName,
      weekRangeLabel: range,
      items,
    });
    const result = await sendResendEmail({
      to: first.userEmail,
      subject: mail.subject,
      html: mail.html,
      text: mail.text,
    });
    if (result.ok) {
      sent += 1;
    } else {
      errors.push(`${first.userEmail}: ${result.error}`);
    }
  }
  return { sent, errors };
}

/**
 * Run daily (and weekly on Monday) digests for the current Brisbane calendar day.
 * Idempotent via digest_run unless `force` is true.
 */
export async function runDigests(opts?: {
  force?: boolean;
  now?: Date;
}): Promise<DigestRunResult> {
  const now = opts?.now ?? new Date();
  const force = opts?.force === true;
  const tz = digestTimeZone();
  const todayYmd = zonedParts(now, tz).ymd;
  const weekStart = mondayOfWeek(todayYmd);
  const doWeekly = isMondayYmd(todayYmd);

  const result: DigestRunResult = {
    runDate: todayYmd,
    daily: {
      skipped: false,
      notificationsCreated: 0,
      emailsSent: 0,
      emailErrors: [],
    },
    weekly: {
      skipped: !doWeekly,
      emailsSent: 0,
      emailErrors: [],
    },
  };

  // --- Daily ---
  if (!force && (await hasDigestRun(todayYmd, "daily"))) {
    result.daily.skipped = true;
  } else {
    const dailyItems = await loadDailyDueItems(now);
    result.daily.notificationsCreated = await createInAppForDaily(
      dailyItems,
      todayYmd,
    );
    const emailResult = await sendDailyEmails(groupByUser(dailyItems), todayYmd);
    result.daily.emailsSent = emailResult.sent;
    result.daily.emailErrors = emailResult.errors;
    await recordDigestRun(todayYmd, "daily");
  }

  // --- Weekly (Mondays) ---
  if (doWeekly) {
    if (!force && (await hasDigestRun(todayYmd, "weekly"))) {
      result.weekly.skipped = true;
    } else {
      result.weekly.skipped = false;
      const weeklyItems = await loadWeeklyDueItems(now);
      const emailResult = await sendWeeklyEmails(
        groupByUser(weeklyItems),
        weekStart,
      );
      result.weekly.emailsSent = emailResult.sent;
      result.weekly.emailErrors = emailResult.errors;
      await recordDigestRun(todayYmd, "weekly");
    }
  }

  return result;
}

let digestRunning = false;

/** Called by the minute ticker when local time is ~07:00. */
export async function maybeRunScheduledDigests(now = new Date()): Promise<void> {
  const tz = digestTimeZone();
  const parts = zonedParts(now, tz);
  if (parts.hour !== 7 || parts.minute > 1) return;
  if (digestRunning) return;
  digestRunning = true;
  try {
    const result = await runDigests({ now });
    console.log("[digest] scheduled run:", JSON.stringify(result));
  } catch (e) {
    console.error("[digest] scheduled run failed:", e);
  } finally {
    digestRunning = false;
  }
}

export function startDigestScheduler(): void {
  console.log(
    `[digest] scheduler started (tz=${digestTimeZone()}, target=07:00)`,
  );
  void maybeRunScheduledDigests();
  setInterval(() => {
    void maybeRunScheduledDigests();
  }, 60_000);
}
