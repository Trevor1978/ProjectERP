import { api } from "./api";

type PushConfig = {
  enabled: boolean;
  publicKey: string | null;
};

type PushStatus = {
  configured: boolean;
  subscriptionCount: number;
};

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const base64Safe = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64Safe);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) {
    out[i] = raw.charCodeAt(i);
  }
  return out;
}

export function isPushSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

export async function fetchPushConfig(): Promise<PushConfig> {
  return api<PushConfig>("/api/push/config");
}

export async function fetchPushStatus(): Promise<PushStatus> {
  return api<PushStatus>("/api/push/status");
}

async function ensureServiceWorker(): Promise<ServiceWorkerRegistration> {
  const existing = await navigator.serviceWorker.getRegistration();
  if (existing) return existing;
  return navigator.serviceWorker.register("/sw.js");
}

export async function subscribeToPush(): Promise<void> {
  if (!isPushSupported()) {
    throw new Error("Push notifications are not supported in this browser");
  }

  const config = await fetchPushConfig();
  if (!config.enabled || !config.publicKey) {
    throw new Error("Push notifications are not configured on the server");
  }

  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    throw new Error("Notification permission was denied");
  }

  const registration = await ensureServiceWorker();
  await navigator.serviceWorker.ready;

  let subscription = await registration.pushManager.getSubscription();
  if (!subscription) {
    try {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(config.publicKey) as BufferSource,
      });
    } catch (e) {
      const message =
        e instanceof Error ? e.message : "Push subscription failed";
      if (/permission denied/i.test(message)) {
        throw new Error(
          "Push registration was blocked by the browser. On mobile, add the app to your home screen and try again.",
        );
      }
      throw new Error(message);
    }
  }

  const json = subscription.toJSON();
  if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) {
    throw new Error("Browser did not return a valid push subscription");
  }

  await api("/api/push/subscribe", {
    method: "POST",
    body: JSON.stringify({
      endpoint: json.endpoint,
      keys: {
        p256dh: json.keys.p256dh,
        auth: json.keys.auth,
      },
    }),
  });
}

export async function unsubscribeFromPush(): Promise<void> {
  if (!isPushSupported()) return;

  const registration = await navigator.serviceWorker.getRegistration();
  const subscription = await registration?.pushManager.getSubscription();
  if (subscription) {
    const endpoint = subscription.endpoint;
    await subscription.unsubscribe();
    await api("/api/push/unsubscribe", {
      method: "DELETE",
      body: JSON.stringify({ endpoint }),
    });
    return;
  }

  await api("/api/push/unsubscribe", {
    method: "DELETE",
    body: JSON.stringify({}),
  });
}

export async function hasActivePushSubscription(): Promise<boolean> {
  if (!isPushSupported()) return false;
  const registration = await navigator.serviceWorker.getRegistration();
  const subscription = await registration?.pushManager.getSubscription();
  return Boolean(subscription);
}
