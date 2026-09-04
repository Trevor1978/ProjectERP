/* Project ERP — lightweight offline shell for installable PWA */
const CACHE = "project-erp-shell-v2";
const SHELL = ["/", "/manifest.webmanifest", "/favicon.svg", "/icon-192.png", "/icon-512.png"];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches
      .open(CACHE)
      .then((c) => c.addAll(SHELL))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))),
    ).then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  // Never cache API — auth + live data.
  if (url.pathname.startsWith("/api/")) return;

  e.respondWith(
    caches.match(req).then((cached) => {
      const network = fetch(req)
        .then((res) => {
          if (res.ok && (url.pathname === "/" || url.pathname.endsWith(".webmanifest"))) {
            const copy = res.clone();
            void caches.open(CACHE).then((c) => c.put(req, copy));
          }
          return res;
        })
        .catch(() => cached);
      return cached || network;
    }),
  );
});

self.addEventListener("push", (event) => {
  let payload = { title: "Project ERP", body: "", url: "/", tag: undefined };
  try {
    payload = { ...payload, ...(event.data?.json() ?? {}) };
  } catch {
    /* ignore malformed payload */
  }
  const options = {
    body: payload.body || undefined,
    icon: "/icon-192.png",
    badge: "/icon-192.png",
    tag: payload.tag,
    data: { url: payload.url || "/" },
  };
  event.waitUntil(self.registration.showNotification(payload.title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = event.notification.data?.url || "/";
  const fullUrl = new URL(target, self.location.origin).href;
  event.waitUntil(
    clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((windowClients) => {
        for (const client of windowClients) {
          if (new URL(client.url).origin === self.location.origin && "focus" in client) {
            return client.focus().then(() => {
              if ("navigate" in client && typeof client.navigate === "function") {
                return client.navigate(fullUrl);
              }
              return undefined;
            });
          }
        }
        return clients.openWindow(fullUrl);
      }),
  );
});
