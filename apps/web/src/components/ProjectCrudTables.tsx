import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import type { Milestone, Task, Todo } from "../types";

type CrudTab =
  | "milestones"
  | "tasks"
  | "todos"
  | "timeEntries"
  | "procurement"
  | "procurementLines";

type TimeEntry = {
  id: string;
  taskId: string;
  durationMinutes: number | null;
  note: string | null;
  version: number;
};

type Procurement = {
  id: string;
  title: string;
  status: string;
  version: number;
};

type ProcurementLine = {
  id: string;
  procurementId: string;
  description: string;
  quantity: string;
  version: number;
};

const TAB_LABEL: Record<CrudTab, string> = {
  milestones: "Milestones",
  tasks: "Tasks",
  todos: "Todos",
  timeEntries: "Time entries",
  procurement: "Procurement",
  procurementLines: "Procurement lines",
};

export function ProjectCrudTables({
  projectId,
  milestones,
  tasks,
  todos,
  onRefresh,
}: {
  projectId: string;
  milestones: Milestone[];
  tasks: Task[];
  todos: Todo[];
  onRefresh: () => void;
}) {
  const qc = useQueryClient();
  const [tab, setTab] = useState<CrudTab>("milestones");
  const [newMilestoneName, setNewMilestoneName] = useState("");
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [newTaskMilestoneId, setNewTaskMilestoneId] = useState(milestones[0]?.id ?? "");
  const [newTodoTitle, setNewTodoTitle] = useState("");
  const [newTodoTaskId, setNewTodoTaskId] = useState(tasks[0]?.id ?? "");
  const [newMinutes, setNewMinutes] = useState("");
  const [newTimeTaskId, setNewTimeTaskId] = useState(tasks[0]?.id ?? "");
  const [newTimeNote, setNewTimeNote] = useState("");
  const [newProcTitle, setNewProcTitle] = useState("");
  const [newLineProcId, setNewLineProcId] = useState("");
  const [newLineDescription, setNewLineDescription] = useState("");
  const [newLineQty, setNewLineQty] = useState("1");

  const taskMap = useMemo(
    () => new Map(tasks.map((t) => [t.id, t.title] as const)),
    [tasks],
  );
  const milestoneMap = useMemo(
    () => new Map(milestones.map((m) => [m.id, m.name] as const)),
    [milestones],
  );

  const { data: timeData } = useQuery({
    queryKey: ["crud-time-entries", projectId],
    queryFn: () =>
      api<{ timeEntries: TimeEntry[] }>(
        "/api/time-entries?projectId=" + encodeURIComponent(projectId),
      ),
  });

  const { data: procurementData } = useQuery({
    queryKey: ["crud-procurement", projectId],
    queryFn: () =>
      api<{ procurement: Procurement[]; lines: ProcurementLine[] }>(
        "/api/procurement?projectId=" + encodeURIComponent(projectId),
      ),
  });

  async function refreshAll() {
    onRefresh();
    await qc.invalidateQueries({ queryKey: ["crud-time-entries", projectId] });
    await qc.invalidateQueries({ queryKey: ["crud-procurement", projectId] });
  }

  return (
    <div className="space-y-4">
      <nav className="flex flex-wrap gap-1 border-b border-slate-200">
        {(Object.keys(TAB_LABEL) as CrudTab[]).map((k) => (
          <button
            type="button"
            key={k}
            onClick={() => setTab(k)}
            className={
              "px-3 py-2 text-sm -mb-px " +
              (tab === k
                ? "border-b-2 border-slate-900 font-medium"
                : "text-slate-500 hover:text-slate-800")
            }
          >
            {TAB_LABEL[k]}
          </button>
        ))}
      </nav>

      {tab === "milestones" && (
        <div className="overflow-x-auto border rounded bg-white">
          <table className="w-full text-sm">
            <thead className="bg-slate-100 text-left">
              <tr>
                <th className="p-2">Name</th>
                <th className="p-2">Order</th>
                <th className="p-2">Action</th>
              </tr>
            </thead>
            <tbody>
              {milestones.map((m) => (
                <tr key={m.id} className="border-t">
                  <td className="p-2">
                    <InlineText
                      value={m.name}
                      onSave={async (name) => {
                        await api("/api/milestones/" + m.id, {
                          method: "PATCH",
                          body: JSON.stringify({ name, version: m.version }),
                        });
                        await refreshAll();
                      }}
                    />
                  </td>
                  <td className="p-2">{m.orderIndex}</td>
                  <td className="p-2 text-slate-400">Update only</td>
                </tr>
              ))}
              <tr className="border-t bg-slate-50">
                <td className="p-2">
                  <input
                    className="w-full border rounded px-2 py-1"
                    placeholder="New milestone"
                    value={newMilestoneName}
                    onChange={(e) => setNewMilestoneName(e.target.value)}
                  />
                </td>
                <td className="p-2">{milestones.length}</td>
                <td className="p-2">
                  <button
                    type="button"
                    className="px-2 py-1 border rounded"
                    onClick={() => {
                      if (!newMilestoneName.trim()) return;
                      void api("/api/milestones", {
                        method: "POST",
                        body: JSON.stringify({
                          projectId,
                          name: newMilestoneName.trim(),
                          orderIndex: milestones.length,
                        }),
                      }).then(async () => {
                        setNewMilestoneName("");
                        await refreshAll();
                      });
                    }}
                  >
                    Add
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {tab === "tasks" && (
        <div className="overflow-x-auto border rounded bg-white">
          <table className="w-full text-sm">
            <thead className="bg-slate-100 text-left">
              <tr>
                <th className="p-2">Title</th>
                <th className="p-2">Milestone</th>
                <th className="p-2">Progress %</th>
                <th className="p-2">Action</th>
              </tr>
            </thead>
            <tbody>
              {tasks.map((t, idx) => (
                <tr key={t.id} className="border-t">
                  <td className="p-2">
                    <InlineText
                      value={t.title}
                      onSave={async (title) => {
                        await api("/api/tasks/" + t.id, {
                          method: "PATCH",
                          body: JSON.stringify({ title, version: t.version }),
                        });
                        await refreshAll();
                      }}
                    />
                  </td>
                  <td className="p-2">
                    <select
                      className="border rounded px-2 py-1"
                      value={t.milestoneId}
                      onChange={(e) => {
                        void api("/api/tasks/" + t.id, {
                          method: "PATCH",
                          body: JSON.stringify({
                            milestoneId: e.target.value,
                            version: t.version,
                          }),
                        }).then(() => void refreshAll());
                      }}
                    >
                      {milestones.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.name}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="p-2">
                    <InlineNumber
                      value={t.percentComplete}
                      onSave={async (percentComplete) => {
                        await api("/api/tasks/" + t.id, {
                          method: "PATCH",
                          body: JSON.stringify({
                            percentComplete,
                            useDerivedPercent: false,
                            version: t.version,
                          }),
                        });
                        await refreshAll();
                      }}
                    />
                  </td>
                  <td className="p-2 text-slate-400">#{idx + 1}</td>
                </tr>
              ))}
              <tr className="border-t bg-slate-50">
                <td className="p-2">
                  <input
                    className="w-full border rounded px-2 py-1"
                    placeholder="New task title"
                    value={newTaskTitle}
                    onChange={(e) => setNewTaskTitle(e.target.value)}
                  />
                </td>
                <td className="p-2">
                  <select
                    className="border rounded px-2 py-1 w-full"
                    value={newTaskMilestoneId}
                    onChange={(e) => setNewTaskMilestoneId(e.target.value)}
                  >
                    <option value="">Choose milestone</option>
                    {milestones.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="p-2">0</td>
                <td className="p-2">
                  <button
                    type="button"
                    className="px-2 py-1 border rounded"
                    onClick={() => {
                      if (!newTaskTitle.trim() || !newTaskMilestoneId) return;
                      void api("/api/tasks", {
                        method: "POST",
                        body: JSON.stringify({
                          projectId,
                          milestoneId: newTaskMilestoneId,
                          title: newTaskTitle.trim(),
                          orderIndex: tasks.filter((t) => t.milestoneId === newTaskMilestoneId).length,
                          useDerivedPercent: true,
                          percentComplete: 0,
                        }),
                      }).then(async () => {
                        setNewTaskTitle("");
                        await refreshAll();
                      });
                    }}
                  >
                    Add
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {tab === "todos" && (
        <div className="overflow-x-auto border rounded bg-white">
          <table className="w-full text-sm">
            <thead className="bg-slate-100 text-left">
              <tr>
                <th className="p-2">Title</th>
                <th className="p-2">Task</th>
                <th className="p-2">Status</th>
                <th className="p-2">Action</th>
              </tr>
            </thead>
            <tbody>
              {todos.map((td) => (
                <tr key={td.id} className="border-t">
                  <td className="p-2">
                    <InlineText
                      value={td.title}
                      onSave={async (title) => {
                        await api("/api/todos/" + td.id, {
                          method: "PATCH",
                          body: JSON.stringify({ title, version: td.version }),
                        });
                        await refreshAll();
                      }}
                    />
                  </td>
                  <td className="p-2">{taskMap.get(td.taskId) ?? td.taskId}</td>
                  <td className="p-2">
                    <select
                      className="border rounded px-2 py-1"
                      value={td.status}
                      onChange={(e) => {
                        void api("/api/todos/" + td.id, {
                          method: "PATCH",
                          body: JSON.stringify({ status: e.target.value, version: td.version }),
                        }).then(() => void refreshAll());
                      }}
                    >
                      <option value="backlog">backlog</option>
                      <option value="in_progress">in_progress</option>
                      <option value="blocked">blocked</option>
                      <option value="done">done</option>
                    </select>
                  </td>
                  <td className="p-2 text-slate-400">Update only</td>
                </tr>
              ))}
              <tr className="border-t bg-slate-50">
                <td className="p-2">
                  <input
                    className="w-full border rounded px-2 py-1"
                    placeholder="New todo title"
                    value={newTodoTitle}
                    onChange={(e) => setNewTodoTitle(e.target.value)}
                  />
                </td>
                <td className="p-2">
                  <select
                    className="border rounded px-2 py-1 w-full"
                    value={newTodoTaskId}
                    onChange={(e) => setNewTodoTaskId(e.target.value)}
                  >
                    <option value="">Choose task</option>
                    {tasks.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.title}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="p-2">backlog</td>
                <td className="p-2">
                  <button
                    type="button"
                    className="px-2 py-1 border rounded"
                    onClick={() => {
                      if (!newTodoTitle.trim() || !newTodoTaskId) return;
                      void api("/api/todos", {
                        method: "POST",
                        body: JSON.stringify({
                          taskId: newTodoTaskId,
                          title: newTodoTitle.trim(),
                          status: "backlog",
                          orderIndex: todos.filter((t) => t.taskId === newTodoTaskId).length,
                        }),
                      }).then(async () => {
                        setNewTodoTitle("");
                        await refreshAll();
                      });
                    }}
                  >
                    Add
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {tab === "timeEntries" && (
        <div className="overflow-x-auto border rounded bg-white">
          <table className="w-full text-sm">
            <thead className="bg-slate-100 text-left">
              <tr>
                <th className="p-2">Task</th>
                <th className="p-2">Minutes</th>
                <th className="p-2">Note</th>
                <th className="p-2">Action</th>
              </tr>
            </thead>
            <tbody>
              {(timeData?.timeEntries ?? []).map((entry) => (
                <tr key={entry.id} className="border-t">
                  <td className="p-2">{taskMap.get(entry.taskId) ?? entry.taskId}</td>
                  <td className="p-2">
                    <InlineNumber
                      value={entry.durationMinutes ?? 0}
                      onSave={async (durationMinutes) => {
                        await api("/api/time-entries/" + entry.id, {
                          method: "PATCH",
                          body: JSON.stringify({ durationMinutes, version: entry.version }),
                        });
                        await refreshAll();
                      }}
                    />
                  </td>
                  <td className="p-2">
                    <InlineText
                      value={entry.note ?? ""}
                      placeholder="Add note"
                      onSave={async (note) => {
                        await api("/api/time-entries/" + entry.id, {
                          method: "PATCH",
                          body: JSON.stringify({ note: note || null, version: entry.version }),
                        });
                        await refreshAll();
                      }}
                    />
                  </td>
                  <td className="p-2 text-slate-400">Update only</td>
                </tr>
              ))}
              <tr className="border-t bg-slate-50">
                <td className="p-2">
                  <select
                    className="border rounded px-2 py-1 w-full"
                    value={newTimeTaskId}
                    onChange={(e) => setNewTimeTaskId(e.target.value)}
                  >
                    <option value="">Choose task</option>
                    {tasks.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.title}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="p-2">
                  <input
                    type="number"
                    min={1}
                    className="w-full border rounded px-2 py-1"
                    value={newMinutes}
                    onChange={(e) => setNewMinutes(e.target.value)}
                    placeholder="Minutes"
                  />
                </td>
                <td className="p-2">
                  <input
                    className="w-full border rounded px-2 py-1"
                    value={newTimeNote}
                    onChange={(e) => setNewTimeNote(e.target.value)}
                    placeholder="Optional note"
                  />
                </td>
                <td className="p-2">
                  <button
                    type="button"
                    className="px-2 py-1 border rounded"
                    onClick={() => {
                      const m = Number(newMinutes);
                      if (!newTimeTaskId || !Number.isFinite(m) || m <= 0) return;
                      void api("/api/time-entries", {
                        method: "POST",
                        body: JSON.stringify({
                          taskId: newTimeTaskId,
                          durationMinutes: Math.round(m),
                          note: newTimeNote.trim() || null,
                        }),
                      }).then(async () => {
                        setNewMinutes("");
                        setNewTimeNote("");
                        await refreshAll();
                      });
                    }}
                  >
                    Add
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {tab === "procurement" && (
        <div className="overflow-x-auto border rounded bg-white">
          <table className="w-full text-sm">
            <thead className="bg-slate-100 text-left">
              <tr>
                <th className="p-2">Title</th>
                <th className="p-2">Status</th>
                <th className="p-2">Action</th>
              </tr>
            </thead>
            <tbody>
              {(procurementData?.procurement ?? []).map((p) => (
                <tr key={p.id} className="border-t">
                  <td className="p-2">
                    <InlineText
                      value={p.title}
                      onSave={async (title) => {
                        await api("/api/procurement/" + p.id, {
                          method: "PATCH",
                          body: JSON.stringify({ title, version: p.version }),
                        });
                        await refreshAll();
                      }}
                    />
                  </td>
                  <td className="p-2">
                    <select
                      className="border rounded px-2 py-1"
                      value={p.status}
                      onChange={(e) => {
                        void api("/api/procurement/" + p.id, {
                          method: "PATCH",
                          body: JSON.stringify({ status: e.target.value, version: p.version }),
                        }).then(() => void refreshAll());
                      }}
                    >
                      <option value="draft">draft</option>
                      <option value="rfq_sent">rfq_sent</option>
                      <option value="quoted">quoted</option>
                      <option value="ordered">ordered</option>
                      <option value="closed">closed</option>
                      <option value="cancelled">cancelled</option>
                    </select>
                  </td>
                  <td className="p-2 text-slate-400">Update only</td>
                </tr>
              ))}
              <tr className="border-t bg-slate-50">
                <td className="p-2">
                  <input
                    className="w-full border rounded px-2 py-1"
                    placeholder="New procurement title"
                    value={newProcTitle}
                    onChange={(e) => setNewProcTitle(e.target.value)}
                  />
                </td>
                <td className="p-2">draft</td>
                <td className="p-2">
                  <button
                    type="button"
                    className="px-2 py-1 border rounded"
                    onClick={() => {
                      if (!newProcTitle.trim()) return;
                      void api("/api/procurement", {
                        method: "POST",
                        body: JSON.stringify({
                          projectId,
                          title: newProcTitle.trim(),
                          status: "draft",
                        }),
                      }).then(async () => {
                        setNewProcTitle("");
                        await refreshAll();
                      });
                    }}
                  >
                    Add
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {tab === "procurementLines" && (
        <div className="overflow-x-auto border rounded bg-white">
          <table className="w-full text-sm">
            <thead className="bg-slate-100 text-left">
              <tr>
                <th className="p-2">Procurement</th>
                <th className="p-2">Description</th>
                <th className="p-2">Qty</th>
                <th className="p-2">Action</th>
              </tr>
            </thead>
            <tbody>
              {(procurementData?.lines ?? []).map((line) => (
                <tr key={line.id} className="border-t">
                  <td className="p-2">
                    {(procurementData?.procurement ?? []).find((p) => p.id === line.procurementId)?.title ??
                      line.procurementId}
                  </td>
                  <td className="p-2">
                    <InlineText
                      value={line.description}
                      onSave={async (description) => {
                        await api("/api/procurement-lines/" + line.id, {
                          method: "PATCH",
                          body: JSON.stringify({ description, version: line.version }),
                        });
                        await refreshAll();
                      }}
                    />
                  </td>
                  <td className="p-2">
                    <InlineText
                      value={line.quantity}
                      onSave={async (quantity) => {
                        await api("/api/procurement-lines/" + line.id, {
                          method: "PATCH",
                          body: JSON.stringify({ quantity, version: line.version }),
                        });
                        await refreshAll();
                      }}
                    />
                  </td>
                  <td className="p-2 text-slate-400">Update only</td>
                </tr>
              ))}
              <tr className="border-t bg-slate-50">
                <td className="p-2">
                  <select
                    className="border rounded px-2 py-1 w-full"
                    value={newLineProcId}
                    onChange={(e) => setNewLineProcId(e.target.value)}
                  >
                    <option value="">Choose procurement</option>
                    {(procurementData?.procurement ?? []).map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.title}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="p-2">
                  <input
                    className="w-full border rounded px-2 py-1"
                    value={newLineDescription}
                    onChange={(e) => setNewLineDescription(e.target.value)}
                    placeholder="Line description"
                  />
                </td>
                <td className="p-2">
                  <input
                    className="w-full border rounded px-2 py-1"
                    value={newLineQty}
                    onChange={(e) => setNewLineQty(e.target.value)}
                    placeholder="1"
                  />
                </td>
                <td className="p-2">
                  <button
                    type="button"
                    className="px-2 py-1 border rounded"
                    onClick={() => {
                      if (!newLineProcId || !newLineDescription.trim()) return;
                      const orderIndex =
                        (procurementData?.lines ?? []).filter(
                          (line) => line.procurementId === newLineProcId,
                        ).length;
                      void api("/api/procurement-lines", {
                        method: "POST",
                        body: JSON.stringify({
                          procurementId: newLineProcId,
                          description: newLineDescription.trim(),
                          quantity: newLineQty || "1",
                          orderIndex,
                        }),
                      }).then(async () => {
                        setNewLineDescription("");
                        setNewLineQty("1");
                        await refreshAll();
                      });
                    }}
                  >
                    Add
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {tasks.length > 0 && (
        <p className="text-xs text-slate-500">
          Task milestone: {milestoneMap.get(tasks[0]!.milestoneId) ?? "—"} (reference)
        </p>
      )}
    </div>
  );
}

function InlineText({
  value,
  onSave,
  placeholder,
}: {
  value: string;
  onSave: (next: string) => Promise<void>;
  placeholder?: string;
}) {
  const [draft, setDraft] = useState(value);
  const [isEditing, setIsEditing] = useState(false);
  if (!isEditing) {
    return (
      <button
        type="button"
        className="w-full text-left"
        onClick={() => {
          setDraft(value);
          setIsEditing(true);
        }}
      >
        {value || placeholder || "—"}
      </button>
    );
  }
  return (
    <input
      className="w-full border rounded px-2 py-1"
      value={draft}
      placeholder={placeholder}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        setIsEditing(false);
        if (draft !== value) {
          void onSave(draft);
        }
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          (e.target as HTMLInputElement).blur();
        }
      }}
      autoFocus
    />
  );
}

function InlineNumber({
  value,
  onSave,
}: {
  value: number;
  onSave: (next: number) => Promise<void>;
}) {
  const [draft, setDraft] = useState(String(value));
  return (
    <input
      type="number"
      className="w-24 border rounded px-2 py-1"
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        const num = Number(draft);
        if (Number.isFinite(num) && num !== value) {
          void onSave(num);
        } else {
          setDraft(String(value));
        }
      }}
    />
  );
}
