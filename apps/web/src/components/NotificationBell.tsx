import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, useRef, useEffect } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api";

type N = {
  id: string;
  title: string;
  body: string | null;
  readAt: string | null;
  createdAt: string;
  kind: string;
  dataJson: string | null;
};

function notificationHref(n: N): string | null {
  if (!n.dataJson) return null;
  try {
    const data = JSON.parse(n.dataJson) as {
      entityType?: string;
      entityId?: string;
    };
    if (!data.entityId) return null;
    if (data.entityType === "todo") {
      return `/workspace/todos/${data.entityId}`;
    }
    if (data.entityType === "procurement") {
      return `/workspace/purchasing/${data.entityId}`;
    }
  } catch {
    return null;
  }
  return null;
}

export function NotificationBell() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [clearing, setClearing] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const { data } = useQuery({
    queryKey: ["notifications"],
    queryFn: () => api<{ notifications: N[] }>("/api/notifications"),
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
  });

  useEffect(() => {
    function close(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, []);

  const list = data?.notifications ?? [];
  const unread = list.filter((n) => !n.readAt).length;

  async function markRead(id: string) {
    await api("/api/notifications/" + id + "/read", {
      method: "POST",
      body: "{}",
    });
    await qc.invalidateQueries({ queryKey: ["notifications"] });
  }

  async function clearAll() {
    if (unread === 0 || clearing) return;
    setClearing(true);
    try {
      await api("/api/notifications/read-all", {
        method: "POST",
        body: "{}",
      });
      await qc.invalidateQueries({ queryKey: ["notifications"] });
    } finally {
      setClearing(false);
    }
  }

  return (
    <div className="group relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="relative rounded px-2 py-1 text-slate-300 hover:text-white"
        aria-label="Notifications"
      >
        <span className="text-lg">🔔</span>
        {unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 h-[18px] min-w-[18px] rounded-full bg-red-600 text-center text-[10px] leading-[18px] text-white">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>
      {unread > 0 && !open && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            void clearAll();
          }}
          disabled={clearing}
          className="pointer-events-none absolute right-0 top-full z-50 mt-1 whitespace-nowrap rounded border border-slate-200 bg-white px-2 py-1 text-xs font-medium text-slate-700 opacity-0 shadow-lg transition-opacity group-hover:pointer-events-auto group-hover:opacity-100 disabled:opacity-50"
        >
          {clearing ? "Clearing…" : "Clear all"}
        </button>
      )}
      {open && (
        <div className="absolute right-0 top-full z-50 mt-1 max-h-96 w-80 overflow-y-auto rounded border border-slate-200 bg-white text-sm text-slate-900 shadow-lg">
          <div className="sticky top-0 flex items-center justify-between border-b border-slate-100 bg-white px-3 py-2">
            <span className="text-xs font-medium text-slate-600">
              Notifications
              {unread > 0 ? ` · ${unread} unread` : ""}
            </span>
            {unread > 0 && (
              <button
                type="button"
                onClick={() => void clearAll()}
                disabled={clearing}
                className="text-xs font-medium text-blue-700 hover:underline disabled:opacity-50"
              >
                {clearing ? "Clearing…" : "Clear all"}
              </button>
            )}
          </div>
          {list.length === 0 && (
            <div className="p-3 text-slate-500">No notifications yet.</div>
          )}
          {list.map((n) => {
            const href = notificationHref(n);
            return (
              <div
                key={n.id}
                className={
                  "border-b border-slate-100 p-2 " +
                  (!n.readAt ? "bg-amber-50" : "")
                }
              >
                {href ? (
                  <Link
                    to={href}
                    className="font-medium text-slate-900 hover:underline"
                    onClick={() => setOpen(false)}
                  >
                    {n.title}
                  </Link>
                ) : (
                  <div className="font-medium">{n.title}</div>
                )}
                {n.body && (
                  <div className="mt-0.5 text-xs text-slate-600">{n.body}</div>
                )}
                <div className="mt-1 flex items-center justify-between">
                  <span className="text-[10px] text-slate-400">{n.kind}</span>
                  {!n.readAt && (
                    <button
                      type="button"
                      className="text-xs text-blue-700"
                      onClick={() => void markRead(n.id)}
                    >
                      Mark read
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
