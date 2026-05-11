import { useMemo, useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import { api } from "../../lib/api";
import { useMe } from "../../hooks/useMe";
import { WorkspaceDetailChrome } from "./WorkspaceDetailChrome";

type Client = { id: string; name: string; code: string | null; version: number };
type Project = { id: string; name: string; clientId: string; status: string; version: number };

export function WorkspaceClientDetailPage() {
  const { clientId } = useParams<{ clientId: string }>();
  const qc = useQueryClient();
  const { data: meRes } = useMe();
  const me = meRes?.user;
  const { data: clientsData } = useQuery({
    queryKey: ["clients"],
    queryFn: () => api<{ clients: Client[] }>("/api/clients"),
  });
  const { data: projectsData } = useQuery({
    queryKey: ["projects"],
    queryFn: () => api<{ projects: Project[] }>("/api/projects"),
  });

  const client = clientsData?.clients.find((c) => c.id === clientId);
  const projects = useMemo(() => (projectsData?.projects ?? []).filter((p) => p.clientId === clientId), [projectsData?.projects, clientId]);

  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [newProjectName, setNewProjectName] = useState("");
  const [newProjectCode, setNewProjectCode] = useState("");
  const [childBusy, setChildBusy] = useState(false);

  useEffect(() => {
    if (!client) return;
    setName(client.name);
    setCode(client.code ?? "");
  }, [client]);

  async function refresh() {
    await qc.invalidateQueries({ queryKey: ["clients"] });
  }
  async function refreshProjects() {
    await qc.invalidateQueries({ queryKey: ["projects"] });
  }

  if (!clientId) return null;
  if (!clientsData) return <p className="text-slate-500">Loading…</p>;
  if (!client) {
    return (
      <WorkspaceDetailChrome backTo="/workspace/customers" backLabel="← Customers" title="Not found">
        <p className="text-slate-600">Customer not found.</p>
      </WorkspaceDetailChrome>
    );
  }

  return (
    <WorkspaceDetailChrome backTo="/workspace/customers" backLabel="← Customers" title={client.name}>
      {err && <p className="text-sm text-red-600">{err}</p>}
      <div className="mb-6 grid max-w-xl gap-3 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <div>
          <label className="block text-sm font-medium">Name</label>
          <input className="mt-1 w-full rounded border px-2 py-1.5" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div>
          <label className="block text-sm font-medium">Code</label>
          <input className="mt-1 w-full rounded border px-2 py-1.5" value={code} onChange={(e) => setCode(e.target.value)} />
        </div>
        <button
          type="button"
          disabled={saving || !name.trim()}
          className="w-fit rounded border bg-slate-900 px-3 py-1.5 text-sm text-white disabled:opacity-50"
          onClick={() => {
            setErr(null);
            setSaving(true);
            void api("/api/clients/" + client.id, {
              method: "PATCH",
              body: JSON.stringify({ name: name.trim(), code: code.trim() || null, version: client.version }),
            })
              .then(refresh)
              .catch((e: Error) => setErr(e.message))
              .finally(() => setSaving(false));
          }}
        >
          Save customer
        </button>
      </div>

      <h2 className="mb-2 text-lg font-semibold text-slate-800">Projects</h2>
      {projects.length === 0 ? (
        <p className="mb-2 text-sm text-slate-500">No projects for this customer yet — add one below.</p>
      ) : (
        <ul className="mb-3 divide-y divide-slate-200 rounded-lg border border-slate-200 bg-white">
          {projects.map((p) => (
            <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 hover:bg-slate-50">
              <span className="font-medium text-slate-900">{p.name}</span>
              <Link to={`/workspace/projects/${p.id}`} className="text-sm font-medium text-blue-700 underline">
                Open
              </Link>
            </li>
          ))}
        </ul>
      )}
      <div className="max-w-xl rounded-lg border border-dashed border-slate-300 bg-slate-50/80 p-3">
        <p className="mb-2 text-sm font-medium text-slate-700">Add project</p>
        <div className="grid gap-2 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className="block text-xs font-medium text-slate-600">Name</label>
            <input
              className="mt-1 w-full rounded border border-slate-300 bg-white px-2 py-1.5 text-sm"
              value={newProjectName}
              onChange={(e) => setNewProjectName(e.target.value)}
              placeholder="Project name"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600">Code (optional)</label>
            <input
              className="mt-1 w-full rounded border border-slate-300 bg-white px-2 py-1.5 text-sm"
              value={newProjectCode}
              onChange={(e) => setNewProjectCode(e.target.value)}
              placeholder="Code"
            />
          </div>
          <div className="flex items-end">
            <button
              type="button"
              disabled={childBusy || !newProjectName.trim() || !me}
              className="rounded border bg-slate-900 px-3 py-1.5 text-sm text-white disabled:opacity-50"
              onClick={() => {
                if (!me) return;
                setErr(null);
                setChildBusy(true);
                void api("/api/projects", {
                  method: "POST",
                  body: JSON.stringify({
                    organizationId: me.organizationId,
                    clientId: client.id,
                    name: newProjectName.trim(),
                    code: newProjectCode.trim() || undefined,
                    status: "active",
                  }),
                })
                  .then(async () => {
                    setNewProjectName("");
                    setNewProjectCode("");
                    await refreshProjects();
                  })
                  .catch((e: Error) => setErr(e.message))
                  .finally(() => setChildBusy(false));
              }}
            >
              {childBusy ? "…" : "Add project"}
            </button>
          </div>
        </div>
      </div>
    </WorkspaceDetailChrome>
  );
}
