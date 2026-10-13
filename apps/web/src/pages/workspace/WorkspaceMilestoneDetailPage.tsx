import { useMemo, useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import { api } from "../../lib/api";
import { WorkspaceDetailChrome } from "./WorkspaceDetailChrome";
import { EntitySelect } from "../../components/QuickCreateSelect";
import { DoneCheckbox } from "../../components/DoneCheckbox";
import { isoToLocal, localToIso } from "../../workspace/workspaceDates";

type Project = { id: string; name: string; version: number };
type Milestone = {
  id: string;
  projectId: string;
  name: string;
  startAt: string | null;
  endAt: string | null;
  orderIndex: number;
  completed: boolean;
  version: number;
};
type Task = {
  id: string;
  projectId: string;
  milestoneId: string;
  title: string;
  orderIndex: number;
  completed: boolean;
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
  const [showCompleted, setShowCompleted] = useState(false);
  const tasks = useMemo(
    () => (tasksData?.tasks ?? []).filter((t) => t.milestoneId === milestoneId).sort((a, b) => a.orderIndex - b.orderIndex),
    [tasksData?.tasks, milestoneId],
  );
  const visibleTasks = useMemo(
    () => (showCompleted ? tasks : tasks.filter((t) => !t.completed)),
    [tasks, showCompleted],
  );

  const [name, setName] = useState("");
  const [startAt, setStartAt] = useState("");
  const [endAt, setEndAt] = useState("");
  const [orderIndex, setOrderIndex] = useState("0");
  const [projectId, setProjectId] = useState("");
  const [completed, setCompleted] = useState(false);
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
    setProjectId(milestone.projectId);
    setCompleted(milestone.completed);
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
          <label className="block text-sm font-medium">Project</label>
          <EntitySelect entity="project" value={projectId} onSave={setProjectId} className="mt-1 w-full rounded border px-2 py-1.5" />
          <p className="mt-1 text-xs text-slate-500">Moving this milestone also moves its tasks.</p>
        </div>
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
        <DoneCheckbox checked={completed} label="Done — hide from the milestones list" onChange={setCompleted} />
        <button
          type="button"
          disabled={saving || !name.trim() || !projectId}
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
                projectId,
                orderIndex: Number(orderIndex) || 0,
                completed,
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

      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold text-slate-800">Tasks</h2>
        <label className="flex cursor-pointer items-center gap-1.5 text-sm text-slate-600">
          <input
            type="checkbox"
            checked={showCompleted}
            onChange={(e) => setShowCompleted(e.target.checked)}
            className="rounded border-slate-300"
          />
          Show completed
        </label>
      </div>
      {tasks.length === 0 ? (
        <p className="mb-2 text-sm text-slate-500">No tasks in this milestone yet — add one below.</p>
      ) : visibleTasks.length === 0 ? (
        <p className="mb-2 text-sm text-slate-500">All tasks are done. Turn on Show completed to see them.</p>
      ) : (
        <ul className="mb-3 divide-y divide-slate-200 rounded-lg border border-slate-200 bg-white">
          {visibleTasks.map((t) => (
            <li key={t.id} className="flex flex-wrap items-center gap-3 px-3 py-2 hover:bg-slate-50">
              <span className="min-w-[8rem] flex-1 text-slate-900">{t.title}</span>
              <DoneCheckbox
                checked={t.completed}
                onChange={(done) => {
                  setErr(null);
                  void api("/api/tasks/" + t.id, {
                    method: "PATCH",
                    body: JSON.stringify({ completed: done, version: t.version }),
                  })
                    .then(refresh)
                    .catch((e: Error) => setErr(e.message));
                }}
              />
              <div className="min-w-[14rem] flex-1">
                <EntitySelect
                  entity="milestone"
                  value={t.milestoneId}
                  defaults={{ projectId: t.projectId }}
                  onSave={(v) =>
                    api("/api/tasks/" + t.id, {
                      method: "PATCH",
                      body: JSON.stringify({ milestoneId: v, version: t.version }),
                    }).then(refresh)
                  }
                />
              </div>
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
