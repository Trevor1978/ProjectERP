import { useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import { api } from "../../lib/api";
import { WorkspaceDetailChrome } from "./WorkspaceDetailChrome";
import { isoToLocal, localToIso } from "../../workspace/workspaceDates";

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
type Task = { id: string; title: string; version: number };
type Todo = { id: string; title: string };

export function WorkspaceTimeEntryDetailPage() {
  const { timeEntryId } = useParams<{ timeEntryId: string }>();
  const qc = useQueryClient();
  const { data: timeData } = useQuery({
    queryKey: ["time-all"],
    queryFn: () => api<{ timeEntries: TimeEntry[] }>("/api/time-entries"),
  });
  const { data: tasksData } = useQuery({
    queryKey: ["tasks-all"],
    queryFn: () => api<{ tasks: Task[] }>("/api/tasks"),
  });
  const { data: todosData } = useQuery({
    queryKey: ["todos-all"],
    queryFn: () => api<{ todos: Todo[] }>("/api/todos"),
  });

  const entry = timeData?.timeEntries.find((e) => e.id === timeEntryId);
  const task = tasksData?.tasks.find((t) => t.id === entry?.taskId);
  const todo = todosData?.todos.find((t) => t.id === entry?.todoId);

  const [startedAt, setStartedAt] = useState("");
  const [endedAt, setEndedAt] = useState("");
  const [durationMinutes, setDurationMinutes] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!entry) return;
    setStartedAt(isoToLocal(entry.startedAt));
    setEndedAt(isoToLocal(entry.endedAt));
    setDurationMinutes(entry.durationMinutes == null ? "" : String(entry.durationMinutes));
    setNote(entry.note ?? "");
  }, [entry]);

  async function refresh() {
    await qc.invalidateQueries({ queryKey: ["time-all"] });
  }

  if (!timeEntryId) return null;
  if (!timeData) return <p className="text-slate-500">Loading…</p>;
  if (!entry) {
    return (
      <WorkspaceDetailChrome backTo="/workspace/time-entries" backLabel="← Time entries" title="Not found">
        <p className="text-slate-600">Time entry not found.</p>
      </WorkspaceDetailChrome>
    );
  }

  const back = task ? `/workspace/tasks/${task.id}` : "/workspace/time-entries";

  return (
    <WorkspaceDetailChrome backTo={back} backLabel={task ? `← ${task.title}` : "← Time entries"} title="Time entry">
      <p className="text-sm text-slate-600">
        Task:{" "}
        {task ? (
          <Link to={`/workspace/tasks/${task.id}`} className="text-blue-700 underline">
            {task.title}
          </Link>
        ) : (
          entry.taskId
        )}
        {todo ? (
          <>
            {" · "}
            Todo: {todo.title}
          </>
        ) : null}
      </p>

      {err && <p className="text-sm text-red-600">{err}</p>}
      <div className="grid max-w-xl gap-3 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <div>
          <label className="block text-sm font-medium">Started</label>
          <input type="datetime-local" className="mt-1 w-full rounded border px-2 py-1.5" value={startedAt} onChange={(e) => setStartedAt(e.target.value)} />
        </div>
        <div>
          <label className="block text-sm font-medium">Ended</label>
          <input type="datetime-local" className="mt-1 w-full rounded border px-2 py-1.5" value={endedAt} onChange={(e) => setEndedAt(e.target.value)} />
        </div>
        <div>
          <label className="block text-sm font-medium">Duration (minutes)</label>
          <input type="number" className="mt-1 w-full rounded border px-2 py-1.5" value={durationMinutes} onChange={(e) => setDurationMinutes(e.target.value)} />
        </div>
        <div>
          <label className="block text-sm font-medium">Note</label>
          <textarea className="mt-1 w-full rounded border px-2 py-1.5" rows={3} value={note} onChange={(e) => setNote(e.target.value)} />
        </div>
        <button
          type="button"
          disabled={saving}
          className="w-fit rounded border bg-slate-900 px-3 py-1.5 text-sm text-white disabled:opacity-50"
          onClick={() => {
            setErr(null);
            setSaving(true);
            void api("/api/time-entries/" + entry.id, {
              method: "PATCH",
              body: JSON.stringify({
                startedAt: localToIso(startedAt),
                endedAt: localToIso(endedAt),
                durationMinutes: durationMinutes.trim() ? Number(durationMinutes) : null,
                note: note.trim() || null,
                version: entry.version,
              }),
            })
              .then(refresh)
              .catch((e: Error) => setErr(e.message))
              .finally(() => setSaving(false));
          }}
        >
          Save
        </button>
      </div>
    </WorkspaceDetailChrome>
  );
}
