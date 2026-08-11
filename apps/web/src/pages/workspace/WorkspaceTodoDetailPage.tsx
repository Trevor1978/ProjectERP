import { useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import { api } from "../../lib/api";
import { WorkspaceDetailChrome } from "./WorkspaceDetailChrome";
import { isoToLocal, localToIso } from "../../workspace/workspaceDates";

type Task = { id: string; title: string; version: number };
type Todo = {
  id: string;
  taskId: string;
  title: string;
  description: string | null;
  status: "backlog" | "in_progress" | "blocked" | "testing" | "done" | "cancelled";
  dueAt: string | null;
  priority: "low" | "normal" | "high" | "urgent";
  orderIndex: number;
  assigneeId: string | null;
  version: number;
};
type OrgUser = { id: string; name: string };

const TODO_STATUS = ["backlog", "in_progress", "blocked", "testing", "done", "cancelled"] as const;
const TODO_PRIORITY = ["low", "normal", "high", "urgent"] as const;

export function WorkspaceTodoDetailPage() {
  const { todoId } = useParams<{ todoId: string }>();
  const qc = useQueryClient();
  const { data: todosData } = useQuery({
    queryKey: ["todos-all"],
    queryFn: () => api<{ todos: Todo[] }>("/api/todos"),
  });
  const { data: tasksData } = useQuery({
    queryKey: ["tasks-all"],
    queryFn: () => api<{ tasks: Task[] }>("/api/tasks"),
  });
  const { data: orgUsersData } = useQuery({
    queryKey: ["org-users"],
    queryFn: () => api<{ users: OrgUser[] }>("/api/org/users"),
  });

  const todo = todosData?.todos.find((t) => t.id === todoId);
  const task = tasksData?.tasks.find((t) => t.id === todo?.taskId);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState<Todo["status"]>("backlog");
  const [priority, setPriority] = useState<Todo["priority"]>("normal");
  const [dueAt, setDueAt] = useState("");
  const [orderIndex, setOrderIndex] = useState("0");
  const [assigneeId, setAssigneeId] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!todo) return;
    setTitle(todo.title);
    setDescription(todo.description ?? "");
    setStatus(todo.status);
    setPriority(todo.priority);
    setDueAt(isoToLocal(todo.dueAt));
    setOrderIndex(String(todo.orderIndex));
    setAssigneeId(todo.assigneeId ?? "");
  }, [todo]);

  async function refresh() {
    await qc.invalidateQueries({ queryKey: ["todos-all"] });
  }

  if (!todoId) return null;
  if (!todosData) return <p className="text-slate-500">Loading…</p>;
  if (!todo) {
    return (
      <WorkspaceDetailChrome backTo="/workspace/todos" backLabel="← Todos" title="Not found">
        <p className="text-slate-600">Todo not found.</p>
      </WorkspaceDetailChrome>
    );
  }

  const users = orgUsersData?.users ?? [];
  const back = task ? `/workspace/tasks/${task.id}` : "/workspace/todos";

  return (
    <WorkspaceDetailChrome backTo={back} backLabel={task ? `← ${task.title}` : "← Todos"} title={todo.title}>
      {task && (
        <p className="text-sm text-slate-600">
          Task:{" "}
          <Link to={`/workspace/tasks/${task.id}`} className="text-blue-700 underline">
            {task.title}
          </Link>
        </p>
      )}

      {err && <p className="text-sm text-red-600">{err}</p>}
      <div className="grid max-w-xl gap-3 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <div>
          <label className="block text-sm font-medium">Title</label>
          <input className="mt-1 w-full rounded border px-2 py-1.5" value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>
        <div>
          <label className="block text-sm font-medium">Description</label>
          <textarea
            className="mt-1 w-full rounded border px-2 py-1.5"
            rows={4}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>
        <div>
          <label className="block text-sm font-medium">Status</label>
          <select className="mt-1 w-full rounded border px-2 py-1.5" value={status} onChange={(e) => setStatus(e.target.value as Todo["status"])}>
            {TODO_STATUS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium">Priority</label>
          <select className="mt-1 w-full rounded border px-2 py-1.5" value={priority} onChange={(e) => setPriority(e.target.value as Todo["priority"])}>
            {TODO_PRIORITY.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium">Due</label>
          <input type="datetime-local" className="mt-1 w-full rounded border px-2 py-1.5" value={dueAt} onChange={(e) => setDueAt(e.target.value)} />
        </div>
        <div>
          <label className="block text-sm font-medium">Order</label>
          <input type="number" className="mt-1 w-full rounded border px-2 py-1.5" value={orderIndex} onChange={(e) => setOrderIndex(e.target.value)} />
        </div>
        <div>
          <label className="block text-sm font-medium">Assignee</label>
          <select className="mt-1 w-full rounded border px-2 py-1.5" value={assigneeId} onChange={(e) => setAssigneeId(e.target.value)}>
            <option value="">(unassigned)</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
        </div>
        <button
          type="button"
          disabled={saving || !title.trim()}
          className="w-fit rounded border bg-slate-900 px-3 py-1.5 text-sm text-white disabled:opacity-50"
          onClick={() => {
            setErr(null);
            setSaving(true);
            void api("/api/todos/" + todo.id, {
              method: "PATCH",
              body: JSON.stringify({
                title: title.trim(),
                description: description.trim() || null,
                status,
                priority,
                dueAt: localToIso(dueAt),
                orderIndex: Number(orderIndex) || 0,
                assigneeId: assigneeId || null,
                version: todo.version,
              }),
            })
              .then(refresh)
              .catch((e: Error) => setErr(e.message))
              .finally(() => setSaving(false));
          }}
        >
          Save todo
        </button>
      </div>
    </WorkspaceDetailChrome>
  );
}
