import { useMemo, useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import { api } from "../../lib/api";
import { WorkspaceDetailChrome } from "./WorkspaceDetailChrome";
import { isoToLocal, localToIso } from "../../workspace/workspaceDates";

type Project = { id: string; name: string; version: number };
type Milestone = {
  id: string;
  projectId: string;
  name: string;
  startAt: string | null;
  endAt: string | null;
  orderIndex: number;
  version: number;
};
type Task = {
  id: string;
  projectId: string;
  milestoneId: string;
  title: string;
  orderIndex: number;
  version: number;
};

export function WorkspaceMilestoneDetailPage() {
  const { milestoneId } = useParams<{ milestoneId: string }>();
  const qc = useQueryClient();
  const { data: msData } = useQuery({
    queryKey: ["milestones-all"],
    queryFn: () => api<{ milestones: Milestone[] }>("/api/milestones"),
  });
  const { data: projectsData } = useQuery({
    queryKey: ["projects"],
    queryFn: () => api<{ projects: Project[] }>("/api/projects"),
  });
  const { data: tasksData } = useQuery({
    queryKey: ["tasks-all"],
    queryFn: () => api<{ tasks: Task[] }>("/api/tasks"),
  });

  const milestone = msData?.milestones.find((m) => m.id === milestoneId);
  const project = projectsData?.projects.find((p) => p.id === milestone?.projectId);
  const tasks = useMemo(
    () => (tasksData?.tasks ?? []).filter((t) => t.milestoneId === milestoneId).sort((a, b) => a.orderIndex - b.orderIndex),
    [tasksData?.tasks, milestoneId],
  );

  const [name, setName] = useState("");
  const [startAt, setStartAt] = useState("");
  const [endAt, setEndAt] = useState("");
  const [orderIndex, setOrderIndex] = useState("0");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [childBusy, setChildBusy] = useState(false);

  const nextTaskOrder = useMemo(
    () => (tasks.length ? Math.max(...tasks.map((t) => t.orderIndex)) + 1 : 0),
    [tasks],
  );

  useEffect(() => {
    if (!milestone) return;
    setName(milestone.name);
    setStartAt(isoToLocal(milestone.startAt));
    setEndAt(isoToLocal(milestone.endAt));
    setOrderIndex(String(milestone.orderIndex));
  }, [milestone]);

  async function refresh() {
    await qc.invalidateQueries({ queryKey: ["milestones-all"] });
    await qc.invalidateQueries({ queryKey: ["tasks-all"] });
  }

  if (!milestoneId) return null;
  if (!msData) return <p className="text-slate-500">Loading…</p>;
  if (!milestone) {
    return (
      <WorkspaceDetailChrome backTo="/workspace/milestones" backLabel="← Milestones" title="Not found">
        <p className="text-slate-600">Milestone not found.</p>
      </WorkspaceDetailChrome>
    );
  }

  const back = project ? `/workspace/projects/${project.id}` : "/workspace/milestones";

  return (
    <WorkspaceDetailChrome backTo={back} backLabel={project ? `← ${project.name}` : "← Milestones"} title={milestone.name}>
      <p className="text-sm text-slate-600">
        Project:{" "}
        {project ? (
          <Link to={`/workspace/projects/${project.id}`} className="text-blue-700 underline">
            {project.name}
          </Link>
        ) : (
          milestone.projectId
        )}
        <span className="text-slate-400"> · </span>
        <Link to={`/workspace/tasks?milestoneId=${encodeURIComponent(milestone.id)}`} className="text-blue-700 underline">
          Tasks table (filtered)
        </Link>
      </p>

      {err && <p className="text-sm text-red-600">{err}</p>}
      <div className="mb-6 grid max-w-xl gap-3 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <div>
          <label className="block text-sm font-medium">Name</label>
          <input className="mt-1 w-full rounded border px-2 py-1.5" value={name} onChange={(e) => setName(e.target.value)} />
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
          <input type="number" className="mt-1 w-full rounded border px-2 py-1.5" value={orderIndex} onChange={(e) => setOrderIndex(e.target.value)} />
        </div>
        <button
          type="button"
          disabled={saving || !name.trim()}
          className="w-fit rounded border bg-slate-900 px-3 py-1.5 text-sm text-white disabled:opacity-50"
          onClick={() => {
            setErr(null);
            setSaving(true);
            void api("/api/milestones/" + milestone.id, {
              method: "PATCH",
              body: JSON.stringify({
                name: name.trim(),
                startAt: localToIso(startAt),
                endAt: localToIso(endAt),
                orderIndex: Number(orderIndex) || 0,
                version: milestone.version,
              }),
            })
              .then(refresh)
              .catch((e: Error) => setErr(e.message))
              .finally(() => setSaving(false));
          }}
        >
          Save milestone
        </button>
      </div>

      <h2 className="mb-2 text-lg font-semibold text-slate-800">Tasks</h2>
      {tasks.length === 0 ? (
        <p className="mb-2 text-sm text-slate-500">No tasks in this milestone yet — add one below.</p>
      ) : (
        <ul className="mb-3 divide-y divide-slate-200 rounded-lg border border-slate-200 bg-white">
          {tasks.map((t) => (
            <li key={t.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 hover:bg-slate-50">
              <span className="text-slate-900">{t.title}</span>
              <Link to={`/workspace/tasks/${t.id}`} className="text-sm font-medium text-blue-700 underline">
                Open
              </Link>
            </li>
          ))}
        </ul>
      )}
      <div className="max-w-xl rounded-lg border border-dashed border-slate-300 bg-slate-50/80 p-3">
        <p className="mb-2 text-sm font-medium text-slate-700">Add task</p>
        <div className="flex flex-wrap items-end gap-2">
          <div className="min-w-[12rem] flex-1">
            <label className="block text-xs font-medium text-slate-600">Title</label>
            <input
              className="mt-1 w-full rounded border border-slate-300 bg-white px-2 py-1.5 text-sm"
              value={newTaskTitle}
              onChange={(e) => setNewTaskTitle(e.target.value)}
              placeholder="Task title"
            />
          </div>
          <button
            type="button"
            disabled={childBusy || !newTaskTitle.trim()}
            className="rounded border bg-slate-900 px-3 py-1.5 text-sm text-white disabled:opacity-50"
            onClick={() => {
              setErr(null);
              setChildBusy(true);
              void api("/api/tasks", {
                method: "POST",
                body: JSON.stringify({
                  projectId: milestone.projectId,
                  milestoneId: milestone.id,
                  title: newTaskTitle.trim(),
                  percentComplete: 0,
                  useDerivedPercent: true,
                  orderIndex: nextTaskOrder,
                }),
              })
                .then(async () => {
                  setNewTaskTitle("");
                  await refresh();
                })
                .catch((e: Error) => setErr(e.message))
                .finally(() => setChildBusy(false));
            }}
          >
            {childBusy ? "…" : "Add task"}
          </button>
        </div>
      </div>
    </WorkspaceDetailChrome>
  );
}
