import { useMemo, useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import { api } from "../../lib/api";
import { ProjectItemsPanel } from "../../components/ProjectItemsPanel";
import { CrudWorkspace } from "../../components/CrudWorkspace";
import { WorkspaceDetailChrome } from "./WorkspaceDetailChrome";
import { QuickCreateSelect } from "../../components/QuickCreateSelect";
import { isoToLocal, localToIso } from "../../workspace/workspaceDates";

type Project = {
  id: string;
  name: string;
  code: string | null;
  clientId: string;
  status: "draft" | "active" | "on_hold" | "closed";
  startAt: string | null;
  endAt: string | null;
  version: number;
};
type Milestone = {
  id: string;
  projectId: string;
  name: string;
  startAt: string | null;
  endAt: string | null;
  orderIndex: number;
  version: number;
};

const STATUS_OPTS = ["draft", "active", "on_hold", "closed"] as const;

export function WorkspaceProjectDetailPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const qc = useQueryClient();
  const { data: projectsData } = useQuery({
    queryKey: ["projects"],
    queryFn: () => api<{ projects: Project[] }>("/api/projects"),
  });
  const { data: milestonesData } = useQuery({
    queryKey: ["milestones-all"],
    queryFn: () => api<{ milestones: Milestone[] }>("/api/milestones"),
  });

  const project = projectsData?.projects.find((p) => p.id === projectId);
  const milestones = useMemo(
    () => (milestonesData?.milestones ?? []).filter((m) => m.projectId === projectId).sort((a, b) => a.orderIndex - b.orderIndex),
    [milestonesData?.milestones, projectId],
  );

  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [clientId, setClientId] = useState("");
  const [status, setStatus] = useState<Project["status"]>("draft");
  const [startAt, setStartAt] = useState("");
  const [endAt, setEndAt] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [newMilestoneName, setNewMilestoneName] = useState("");
  const [childBusy, setChildBusy] = useState(false);

  const nextMilestoneOrder = useMemo(
    () => (milestones.length ? Math.max(...milestones.map((m) => m.orderIndex)) + 1 : 0),
    [milestones],
  );

  useEffect(() => {
    if (!project) return;
    setName(project.name);
    setCode(project.code ?? "");
    setClientId(project.clientId);
    setStatus(project.status);
    setStartAt(isoToLocal(project.startAt));
    setEndAt(isoToLocal(project.endAt));
  }, [project]);

  async function refresh() {
    await qc.invalidateQueries({ queryKey: ["projects"] });
    await qc.invalidateQueries({ queryKey: ["milestones-all"] });
  }

  if (!projectId) {
    return null;
  }
  if (!projectsData) {
    return <p className="text-slate-500">Loading…</p>;
  }
  if (!project) {
    return (
      <WorkspaceDetailChrome backTo="/workspace/projects" backLabel="← Projects" title="Not found">
        <p className="text-slate-600">Project not found.</p>
      </WorkspaceDetailChrome>
    );
  }

  return (
    <WorkspaceDetailChrome backTo="/workspace/projects" backLabel="← Projects" title={project.name}>
      <p className="text-sm text-slate-600">
        <Link to={`/p/${project.id}`} className="font-medium text-blue-700 underline hover:text-blue-900">
          Open schedule & Gantt
        </Link>
        <span className="text-slate-400"> · </span>
        <Link to={`/workspace/milestones?projectId=${encodeURIComponent(project.id)}`} className="text-blue-700 underline hover:text-blue-900">
          Milestones table (filtered)
        </Link>
      </p>

      {err && <p className="text-sm text-red-600">{err}</p>}
      <div className="mb-6 grid max-w-2xl gap-3 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <div>
          <label className="block text-sm font-medium text-slate-700">Name</label>
          <input className="mt-1 w-full rounded border px-2 py-1.5" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700">Code</label>
          <input className="mt-1 w-full rounded border px-2 py-1.5" value={code} onChange={(e) => setCode(e.target.value)} />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700">Customer</label>
          <QuickCreateSelect
            entity="client"
            value={clientId}
            onChange={setClientId}
            className="mt-1 w-full rounded border px-2 py-1.5"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700">Status</label>
          <select className="mt-1 w-full rounded border px-2 py-1.5" value={status} onChange={(e) => setStatus(e.target.value as Project["status"])}>
            {STATUS_OPTS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="block text-sm font-medium text-slate-700">Start</label>
            <input type="datetime-local" className="mt-1 w-full rounded border px-2 py-1.5" value={startAt} onChange={(e) => setStartAt(e.target.value)} />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700">End</label>
            <input type="datetime-local" className="mt-1 w-full rounded border px-2 py-1.5" value={endAt} onChange={(e) => setEndAt(e.target.value)} />
          </div>
        </div>
        <button
          type="button"
          disabled={saving || !name.trim()}
          className="w-fit rounded border bg-slate-900 px-3 py-1.5 text-sm text-white disabled:opacity-50"
          onClick={() => {
            setErr(null);
            setSaving(true);
            void api("/api/projects/" + project.id, {
              method: "PATCH",
              body: JSON.stringify({
                name: name.trim(),
                code: code.trim() || null,
                clientId,
                status,
                startAt: localToIso(startAt),
                endAt: localToIso(endAt),
                version: project.version,
              }),
            })
              .then(refresh)
              .catch((e: Error) => setErr(e.message))
              .finally(() => setSaving(false));
          }}
        >
          Save project
        </button>
      </div>

      <h2 className="mb-2 text-lg font-semibold text-slate-800">Milestones</h2>
      {milestones.length === 0 ? (
        <p className="mb-2 text-sm text-slate-500">No milestones yet — add one below.</p>
      ) : (
        <ul className="mb-3 divide-y divide-slate-200 rounded-lg border border-slate-200 bg-white">
          {milestones.map((m) => (
            <li key={m.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 hover:bg-slate-50">
              <span className="font-medium text-slate-900">{m.name}</span>
              <Link to={`/workspace/milestones/${m.id}`} className="text-sm font-medium text-blue-700 underline">
                Open
              </Link>
            </li>
          ))}
        </ul>
      )}
      <div className="max-w-xl rounded-lg border border-dashed border-slate-300 bg-slate-50/80 p-3">
        <p className="mb-2 text-sm font-medium text-slate-700">Add milestone</p>
        <div className="flex flex-wrap items-end gap-2">
          <div className="min-w-[12rem] flex-1">
            <label className="block text-xs font-medium text-slate-600">Name</label>
            <input
              className="mt-1 w-full rounded border border-slate-300 bg-white px-2 py-1.5 text-sm"
              value={newMilestoneName}
              onChange={(e) => setNewMilestoneName(e.target.value)}
              placeholder="Milestone name"
            />
          </div>
          <button
            type="button"
            disabled={childBusy || !newMilestoneName.trim()}
            className="rounded border bg-slate-900 px-3 py-1.5 text-sm text-white disabled:opacity-50"
            onClick={() => {
              setErr(null);
              setChildBusy(true);
              void api("/api/milestones", {
                method: "POST",
                body: JSON.stringify({
                  projectId: project.id,
                  name: newMilestoneName.trim(),
                  orderIndex: nextMilestoneOrder,
                }),
              })
                .then(async () => {
                  setNewMilestoneName("");
                  await refresh();
                })
                .catch((e: Error) => setErr(e.message))
                .finally(() => setChildBusy(false));
            }}
          >
            {childBusy ? "…" : "Add milestone"}
          </button>
        </div>
      </div>

      <div className="mt-8 border-t border-slate-200 pt-6">
        <CrudWorkspace
          fixedTab="tasks"
          fixedProjectId={project.id}
          embedded
        />
      </div>

      <div className="mt-8 border-t border-slate-200 pt-6">
        <CrudWorkspace
          fixedTab="todos"
          fixedProjectId={project.id}
          embedded
        />
      </div>

      <div className="mt-8 border-t border-slate-200 pt-6">
        <CrudWorkspace
          fixedTab="procurementLines"
          fixedProjectId={project.id}
          embedded
        />
      </div>

      <ProjectItemsPanel projectId={project.id} />
    </WorkspaceDetailChrome>
  );
}
