import { useState, useEffect } from "react";
import { api } from "../lib/api";
import type { Project } from "../types";

const STATUS_OPTIONS = [
  { value: "draft", label: "Draft" },
  { value: "active", label: "Active" },
  { value: "on_hold", label: "On hold" },
  { value: "closed", label: "Closed" },
] as const;

function isoToDateInput(iso: string | null): string {
  if (!iso) {
    return "";
  }
  return iso.slice(0, 10);
}

export function ProjectMetaPanel({
  project,
  canEdit,
  onUpdated,
}: {
  project: Project;
  canEdit: boolean;
  onUpdated: () => void;
}) {
  const [name, setName] = useState(project.name);
  const [status, setStatus] = useState(project.status);
  const [start, setStart] = useState(isoToDateInput(project.startAt));
  const [end, setEnd] = useState(isoToDateInput(project.endAt));
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    setName(project.name);
    setStatus(project.status);
    setStart(isoToDateInput(project.startAt));
    setEnd(isoToDateInput(project.endAt));
  }, [project.id, project.version, project.name, project.status, project.startAt, project.endAt]);

  async function save() {
    setErr("");
    setSaving(true);
    try {
      await api("/api/projects/" + project.id, {
        method: "PATCH",
        body: JSON.stringify({
          name: name.trim(),
          status,
          startAt: start ? new Date(start + "T12:00:00.000Z").toISOString() : null,
          endAt: end ? new Date(end + "T12:00:00.000Z").toISOString() : null,
          version: project.version,
        }),
      });
      onUpdated();
    } catch (e) {
      setErr(String(e));
    } finally {
      setSaving(false);
    }
  }

  if (!canEdit) {
    return (
      <div className="rounded-lg border border-slate-200 bg-slate-50/80 px-3 py-2 text-sm text-slate-700">
        <span className="font-medium text-slate-800">{project.name}</span>
        <span className="text-slate-500"> · {project.status.replace("_", " ")}</span>
        {project.startAt && (
          <span className="text-slate-500">
            {" "}
            · start {isoToDateInput(project.startAt)}
          </span>
        )}
        {project.endAt && (
          <span className="text-slate-500"> · end {isoToDateInput(project.endAt)}</span>
        )}
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3 space-y-3 max-w-2xl">
      <div className="text-xs font-medium text-slate-500 uppercase tracking-wide">
        Project details
      </div>
      <div className="flex flex-wrap gap-3 items-end">
        <div>
          <label className="text-xs text-slate-500 block">Name</label>
          <input
            className="border rounded px-2 py-1 w-56 text-sm"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <div>
          <label className="text-xs text-slate-500 block">Status</label>
          <select
            className="border rounded px-2 py-1 text-sm"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
          >
            {STATUS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-xs text-slate-500 block">Start</label>
          <input
            type="date"
            className="border rounded px-2 py-1 text-sm"
            value={start}
            onChange={(e) => setStart(e.target.value)}
          />
        </div>
        <div>
          <label className="text-xs text-slate-500 block">End</label>
          <input
            type="date"
            className="border rounded px-2 py-1 text-sm"
            value={end}
            onChange={(e) => setEnd(e.target.value)}
          />
        </div>
        <button
          type="button"
          disabled={saving || !name.trim()}
          className="px-3 py-1.5 text-sm bg-slate-800 text-white rounded disabled:opacity-50"
          onClick={() => void save()}
        >
          {saving ? "Saving…" : "Save project"}
        </button>
      </div>
      {err && (
        <p className="text-sm text-red-600" role="alert">
          {err}
        </p>
      )}
    </div>
  );
}
