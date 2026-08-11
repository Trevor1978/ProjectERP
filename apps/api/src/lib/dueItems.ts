import { and, eq, gte, inArray, isNotNull, lt, notInArray } from "drizzle-orm";
import {
  db,
  notification,
  procurementRequest,
  todo,
  user,
} from "@project-erp/db";
import {
  addCalendarDays,
  dayBucket,
  digestTimeZone,
  formatDueForEmail,
  fromZonedTime,
  mondayOfWeek,
  zonedParts,
} from "./digestTz.js";

export type DueItem = {
  entityType: "todo" | "procurement";
  entityId: string;
  title: string;
  dueAt: Date;
  userId: string;
  userEmail: string;
  userName: string;
  bucket: "overdue" | "today" | "tomorrow" | "later";
};

const OPEN_PROC = [
  "draft",
  "rfq_sent",
  "quoted",
  "ordered",
  "partially_received",
] as const;

function webOrigin(): string {
  return (process.env.WEB_ORIGIN ?? "http://localhost:5173").replace(/\/$/, "");
}

export function itemLink(item: Pick<DueItem, "entityType" | "entityId">): string {
  const base = webOrigin();
  if (item.entityType === "todo") {
    return `${base}/workspace/todos/${item.entityId}`;
  }
  return `${base}/workspace/purchasing/${item.entityId}`;
}

export function itemTypeLabel(entityType: DueItem["entityType"]): string {
  return entityType === "todo" ? "Todo" : "Purchasing";
}

async function loadTodosInRange(
  rangeStart: Date,
  rangeEndExclusive: Date,
  todayYmd: string,
  userId?: string,
): Promise<DueItem[]> {
  const tz = digestTimeZone();
  const rows = await db
    .select({
      id: todo.id,
      title: todo.title,
      dueAt: todo.dueAt,
      userId: user.id,
      userEmail: user.email,
      userName: user.name,
    })
    .from(todo)
    .innerJoin(user, eq(todo.assigneeId, user.id))
    .where(
      and(
        notInArray(todo.status, ["done", "cancelled"]),
        isNotNull(todo.dueAt),
        isNotNull(todo.assigneeId),
        gte(todo.dueAt, rangeStart),
        lt(todo.dueAt, rangeEndExclusive),
        userId ? eq(todo.assigneeId, userId) : undefined,
      ),
    );

  return rows
    .filter((r) => r.dueAt != null)
    .map((r) => ({
      entityType: "todo" as const,
      entityId: r.id,
      title: r.title,
      dueAt: r.dueAt!,
      userId: r.userId,
      userEmail: r.userEmail,
      userName: r.userName,
      bucket: dayBucket(r.dueAt!, todayYmd, tz),
    }));
}

async function loadProcurementInRange(
  rangeStart: Date,
  rangeEndExclusive: Date,
  todayYmd: string,
  userId?: string,
): Promise<DueItem[]> {
  const tz = digestTimeZone();
  const rows = await db
    .select({
      id: procurementRequest.id,
      title: procurementRequest.title,
      needBy: procurementRequest.needBy,
      userId: user.id,
      userEmail: user.email,
      userName: user.name,
    })
    .from(procurementRequest)
    .innerJoin(user, eq(procurementRequest.createdById, user.id))
    .where(
      and(
        inArray(procurementRequest.status, [...OPEN_PROC]),
        isNotNull(procurementRequest.needBy),
        isNotNull(procurementRequest.createdById),
        gte(procurementRequest.needBy, rangeStart),
        lt(procurementRequest.needBy, rangeEndExclusive),
        userId ? eq(procurementRequest.createdById, userId) : undefined,
      ),
    );

  return rows
    .filter((r) => r.needBy != null)
    .map((r) => ({
      entityType: "procurement" as const,
      entityId: r.id,
      title: r.title,
      dueAt: r.needBy!,
      userId: r.userId,
      userEmail: r.userEmail,
      userName: r.userName,
      bucket: dayBucket(r.needBy!, todayYmd, tz),
    }));
}

/** Overdue + due today + due tomorrow (for daily digest / in-app). */
export async function loadDailyDueItems(
  now = new Date(),
  userId?: string,
): Promise<DueItem[]> {
  const tz = digestTimeZone();
  const today = zonedParts(now, tz).ymd;
  const dayAfterTomorrow = addCalendarDays(today, 2);
  const rangeEnd = fromZonedTime(dayAfterTomorrow, 0, 0, 0, tz);
  const rangeStart = new Date(0);

  const [todos, procs] = await Promise.all([
    loadTodosInRange(rangeStart, rangeEnd, today, userId),
    loadProcurementInRange(rangeStart, rangeEnd, today, userId),
  ]);

  return [...todos, ...procs].filter(
    (i) =>
      i.bucket === "overdue" || i.bucket === "today" || i.bucket === "tomorrow",
  );
}

/** Items due Mon–Sun of the current week in digest TZ. */
export async function loadWeeklyDueItems(now = new Date()): Promise<DueItem[]> {
  const tz = digestTimeZone();
  const today = zonedParts(now, tz).ymd;
  const weekStart = mondayOfWeek(today);
  const weekEndExclusive = addCalendarDays(weekStart, 7);
  const rangeStart = fromZonedTime(weekStart, 0, 0, 0, tz);
  const rangeEnd = fromZonedTime(weekEndExclusive, 0, 0, 0, tz);

  const [todos, procs] = await Promise.all([
    loadTodosInRange(rangeStart, rangeEnd, today),
    loadProcurementInRange(rangeStart, rangeEnd, today),
  ]);

  return [...todos, ...procs];
}

export function groupByUser(items: DueItem[]): Map<string, DueItem[]> {
  const map = new Map<string, DueItem[]>();
  for (const item of items) {
    const list = map.get(item.userId) ?? [];
    list.push(item);
    map.set(item.userId, list);
  }
  for (const list of map.values()) {
    list.sort((a, b) => a.dueAt.getTime() - b.dueAt.getTime());
  }
  return map;
}

/** Skip creating another due_soon for same user+entity on the same calendar day. */
export async function alreadyNotifiedToday(
  userId: string,
  entityId: string,
  todayYmd: string,
): Promise<boolean> {
  const tz = digestTimeZone();
  const dayStart = fromZonedTime(todayYmd, 0, 0, 0, tz);
  const dayEnd = fromZonedTime(addCalendarDays(todayYmd, 1), 0, 0, 0, tz);
  const rows = await db
    .select({ id: notification.id, dataJson: notification.dataJson })
    .from(notification)
    .where(
      and(
        eq(notification.userId, userId),
        eq(notification.kind, "due_soon"),
        gte(notification.createdAt, dayStart),
        lt(notification.createdAt, dayEnd),
      ),
    );
  for (const r of rows) {
    if (!r.dataJson) continue;
    try {
      const data = JSON.parse(r.dataJson) as { entityId?: string };
      if (data.entityId === entityId) return true;
    } catch {
      /* ignore */
    }
  }
  return false;
}

export function formatItemLine(item: DueItem): string {
  return `${itemTypeLabel(item.entityType)}: ${item.title} — ${formatDueForEmail(item.dueAt)}`;
}
