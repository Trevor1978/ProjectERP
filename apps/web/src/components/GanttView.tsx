import { useEffect, useRef } from "react";
import Gantt from "frappe-gantt";
import type { Schedule } from "../types";

function useLatest<T>(v: T) {
  const r = useRef(v);
  r.current = v;
  return r;
}

// frappe-gantt mutates the DOM; re-init on data change
export function GanttView({
  projectId: _projectId,
  data,
  onAfterTaskChange,
}: {
  projectId: string;
  data: Schedule;
  onAfterTaskChange?: () => void;
}) {
  const onChangeRef = useLatest(onAfterTaskChange);
  const ref = useRef<HTMLDivElement>(null);
  const ganttRef = useRef<Gantt | null>(null);

  useEffect(() => {
    if (!ref.current) {
      return;
    }
    const el = ref.current;
    if (ganttRef.current) {
      el.innerHTML = "";
      ganttRef.current = null;
    }
    const { tasks, taskDependencies } = data;
    if (tasks.length === 0) {
      return;
    }
    const items = tasks.map((t) => {
      const start = t.startAt
        ? t.startAt.slice(0, 10)
        : new Date().toISOString().slice(0, 10);
      const end = t.endAt
        ? t.endAt.slice(0, 10)
        : start;
      const deps = taskDependencies
        .filter((d) => d.taskId === t.id)
        .map((d) => d.predecessorTaskId)
        .join(", ");
      return {
        id: t.id,
        name: t.title,
        start,
        end,
        progress: Math.round(
          t.percentComplete ?? 0,
        ) as number,
        dependencies: deps,
      };
    });
    ganttRef.current = new Gantt(
      el,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      items as any,
      {
        view_mode: "Week",
        on_click: (t: { id: string } | null) => {
          void t;
        },
        on_date_change: (task, start, end) => {
          void (async () => {
            const t = tasks.find((x) => x.id === task.id);
            if (!t) {
              return;
            }
            const res = await fetch("/api/tasks/" + task.id, {
              method: "PATCH",
              credentials: "include",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                startAt: start,
                endAt: end,
                version: t.version,
              }),
            });
            if (res.ok) {
              onChangeRef.current?.();
            }
          })();
        },
        on_progress_change: (task, progress) => {
          void (async () => {
            const t = tasks.find((x) => x.id === task.id);
            if (!t) {
              return;
            }
            const res = await fetch("/api/tasks/" + task.id, {
              method: "PATCH",
              credentials: "include",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                percentComplete: progress,
                useDerivedPercent: false,
                version: t.version,
              }),
            });
            if (res.ok) {
              onChangeRef.current?.();
            }
          })();
        },
      },
    );
  }, [data]);

  if (data.tasks.length === 0) {
    return (
      <p className="text-slate-500 p-4 bg-white rounded border">
        No tasks to show. Add milestones, then tasks under a milestone (API or future inline UI on Milestones tab).
      </p>
    );
  }
  return (
    <div className="bg-white p-2 rounded border overflow-x-auto min-h-[320px]">
      <div ref={ref} className="gantt-target" />
    </div>
  );
}
