import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import type { Milestone, Task, Todo } from "../types";
import { useMe } from "../hooks/useMe";
import { DeleteConfirmModal } from "./DeleteConfirmModal";

type CrudTab =
  | "milestones"
  | "tasks"
  | "todos"
  | "timeEntries"
  | "procurement"
  | "procurementLines";

type TimeEntry = {
  id: string;
  userId: string;
  taskId: string;
  durationMinutes: number | null;
  note: string | null;
  version: number;
};

type ProjectDeleteKind =
  | "milestone"
  | "task"
  | "todo"
  | "timeEntry"
  | "procurement"
  | "procurementLine";

function projectDeletePreviewPath(kind: ProjectDeleteKind, id: string): string {
  switch (kind) {
    case "milestone":
      return `/api/milestones/${id}/delete-preview`;
    case "task":
      return `/api/tasks/${id}/delete-preview`;
    case "todo":
      return `/api/todos/${id}/delete-preview`;
    case "timeEntry":
      return `/api/time-entries/${id}/delete-preview`;
    case "procurement":
      return `/api/procurement/${id}/delete-preview`;
    case "procurementLine":
      return `/api/procurement-lines/${id}/delete-preview`;
    default:
      return "";
  }
}

function projectDeleteExecutePath(kind: ProjectDeleteKind, id: string): string {
  switch (kind) {
    case "milestone":
      return `/api/milestones/${id}`;
    case "task":
      return `/api/tasks/${id}`;
    case "todo":
      return `/api/todos/${id}`;
    case "timeEntry":
      return `/api/time-entries/${id}`;
    case "procurement":
      return `/api/procurement/${id}`;
    case "procurementLine":
      return `/api/procurement-lines/${id}`;
    default:
      return "";
  }
}

type SupplierRow = { id: string; name: string };

type Procurement = {
  id: string;
  title: string;
  status: string;
  supplierId: string | null;
  version: number;
};

type ProcurementLine = {
  id: string;
  procurementId: string;
  description: string;
  quantity: string;
  receivedQty: number;
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
  const { data: meRes } = useMe();
  const me = meRes?.user ?? null;
  const [tab, setTab] = useState<CrudTab>("milestones");
  const [deleteTarget, setDeleteTarget] = useState<{
    kind: ProjectDeleteKind;
    id: string;
    label: string;
  } | null>(null);
  const [newMilestoneName, setNewMilestoneName] = useState("");
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [newTaskMilestoneId, setNewTaskMilestoneId] = useState(milestones[0]?.id ?? "");
  const [newTodoTitle, setNewTodoTitle] = useState("");
  const [newTodoTaskId, setNewTodoTaskId] = useState(tasks[0]?.id ?? "");
  const [newMinutes, setNewMinutes] = useState("");
  const [newTimeTaskId, setNewTimeTaskId] = useState(tasks[0]?.id ?? "");
  const [newTimeNote, setNewTimeNote] = useState("");
  const [newProcTitle, setNewProcTitle] = useState("");
  const [newProcSupplierId, setNewProcSupplierId] = useState("");
  const [newLineProcId, setNewLineProcId] = useState("");
  const [newLineDescription, setNewLineDescription] = useState("");
  const [newLineQty, setNewLineQty] = useState("1");
  const [procMergeSelected, setProcMergeSelected] = useState<Set<string>>(() => new Set());
  const [procMergeBusy, setProcMergeBusy] = useState(false);

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

  const { data: suppliersData } = useQuery({
    queryKey: ["suppliers"],
    queryFn: () => api<{ suppliers: SupplierRow[] }>("/api/suppliers"),
  });
  const suppliers = suppliersData?.suppliers ?? [];

  async function refreshAll() {
    onRefresh();
    await qc.invalidateQueries({ queryKey: ["crud-time-entries", projectId] });
    await qc.invalidateQueries({ queryKey: ["crud-procurement", projectId] });
  }

  function showTimeEntryDelete(entry: TimeEntry): boolean {
    if (!me) {
      return false;
    }
    return me.globalRole === "org_admin" || entry.userId === me.id;
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
                  <td className="p-2">
                    <button
                      type="button"
                      className="rounded border border-red-200 bg-red-50 px-2 py-1 text-xs font-medium text-red-800 hover:bg-red-100"
                      onClick={() =>
                        setDeleteTarget({ kind: "milestone", id: m.id, label: m.name })
                      }
                    >
                      Delete
                    </button>
                  </td>
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
                  <td className="p-2">
                    <span className="mr-2 text-xs text-slate-400">#{idx + 1}</span>
                    <button
                      type="button"
                      className="rounded border border-red-200 bg-red-50 px-2 py-1 text-xs font-medium text-red-800 hover:bg-red-100"
                      onClick={() =>
                        setDeleteTarget({ kind: "task", id: t.id, label: t.title })
                      }
                    >
                      Delete
                    </button>
                  </td>
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
                  <td className="p-2">
                    <button
                      type="button"
                      className="rounded border border-red-200 bg-red-50 px-2 py-1 text-xs font-medium text-red-800 hover:bg-red-100"
                      onClick={() =>
                        setDeleteTarget({ kind: "todo", id: td.id, label: td.title })
                      }
                    >
                      Delete
                    </button>
                  </td>
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
                  <td className="p-2">
                    {showTimeEntryDelete(entry) ? (
                      <button
                        type="button"
                        className="rounded border border-red-200 bg-red-50 px-2 py-1 text-xs font-medium text-red-800 hover:bg-red-100"
                        onClick={() =>
                          setDeleteTarget({
                            kind: "timeEntry",
                            id: entry.id,
                            label: entry.note?.trim() || "Time entry",
                          })
                        }
                      >
                        Delete
                      </button>
                    ) : (
                      <span className="text-xs text-slate-400">—</span>
                    )}
                  </td>
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
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <button
              type="button"
              disabled={procMergeSelected.size < 2 || procMergeBusy}
              className="rounded border border-slate-800 bg-slate-900 px-2.5 py-1 text-xs font-medium text-white hover:bg-slate-800 disabled:opacity-40"
              onClick={() => {
                const list = procurementData?.procurement ?? [];
                const ids = list.map((x) => x.id).filter((id) => procMergeSelected.has(id));
                if (ids.length < 2) {
                  return;
                }
                const keepTitle = list.find((x) => x.id === ids[0])?.title ?? ids[0]!;
                if (
                  !window.confirm(
                    `Merge ${ids.length} procurements?\n\nThe first in this list (“${keepTitle}”) keeps its title and settings. Others are removed; line items move over.`,
                  )
                ) {
                  return;
                }
                setProcMergeBusy(true);
                void api("/api/procurement/merge", {
                  method: "POST",
                  body: JSON.stringify({ ids }),
                })
                  .then(async () => {
                    setProcMergeSelected(new Set());
                    await refreshAll();
                    await qc.invalidateQueries({ queryKey: ["rfq", projectId] });
                  })
                  .catch((e: Error) => {
                    window.alert(e.message);
                  })
                  .finally(() => setProcMergeBusy(false));
              }}
            >
              {procMergeBusy ? "Merging…" : "Merge selected"}
            </button>
            {procMergeSelected.size > 0 ? (
              <button
                type="button"
                className="text-xs text-slate-600 underline decoration-slate-300 hover:text-slate-900"
                onClick={() => setProcMergeSelected(new Set())}
              >
                Clear selection
              </button>
            ) : null}
            <span className="text-xs text-slate-500">
              List order (as loaded) decides which RFQ is kept — put that one first using refresh/sort in workspace if needed.
            </span>
          </div>
          <div className="overflow-x-auto border rounded bg-white">
          <table className="w-full text-sm">
            <thead className="bg-slate-100 text-left">
              <tr>
                <th className="w-10 p-2 text-xs font-medium text-slate-600">Merge</th>
                <th className="p-2">Title</th>
                <th className="p-2">Supplier</th>
                <th className="p-2">Status</th>
                <th className="p-2">Action</th>
              </tr>
            </thead>
            <tbody>
              {(procurementData?.procurement ?? []).map((p) => (
                <tr key={p.id} className="border-t">
                  <td className="p-2 align-middle">
                    <input
                      type="checkbox"
                      title="Select for merge"
                      checked={procMergeSelected.has(p.id)}
                      onChange={(e) => {
                        setProcMergeSelected((prev) => {
                          const n = new Set(prev);
                          if (e.target.checked) {
                            n.add(p.id);
                          } else {
                            n.delete(p.id);
                          }
                          return n;
                        });
                      }}
                    />
                  </td>
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
                      className="border rounded px-2 py-1 w-full min-w-[8rem] max-w-[14rem]"
                      value={p.supplierId ?? ""}
                      onChange={(e) => {
                        void api("/api/procurement/" + p.id, {
                          method: "PATCH",
                          body: JSON.stringify({
                            supplierId: e.target.value || null,
                            version: p.version,
                          }),
                        }).then(() => void refreshAll());
                      }}
                    >
                      <option value="">(none)</option>
                      {suppliers.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                    </select>
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
                      <option value="partially_received">partially_received</option>
                      <option value="closed">closed</option>
                      <option value="cancelled">cancelled</option>
                    </select>
                  </td>
                  <td className="p-2">
                    <button
                      type="button"
                      className="rounded border border-red-200 bg-red-50 px-2 py-1 text-xs font-medium text-red-800 hover:bg-red-100"
                      onClick={() =>
                        setDeleteTarget({ kind: "procurement", id: p.id, label: p.title })
                      }
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
              <tr className="border-t bg-slate-50">
                <td className="p-2 text-xs text-slate-400">—</td>
                <td className="p-2">
                  <input
                    className="w-full border rounded px-2 py-1"
                    placeholder="New procurement title"
                    value={newProcTitle}
                    onChange={(e) => setNewProcTitle(e.target.value)}
                  />
                </td>
                <td className="p-2">
                  <select
                    className="w-full border rounded px-2 py-1 min-w-[8rem] max-w-[14rem]"
                    value={newProcSupplierId}
                    onChange={(e) => setNewProcSupplierId(e.target.value)}
                  >
                    <option value="">(none)</option>
                    {suppliers.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
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
                          supplierId: newProcSupplierId || null,
                        }),
                      }).then(async () => {
                        setNewProcTitle("");
                        setNewProcSupplierId("");
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
                <th className="p-2">Rcvd qty</th>
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
                  <td className="p-2 align-middle">
                    <input
                      type="number"
                      min={0}
                      step={1}
                      title="Received qty"
                      className="w-20 rounded border px-2 py-1"
                      defaultValue={line.receivedQty}
                      key={`${line.id}-${line.version}`}
                      onBlur={(e) => {
                        const n = Math.max(0, Math.trunc(Number(e.target.value) || 0));
                        if (n === line.receivedQty) return;
                        void api("/api/procurement-lines/" + line.id, {
                          method: "PATCH",
                          body: JSON.stringify({
                            receivedQty: n,
                            version: line.version,
                          }),
                        }).then(() => void refreshAll());
                      }}
                    />
                  </td>
                  <td className="p-2">
                    <button
                      type="button"
                      className="rounded border border-red-200 bg-red-50 px-2 py-1 text-xs font-medium text-red-800 hover:bg-red-100"
                      onClick={() =>
                        setDeleteTarget({
                          kind: "procurementLine",
                          id: line.id,
                          label:
                            line.description.length > 48
                              ? line.description.slice(0, 48) + "…"
                              : line.description,
                        })
                      }
                    >
                      Delete
                    </button>
                  </td>
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
                <td className="p-2 text-xs text-slate-400">—</td>
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

      {deleteTarget && projectDeletePreviewPath(deleteTarget.kind, deleteTarget.id) ? (
        <DeleteConfirmModal
          open
          recordTitle={deleteTarget.label}
          previewPath={projectDeletePreviewPath(deleteTarget.kind, deleteTarget.id)}
          deletePath={projectDeleteExecutePath(deleteTarget.kind, deleteTarget.id)}
          onClose={() => setDeleteTarget(null)}
          onDeleted={async () => {
            await refreshAll();
            await qc.invalidateQueries({ queryKey: ["rfq", projectId] });
            await qc.invalidateQueries({ queryKey: ["proc-all"] });
          }}
        />
      ) : null}
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
