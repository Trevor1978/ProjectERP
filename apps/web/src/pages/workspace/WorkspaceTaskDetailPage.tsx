import { useMemo, useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import { api } from "../../lib/api";
import { WorkspaceDetailChrome } from "./WorkspaceDetailChrome";
import { isoToLocal, localToIso } from "../../workspace/workspaceDates";

type Milestone = { id: string; projectId: string; name: string; version: number };
type Task = {
  id: string;
  projectId: string;
  milestoneId: string;
  title: string;
  description: string | null;
  startAt: string | null;
  endAt: string | null;
  estHours: number | null;
  actualHours: number | null;
  percentComplete: number;
  useDerivedPercent: boolean;
  orderIndex: number;
  assigneeId: string | null;
  version: number;
};
type Todo = {
  id: string;
  taskId: string;
  title: string;
  status: "backlog" | "in_progress" | "blocked" | "done";
  dueAt: string | null;
  priority: "low" | "normal" | "high" | "urgent";
  orderIndex: number;
  assigneeId: string | null;
  version: number;
};
type TimeEntry = {
  id: string;
  userId: string;
  taskId: string;
  todoId: string | null;
  startedAt: string | null;
  endedAt: string | null;
  durationMinutes: number | null;
  note: string | null;
  version: number;
};
type OrgUser = { id: string; name: string };

export function WorkspaceTaskDetailPage() {
  const { taskId } = useParams<{ taskId: string }>();
  const qc = useQueryClient();
  const { data: tasksData } = useQuery({
    queryKey: ["tasks-all"],
    queryFn: () => api<{ tasks: Task[] }>("/api/tasks"),
  });
  const { data: msData } = useQuery({
    queryKey: ["milestones-all"],
    queryFn: () => api<{ milestones: Milestone[] }>("/api/milestones"),
  });
  const { data: todosData } = useQuery({
    queryKey: ["todos-all"],
    queryFn: () => api<{ todos: Todo[] }>("/api/todos"),
  });
  const { data: timeData } = useQuery({
    queryKey: ["time-all"],
    queryFn: () => api<{ timeEntries: TimeEntry[] }>("/api/time-entries"),
  });
  const { data: orgUsersData } = useQuery({
    queryKey: ["org-users"],
    queryFn: () => api<{ users: OrgUser[] }>("/api/org/users"),
  });

  const task = tasksData?.tasks.find((t) => t.id === taskId);
  const milestone = msData?.milestones.find((m) => m.id === task?.milestoneId);
  const todos = useMemo(() => (todosData?.todos ?? []).filter((td) => td.taskId === taskId), [todosData?.todos, taskId]);
  const entries = useMemo(() => (timeData?.timeEntries ?? []).filter((e) => e.taskId === taskId), [timeData?.timeEntries, taskId]);
  const userName = useMemo(() => new Map((orgUsersData?.users ?? []).map((u) => [u.id, u.name] as const)), [orgUsersData?.users]);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [startAt, setStartAt] = useState("");
  const [endAt, setEndAt] = useState("");
  const [orderIndex, setOrderIndex] = useState("0");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [newTodoTitle, setNewTodoTitle] = useState("");
  const [todoBusy, setTodoBusy] = useState(false);
  const [timeTodoId, setTimeTodoId] = useState("");
  const [timeBusy, setTimeBusy] = useState(false);

  const nextTodoOrder = useMemo(
    () => (todos.length ? Math.max(...todos.map((td) => td.orderIndex)) + 1 : 0),
    [todos],
  );

  useEffect(() => {
    if (!task) return;
    setTitle(task.title);
    setDescription(task.description ?? "");
    setStartAt(isoToLocal(task.startAt));
    setEndAt(isoToLocal(task.endAt));
    setOrderIndex(String(task.orderIndex));
  }, [task]);

  async function refresh() {
    await qc.invalidateQueries({ queryKey: ["tasks-all"] });
    await qc.invalidateQueries({ queryKey: ["todos-all"] });
    await qc.invalidateQueries({ queryKey: ["time-all"] });
  }

  if (!taskId) return null;
  if (!tasksData) return <p className="text-slate-500">Loading…</p>;
  if (!task) {
    return (
      <WorkspaceDetailChrome backTo="/workspace/tasks" backLabel="← Tasks" title="Not found">
        <p className="text-slate-600">Task not found.</p>
      </WorkspaceDetailChrome>
    );
  }

  const back = milestone ? `/workspace/milestones/${milestone.id}` : "/workspace/tasks";

  return (
    <WorkspaceDetailChrome backTo={back} backLabel={milestone ? `← ${milestone.name}` : "← Tasks"} title={task.title}>
      <p className="text-sm text-slate-600">
        {milestone ? (
          <>
            Milestone:{" "}
            <Link to={`/workspace/milestones/${milestone.id}`} className="text-blue-700 underline">
              {milestone.name}
            </Link>
          </>
        ) : null}
        <span className="text-slate-400"> · </span>
        <Link to={`/workspace/todos?taskId=${encodeURIComponent(task.id)}`} className="text-blue-700 underline">
          Todos (filtered)
        </Link>
      </p>

      {err && <p className="text-sm text-red-600">{err}</p>}
      <div className="mb-6 grid max-w-2xl gap-3 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <div>
          <label className="block text-sm font-medium">Title</label>
          <input className="mt-1 w-full rounded border px-2 py-1.5" value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>
        <div>
          <label className="block text-sm font-medium">Description</label>
          <textarea className="mt-1 w-full rounded border px-2 py-1.5" rows={3} value={description} onChange={(e) => setDescription(e.target.value)} />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="block text-sm font-medium">Start</label>
            <input type="datetime-local" className="mt-1 w-full rounded border px-2 py-1.5" value={startAt} onChange={(e) => setStartAt(e.target.value)} />
          </div>
          <div>
            <label className="block text-sm font-medium">End</label>
            <input type="datetime-local" className="mt-1 w-full rounded border px-2 py-1.5" value={endAt} onChange={(e) => setEndAt(e.target.value)} />
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium">Order</label>
          <input type="number" className="mt-1 w-full max-w-xs rounded border px-2 py-1.5" value={orderIndex} onChange={(e) => setOrderIndex(e.target.value)} />
        </div>
        <button
          type="button"
          disabled={saving || !title.trim()}
          className="w-fit rounded border bg-slate-900 px-3 py-1.5 text-sm text-white disabled:opacity-50"
          onClick={() => {
            setErr(null);
            setSaving(true);
            void api("/api/tasks/" + task.id, {
              method: "PATCH",
              body: JSON.stringify({
                title: title.trim(),
                description: description.trim() || null,
                startAt: localToIso(startAt),
                endAt: localToIso(endAt),
                orderIndex: Number(orderIndex) || 0,
                version: task.version,
              }),
            })
              .then(refresh)
              .catch((e: Error) => setErr(e.message))
              .finally(() => setSaving(false));
          }}
        >
          Save task
        </button>
      </div>

      <h2 className="mb-2 text-lg font-semibold text-slate-800">Todos</h2>
      {todos.length === 0 ? (
        <p className="mb-2 text-sm text-slate-500">No todos on this task — add one below.</p>
      ) : (
        <ul className="mb-3 divide-y divide-slate-200 rounded-lg border border-slate-200 bg-white">
          {todos.map((td) => (
            <li key={td.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 hover:bg-slate-50">
              <span className="text-slate-900">
                {td.title}{" "}
                <span className="text-xs text-slate-500">({td.status})</span>
              </span>
              <Link to={`/workspace/todos/${td.id}`} className="text-sm font-medium text-blue-700 underline">
                Open
              </Link>
            </li>
          ))}
        </ul>
      )}
      <div className="mb-8 max-w-xl rounded-lg border border-dashed border-slate-300 bg-slate-50/80 p-3">
        <p className="mb-2 text-sm font-medium text-slate-700">Add todo</p>
        <div className="flex flex-wrap items-end gap-2">
          <div className="min-w-[12rem] flex-1">
            <label className="block text-xs font-medium text-slate-600">Title</label>
            <input
              className="mt-1 w-full rounded border border-slate-300 bg-white px-2 py-1.5 text-sm"
              value={newTodoTitle}
              onChange={(e) => setNewTodoTitle(e.target.value)}
              placeholder="Todo title"
            />
          </div>
          <button
            type="button"
            disabled={todoBusy || !newTodoTitle.trim()}
            className="rounded border bg-slate-900 px-3 py-1.5 text-sm text-white disabled:opacity-50"
            onClick={() => {
              setErr(null);
              setTodoBusy(true);
              void api("/api/todos", {
                method: "POST",
                body: JSON.stringify({
                  taskId: task.id,
                  title: newTodoTitle.trim(),
                  orderIndex: nextTodoOrder,
                }),
              })
                .then(async () => {
                  setNewTodoTitle("");
                  await refresh();
                })
                .catch((e: Error) => setErr(e.message))
                .finally(() => setTodoBusy(false));
            }}
          >
            {todoBusy ? "…" : "Add todo"}
          </button>
        </div>
      </div>

      <h2 className="mb-2 text-lg font-semibold text-slate-800">Time entries</h2>
      {entries.length === 0 ? (
        <p className="mb-2 text-sm text-slate-500">No time entries on this task — add one below.</p>
      ) : (
        <ul className="mb-3 divide-y divide-slate-200 rounded-lg border border-slate-200 bg-white">
          {entries.map((te) => (
            <li key={te.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 hover:bg-slate-50">
              <span className="text-sm text-slate-700">
                {te.durationMinutes ?? "—"} min · {userName.get(te.userId) ?? te.userId.slice(0, 8)}
                {te.note ? ` · ${te.note.slice(0, 60)}${te.note.length > 60 ? "…" : ""}` : ""}
              </span>
              <Link to={`/workspace/time-entries/${te.id}`} className="text-sm font-medium text-blue-700 underline">
                Open
              </Link>
            </li>
          ))}
        </ul>
      )}
      <div className="max-w-xl rounded-lg border border-dashed border-slate-300 bg-slate-50/80 p-3">
        <p className="mb-2 text-sm font-medium text-slate-700">Add time entry</p>
        <p className="mb-2 text-xs text-slate-600">Creates a draft entry on this task (you). Set duration and notes on the entry page.</p>
        <div className="flex flex-wrap items-end gap-2">
          <div className="min-w-[10rem] flex-1">
            <label className="block text-xs font-medium text-slate-600">Link to todo (optional)</label>
            <select
              className="mt-1 w-full rounded border border-slate-300 bg-white px-2 py-1.5 text-sm"
              value={timeTodoId}
              onChange={(e) => setTimeTodoId(e.target.value)}
            >
              <option value="">(none)</option>
              {todos.map((td) => (
                <option key={td.id} value={td.id}>
                  {td.title}
                </option>
              ))}
            </select>
          </div>
          <button
            type="button"
            disabled={timeBusy}
            className="rounded border bg-slate-900 px-3 py-1.5 text-sm text-white disabled:opacity-50"
            onClick={() => {
              setErr(null);
              setTimeBusy(true);
              void api("/api/time-entries", {
                method: "POST",
                body: JSON.stringify({
                  taskId: task.id,
                  todoId: timeTodoId || null,
                }),
              })
                .then(refresh)
                .catch((e: Error) => setErr(e.message))
                .finally(() => setTimeBusy(false));
            }}
          >
            {timeBusy ? "…" : "Add time entry"}
          </button>
        </div>
      </div>
    </WorkspaceDetailChrome>
  );
}
