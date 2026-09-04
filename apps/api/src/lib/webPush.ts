import webpush from "web-push";
import { eq } from "drizzle-orm";
import { db, pushSubscription } from "@project-erp/db";

export type PushPayload = {
  title: string;
  body?: string | null;
  url?: string;
  tag?: string;
};

let vapidConfigured = false;

function configureVapid(): boolean {
  if (vapidConfigured) return true;
  const publicKey = process.env.VAPID_PUBLIC_KEY?.trim();
  const privateKey = process.env.VAPID_PRIVATE_KEY?.trim();
  const subject = process.env.VAPID_SUBJECT?.trim() ?? "mailto:admin@example.com";
  if (!publicKey || !privateKey) return false;
  webpush.setVapidDetails(subject, publicKey, privateKey);
  vapidConfigured = true;
  return true;
}

export function isWebPushConfigured(): boolean {
  return configureVapid();
}

export function getVapidPublicKey(): string | null {
  const key = process.env.VAPID_PUBLIC_KEY?.trim();
  return key || null;
}

export function notificationHref(
  data: Record<string, unknown> | null | undefined,
): string | undefined {
  if (!data?.entityId || typeof data.entityId !== "string") return undefined;
  if (data.entityType === "todo") {
    return `/workspace/todos/${data.entityId}`;
  }
  if (data.entityType === "procurement") {
    return `/workspace/purchasing/${data.entityId}`;
  }
  return undefined;
}

export async function sendPushToUser(
  userId: string,
  payload: PushPayload,
): Promise<{ sent: number; failed: number }> {
  if (!configureVapid()) {
    return { sent: 0, failed: 0 };
  }

  const subs = await db
    .select()
    .from(pushSubscription)
    .where(eq(pushSubscription.userId, userId));

  if (subs.length === 0) {
    return { sent: 0, failed: 0 };
  }

  const body = JSON.stringify({
    title: payload.title,
    body: payload.body ?? "",
    url: payload.url ?? "/",
    tag: payload.tag,
  });

  let sent = 0;
  let failed = 0;

  for (const sub of subs) {
    try {
      await webpush.sendNotification(
        {
          endpoint: sub.endpoint,
          keys: { p256dh: sub.p256dh, auth: sub.auth },
        },
        body,
        { TTL: 60 * 60 * 24 },
      );
      sent += 1;
    } catch (e) {
      failed += 1;
      const status = (e as { statusCode?: number }).statusCode;
      if (status === 404 || status === 410) {
        await db
          .delete(pushSubscription)
          .where(eq(pushSubscription.id, sub.id));
      } else {
        console.warn("[push] send failed:", status, sub.endpoint.slice(0, 48));
      }
    }
  }

  return { sent, failed };
}

export async function sendTestPush(userId: string): Promise<
  | { ok: true; sent: number }
  | { ok: false; error: string; sent?: number }
> {
  if (!configureVapid()) {
    return {
      ok: false,
      error: "Web Push is not configured (set VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY)",
    };
  }

  const subs = await db
    .select({ id: pushSubscription.id })
    .from(pushSubscription)
    .where(eq(pushSubscription.userId, userId))
    .limit(1);

  if (subs.length === 0) {
    return {
      ok: false,
      error: "No push subscription found — enable notifications on this device first",
    };
  }

  const result = await sendPushToUser(userId, {
    title: "Project ERP test notification",
    body: "Push notifications are working on this device.",
    url: "/profile",
    tag: "test-push",
  });

  if (result.sent === 0) {
    return {
      ok: false,
      error: "Push delivery failed — try re-enabling notifications",
      sent: 0,
    };
  }

  return { ok: true, sent: result.sent };
}
