import { useMemo, useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import { api } from "../../lib/api";
import { WorkspaceDetailChrome } from "./WorkspaceDetailChrome";

type Client = { id: string; name: string; code: string | null; version: number };
type Project = { id: string; name: string; clientId: string; status: string; version: number };

export function WorkspaceClientDetailPage() {
  const { clientId } = useParams<{ clientId: string }>();
  const qc = useQueryClient();
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

  useEffect(() => {
    if (!client) return;
    setName(client.name);
    setCode(client.code ?? "");
  }, [client]);

  async function refresh() {
    await qc.invalidateQueries({ queryKey: ["clients"] });
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
        <p className="text-sm text-slate-500">No projects for this customer yet.</p>
      ) : (
        <ul className="divide-y divide-slate-200 rounded-lg border border-slate-200 bg-white">
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
    </WorkspaceDetailChrome>
  );
}
