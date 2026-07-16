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

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="relative px-2 py-1 rounded text-slate-300 hover:text-white"
        aria-label="Notifications"
      >
        <span className="text-lg">🔔</span>
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] text-[10px] leading-[18px] text-center bg-red-600 text-white rounded-full">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 w-80 max-h-96 overflow-y-auto bg-white text-slate-900 border border-slate-200 rounded shadow-lg z-50 text-sm">
          {list.length === 0 && (
            <div className="p-3 text-slate-500">No notifications yet.</div>
          )}
          {list.map((n) => {
            const href = notificationHref(n);
            return (
              <div
                key={n.id}
                className={
                  "p-2 border-b border-slate-100 " +
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
                  <div className="text-slate-600 text-xs mt-0.5">{n.body}</div>
                )}
                <div className="flex justify-between items-center mt-1">
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
