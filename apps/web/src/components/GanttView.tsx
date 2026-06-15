import { useCallback, useEffect, useRef, useState } from "react";
import Gantt from "frappe-gantt";
import type { Schedule } from "../types";
import {
  countWorkDays,
  resolveGanttTaskDates,
} from "../lib/workDays";
import { resolveGanttScale, thinGanttDayLabels } from "../lib/ganttScale";

const DAYS_VISIBLE_KEY = "gantt-days-visible";
const DAYS_VISIBLE_OPTIONS = [14, 21, 30, 45, 60, 90, 120, 180] as const;
const DEFAULT_DAYS_VISIBLE = 60;

function readDaysVisible(): number {
  try {
    const raw = localStorage.getItem(DAYS_VISIBLE_KEY);
    if (!raw) return DEFAULT_DAYS_VISIBLE;
    const n = Number(raw);
    return Number.isFinite(n) && n >= 7 && n <= 365 ? n : DEFAULT_DAYS_VISIBLE;
  } catch {
    return DEFAULT_DAYS_VISIBLE;
  }
}

function useLatest<T>(v: T) {
  const r = useRef(v);
  r.current = v;
  return r;
}

function toStartOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function scaleStatusLine(scale: ReturnType<typeof resolveGanttScale>, daysVisible: number): string {
  if (scale.unit === "days") {
    return `${daysVisible} days across the chart (${scale.columnWidth}px per day). Scroll for the full timeline.`;
  }
  if (scale.unit === "weeks") {
    const weeks = Math.round(daysVisible / 7);
    return `${daysVisible} days (~${weeks} weeks) across the chart — week view to keep labels readable. Scroll for more.`;
  }
  const months = Math.max(1, Math.round(daysVisible / 30));
  return `${daysVisible} days (~${months} months) across the chart — month view to keep labels readable. Scroll for more.`;
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
  const ganttTargetRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const ganttRef = useRef<Gantt | null>(null);
  const [daysVisible, setDaysVisible] = useState(readDaysVisible);
  const [viewportWidth, setViewportWidth] = useState(0);

  const onDaysVisibleChange = useCallback((next: number) => {
    const clamped = Math.min(365, Math.max(7, Math.round(next)));
    setDaysVisible(clamped);
    try {
      localStorage.setItem(DAYS_VISIBLE_KEY, String(clamped));
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width ?? 0;
      setViewportWidth(w);
    });
    ro.observe(el);
    setViewportWidth(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const el = ganttTargetRef.current;
    if (!el) return;

    if (ganttRef.current) {
      el.innerHTML = "";
      ganttRef.current = null;
    }

    const { tasks, taskDependencies } = data;
    if (tasks.length === 0) return;

    const items = tasks.map((t) => {
      const { start, end } = resolveGanttTaskDates(t);
      const deps = taskDependencies
        .filter((d) => d.taskId === t.id)
        .map((d) => d.predecessorTaskId)
        .join(", ");
      return {
        id: t.id,
        name: t.title,
        start,
        end,
        progress: Math.round(t.percentComplete ?? 0) as number,
        dependencies: deps,
      };
    });

    const scale = resolveGanttScale(viewportWidth, daysVisible);

    const gantt = new Gantt(
      el,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      items as any,
      {
        view_mode: scale.viewMode,
        on_click: (t: { id: string } | null) => {
          void t;
        },
        on_date_change: (task, start, end) => {
          void (async () => {
            const t = tasks.find((x) => x.id === task.id);
            if (!t) return;
            const estDays = countWorkDays(toStartOfDay(start), toStartOfDay(end));
            const res = await fetch("/api/tasks/" + task.id, {
              method: "PATCH",
              credentials: "include",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                startAt: start.toISOString(),
                endAt: end.toISOString(),
                estDays,
                version: t.version,
              }),
            });
            if (res.ok) onChangeRef.current?.();
          })();
        },
        on_progress_change: (task, progress) => {
          void (async () => {
            const t = tasks.find((x) => x.id === task.id);
            if (!t) return;
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
            if (res.ok) onChangeRef.current?.();
          })();
        },
      },
    );

    gantt.options.column_width = scale.columnWidth;
    gantt.options.view_mode = scale.viewMode;
    gantt.options.step = scale.step;
    gantt.render();
    if (scale.viewMode === "Day") {
      thinGanttDayLabels(el, scale.columnWidth);
    }
    ganttRef.current = gantt;
  }, [data, daysVisible, viewportWidth]);

  if (data.tasks.length === 0) {
    return (
      <p className="text-slate-500 p-4 bg-white rounded border">
        No tasks to show. Add milestones, then tasks under a milestone (API or future inline UI on Milestones tab).
      </p>
    );
  }

  const scale = resolveGanttScale(viewportWidth, daysVisible);

  return (
    <div ref={viewportRef} className="rounded border bg-white p-2 min-h-[320px]">
      <div className="mb-2 flex flex-wrap items-center gap-x-4 gap-y-2">
        <p className="text-xs text-slate-500">
          Duration is in working days (Mon–Fri). Bars without dates use duration; weekends are skipped in duration.
        </p>
        <label className="ml-auto flex items-center gap-2 text-sm text-slate-700">
          <span className="whitespace-nowrap">Days on screen</span>
          <select
            className="rounded border border-slate-300 px-2 py-1 text-sm"
            value={
              (DAYS_VISIBLE_OPTIONS as readonly number[]).includes(daysVisible)
                ? daysVisible
                : ""
            }
            onChange={(e) => onDaysVisibleChange(Number(e.target.value))}
          >
            <option value="" disabled>
              Preset…
            </option>
            {DAYS_VISIBLE_OPTIONS.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
          <input
            type="number"
            min={7}
            max={365}
            step={1}
            className="w-16 rounded border border-slate-300 px-2 py-1 text-sm"
            value={daysVisible}
            onChange={(e) => onDaysVisibleChange(Number(e.target.value))}
            aria-label="Custom days on screen"
          />
        </label>
      </div>
      <p className="mb-2 text-xs text-slate-400">
        {viewportWidth > 0
          ? scaleStatusLine(scale, daysVisible)
          : "Adjust days on screen to zoom the timeline."}
      </p>
      <div className="overflow-x-auto">
        <div ref={ganttTargetRef} className="gantt-target min-w-full" />
      </div>
    </div>
  );
}
