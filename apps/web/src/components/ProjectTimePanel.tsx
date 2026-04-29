import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { api } from "../lib/api";
import type { Task } from "../types";

type TimeEntry = {
  id: string;
  userId: string;
  taskId: string;
  durationMinutes: number | null;
  note: string | null;
  createdAt: string;
};

export function ProjectTimePanel({
  projectId,
  tasks,
}: {
  projectId: string;
  tasks: Task[];
}) {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["time-entries", projectId],
    queryFn: () =>
      api<{ timeEntries: TimeEntry[] }>(
        "/api/time-entries?projectId=" + encodeURIComponent(projectId),
      ),
  });
  const [taskId, setTaskId] = useState("");
  const [minutes, setMinutes] = useState("");
  const [note, setNote] = useState("");

  useEffect(() => {
    if (!taskId && tasks[0]) {
      setTaskId(tasks[0]!.id);
    }
  }, [taskId, tasks]);

  const taskMap = new Map(tasks.map((t) => [t.id, t.title] as const));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!taskId || !minutes) {
      return;
    }
    const m = Number(minutes);
    if (!Number.isFinite(m) || m <= 0) {
      return;
    }
    await api("/api/time-entries", {
      method: "POST",
      body: JSON.stringify({
        taskId,
        durationMinutes: Math.round(m),
        note: note.trim() || null,
      }),
    });
    setMinutes("");
    setNote("");
    await qc.invalidateQueries({ queryKey: ["time-entries", projectId] });
    await qc.invalidateQueries({ queryKey: ["schedule", projectId] });
  }

  if (isLoading) {
    return <p className="text-slate-500">Loading time…</p>;
  }
  if (tasks.length === 0) {
    return (
      <p className="text-slate-500 p-4 bg-amber-50 border border-amber-200 rounded text-sm">
        Add tasks on the <strong>Milestones</strong> tab before logging time.
      </p>
    );
  }
  const rows = data?.timeEntries ?? [];
  const totalMin = rows.reduce(
    (a, t) => a + (t.durationMinutes ?? 0),
    0,
  );
  return (
    <div className="space-y-6">
      <form
        onSubmit={(e) => void submit(e)}
        className="p-4 bg-white border rounded space-y-3 max-w-lg"
      >
        <h3 className="text-sm font-semibold text-slate-700">Log time</h3>
        <div>
          <label className="text-xs text-slate-500 block">Task</label>
          <select
            className="border rounded px-2 py-1.5 w-full"
            value={taskId}
            onChange={(e) => setTaskId(e.target.value)}
          >
            {tasks.map((t) => (
              <option key={t.id} value={t.id}>
                {t.title}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-xs text-slate-500 block">Minutes</label>
          <input
            type="number"
            min={1}
            className="border rounded px-2 py-1.5 w-full"
            value={minutes}
            onChange={(e) => setMinutes(e.target.value)}
            placeholder="e.g. 90"
            required
          />
        </div>
        <div>
          <label className="text-xs text-slate-500 block">Note (optional)</label>
          <input
            className="border rounded px-2 py-1.5 w-full"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="What did you do?"
          />
        </div>
        <button
          type="submit"
          className="px-4 py-1.5 bg-slate-900 text-white text-sm rounded"
        >
          Save entry
        </button>
      </form>

      <div>
        <div className="text-sm text-slate-600 mb-2">
          <strong>Project time</strong> — {rows.length} entries,{" "}
          {(totalMin / 60).toFixed(1)} h total (from stored minutes)
        </div>
        <div className="border rounded overflow-hidden bg-white text-sm max-h-80 overflow-y-auto">
          <table className="w-full">
            <thead className="bg-slate-100 text-left text-xs uppercase text-slate-500">
              <tr>
                <th className="p-2">Task</th>
                <th className="p-2">Min</th>
                <th className="p-2">Note</th>
                <th className="p-2">User</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t">
                  <td className="p-2">
                    {taskMap.get(r.taskId) ?? r.taskId}
                  </td>
                  <td className="p-2 font-mono">{r.durationMinutes ?? "—"}</td>
                  <td className="p-2 text-slate-600 max-w-xs truncate">
                    {r.note ?? "—"}
                  </td>
                  <td className="p-2 text-xs text-slate-400">{r.userId.slice(0, 8)}…</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
