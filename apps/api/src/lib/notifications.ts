import { db, notification } from "@project-erp/db";
import { notificationHref, sendPushToUser } from "./webPush.js";

export type NotificationKind =
  | "task_assigned"
  | "todo_assigned"
  | "due_soon"
  | "comment"
  | "rfq";

export type NotificationData = {
  entityType: "todo" | "procurement";
  entityId: string;
  dueAt?: string;
};

export async function createNotification(opts: {
  userId: string;
  kind: NotificationKind;
  title: string;
  body?: string | null;
  data?: NotificationData | Record<string, unknown>;
}) {
  const [row] = await db
    .insert(notification)
    .values({
      userId: opts.userId,
      kind: opts.kind,
      title: opts.title,
      body: opts.body ?? null,
      dataJson: opts.data ? JSON.stringify(opts.data) : null,
    })
    .returning();
  if (!row) {
    throw new Error("Failed to create notification");
  }
  const data =
    opts.data && typeof opts.data === "object"
      ? (opts.data as Record<string, unknown>)
      : null;
  void sendPushToUser(opts.userId, {
    title: opts.title,
    body: opts.body,
    url: notificationHref(data),
    tag: row.id,
  }).catch((e) => {
    console.warn("[push] after createNotification:", e);
  });
  return row;
}
