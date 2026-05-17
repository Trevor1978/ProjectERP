import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams } from "react-router-dom";
import { api } from "../../lib/api";
import { openMachineServiceReport } from "../../lib/machineServiceReport";
import { isoToLocal, localToIso } from "../../workspace/workspaceDates";
import { WorkspaceDetailChrome } from "./WorkspaceDetailChrome";

type Asset = {
  id: string;
  name: string;
  site: string;
  line: string;
  serial: string | null;
  version: number;
};

type ServiceLog = {
  id: string;
  assetId: string;
  title: string;
  description: string | null;
  performedAt: string;
  technicianName: string | null;
  version: number;
};

export function WorkspaceMachineDetailPage() {
  const { assetId } = useParams<{ assetId: string }>();
  const qc = useQueryClient();

  const { data: assetData } = useQuery({
    queryKey: ["asset", assetId],
    queryFn: () => api<{ asset: Asset }>(`/api/assets/${assetId}`),
    enabled: Boolean(assetId),
  });

  const { data: logsData } = useQuery({
    queryKey: ["asset-service-logs", assetId],
    queryFn: () => api<{ logs: ServiceLog[] }>(`/api/assets/${assetId}/service-logs`),
    enabled: Boolean(assetId),
  });

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [performedAt, setPerformedAt] = useState("");
  const [technicianName, setTechnicianName] = useState("");
  const [adding, setAdding] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const asset = assetData?.asset;
  const logs = logsData?.logs ?? [];

  async function refresh() {
    await qc.invalidateQueries({ queryKey: ["asset-service-logs", assetId] });
  }

  if (!assetId) return null;
  if (!assetData) return <p className="text-tesla-text-secondary">Loading…</p>;
  if (!asset) {
    return (
      <WorkspaceDetailChrome backTo="/workspace/machines" backLabel="← Machines" title="Not found">
        <p>Machine not found.</p>
      </WorkspaceDetailChrome>
    );
  }

  return (
    <WorkspaceDetailChrome backTo="/workspace/machines" backLabel="← Machines" title={asset.name}>
      <p className="mb-4 text-sm text-tesla-text-secondary">
        {asset.site} · Line {asset.line}
        {asset.serial ? ` · S/N ${asset.serial}` : ""}
      </p>

      <div className="mb-4 flex flex-wrap gap-2">
        <button
          type="button"
          className="rounded-sm border border-tesla-border bg-white px-3 py-1.5 text-sm hover:bg-tesla-muted"
          onClick={() => openMachineServiceReport(asset, logs)}
        >
          Service report (PDF)
        </button>
      </div>

      <h3 className="mb-2 text-sm font-semibold text-tesla-text">Service history</h3>
      <div className="mb-6 overflow-hidden rounded-sm border border-tesla-border">
        <table className="w-full text-sm">
          <thead className="bg-tesla-muted text-left">
            <tr>
              <th className="px-2 py-2 font-medium">Date</th>
              <th className="px-2 py-2 font-medium">Title</th>
              <th className="px-2 py-2 font-medium">Work performed</th>
              <th className="px-2 py-2 font-medium">Technician</th>
            </tr>
          </thead>
          <tbody>
            {logs.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-2 py-3 text-tesla-text-secondary">
                  No service entries yet.
                </td>
              </tr>
            ) : (
              logs.map((l) => (
                <tr key={l.id} className="border-t border-tesla-border align-top">
                  <td className="px-2 py-2 whitespace-nowrap">{new Date(l.performedAt).toLocaleString()}</td>
                  <td className="px-2 py-2 font-medium">{l.title}</td>
                  <td className="px-2 py-2 text-tesla-text-secondary">{l.description ?? "—"}</td>
                  <td className="px-2 py-2">{l.technicianName ?? "—"}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="max-w-xl rounded-sm border border-dashed border-tesla-border bg-tesla-muted/30 p-3">
        <p className="mb-2 text-sm font-medium text-tesla-text">Log service work</p>
        {err && <p className="mb-2 text-sm text-red-600">{err}</p>}
        <div className="grid gap-2">
          <div>
            <label className="block text-xs font-medium text-tesla-text-secondary">Title</label>
            <input className="mt-1 w-full rounded-sm border border-tesla-border px-2 py-1" value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div>
            <label className="block text-xs font-medium text-tesla-text-secondary">Work performed</label>
            <textarea
              className="mt-1 w-full rounded-sm border border-tesla-border px-2 py-1"
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-medium text-tesla-text-secondary">Performed at</label>
              <input
                type="datetime-local"
                className="mt-1 w-full rounded-sm border border-tesla-border px-2 py-1"
                value={performedAt}
                onChange={(e) => setPerformedAt(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-tesla-text-secondary">Technician</label>
              <input
                className="mt-1 w-full rounded-sm border border-tesla-border px-2 py-1"
                value={technicianName}
                onChange={(e) => setTechnicianName(e.target.value)}
              />
            </div>
          </div>
        </div>
        <button
          type="button"
          disabled={adding || !title.trim()}
          className="mt-3 rounded-sm bg-tesla-text px-3 py-1.5 text-sm text-white disabled:opacity-50"
          onClick={() => {
            setErr(null);
            setAdding(true);
            void api("/api/asset-service-logs", {
              method: "POST",
              body: JSON.stringify({
                assetId: asset.id,
                title: title.trim(),
                description: description.trim() || null,
                performedAt: localToIso(performedAt) ?? undefined,
                technicianName: technicianName.trim() || null,
              }),
            })
              .then(async () => {
                setTitle("");
                setDescription("");
                setPerformedAt("");
                setTechnicianName("");
                await refresh();
              })
              .catch((e: Error) => setErr(e.message))
              .finally(() => setAdding(false));
          }}
        >
          Add service entry
        </button>
      </div>
    </WorkspaceDetailChrome>
  );
}
