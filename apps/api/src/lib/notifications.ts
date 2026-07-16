import { db, notification } from "@project-erp/db";

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
  return row!;
}
