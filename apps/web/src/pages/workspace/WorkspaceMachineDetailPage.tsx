import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api } from "../../lib/api";
import { openMachineServiceReport } from "../../lib/machineServiceReport";
import { downloadServiceReport } from "../../lib/serviceReportDownload";
import { isoToLocal, localToIso } from "../../workspace/workspaceDates";
import { WorkspaceDetailChrome } from "./WorkspaceDetailChrome";
import { useMe } from "../../hooks/useMe";
import { DeleteConfirmModal } from "../../components/DeleteConfirmModal";

type Asset = {
  id: string;
  name: string;
  site: string;
  line: string;
  serial: string | null;
  clientId: string | null;
  version: number;
};

type ServiceLog = {
  id: string;
  assetId: string;
  title: string;
  description: string | null;
  performedAt: string;
  technicianName: string | null;
  reportMarkdownStorage: string | null;
  reportPdfStorage: string | null;
  version: number;
};

type Client = { id: string; name: string };

export function WorkspaceMachineDetailPage() {
  const { assetId } = useParams<{ assetId: string }>();
  const nav = useNavigate();
  const qc = useQueryClient();
  const { data: meData } = useMe();
  const isAdmin = meData?.user?.globalRole === "org_admin";

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

  const { data: clientsData } = useQuery({
    queryKey: ["clients"],
    queryFn: () => api<{ clients: Client[] }>("/api/clients"),
  });

  const [name, setName] = useState("");
  const [site, setSite] = useState("");
  const [line, setLine] = useState("");
  const [serial, setSerial] = useState("");
  const [clientId, setClientId] = useState("");
  const [savingAsset, setSavingAsset] = useState(false);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [performedAt, setPerformedAt] = useState("");
  const [technicianName, setTechnicianName] = useState("");
  const [adding, setAdding] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [dlErr, setDlErr] = useState<string | null>(null);
  const [deleteAsset, setDeleteAsset] = useState(false);
  const [deleteLog, setDeleteLog] = useState<{ id: string; label: string } | null>(
    null,
  );

  const asset = assetData?.asset;
  const logs = logsData?.logs ?? [];
  const clients = clientsData?.clients ?? [];

  useEffect(() => {
    if (!asset) return;
    setName(asset.name);
    setSite(asset.site);
    setLine(asset.line);
    setSerial(asset.serial ?? "");
    setClientId(asset.clientId ?? "");
  }, [asset]);

  async function refresh() {
    await qc.invalidateQueries({ queryKey: ["asset-service-logs", assetId] });
    await qc.invalidateQueries({ queryKey: ["asset-service-logs"] });
  }

  async function refreshAsset() {
    await qc.invalidateQueries({ queryKey: ["asset", assetId] });
    await qc.invalidateQueries({ queryKey: ["assets"] });
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

      {isAdmin && (
        <div className="mb-6 max-w-xl rounded-sm border border-tesla-border bg-white p-3">
          <p className="mb-2 text-sm font-medium text-tesla-text">Edit machine</p>
          <div className="grid gap-2 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-medium text-tesla-text-secondary">Name</label>
              <input
                className="mt-1 w-full rounded-sm border border-tesla-border px-2 py-1.5 text-sm"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-tesla-text-secondary">Site</label>
              <input
                className="mt-1 w-full rounded-sm border border-tesla-border px-2 py-1.5 text-sm"
                value={site}
                onChange={(e) => setSite(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-tesla-text-secondary">Line</label>
              <input
                className="mt-1 w-full rounded-sm border border-tesla-border px-2 py-1.5 text-sm"
                value={line}
                onChange={(e) => setLine(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-tesla-text-secondary">Serial</label>
              <input
                className="mt-1 w-full rounded-sm border border-tesla-border px-2 py-1.5 text-sm"
                value={serial}
                onChange={(e) => setSerial(e.target.value)}
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-tesla-text-secondary">
                Customer
              </label>
              <select
                className="mt-1 w-full rounded-sm border border-tesla-border bg-white px-2 py-1.5 text-sm"
                value={clientId}
                onChange={(e) => setClientId(e.target.value)}
              >
                <option value="">— Internal / unassigned —</option>
                {clients.map((cl) => (
                  <option key={cl.id} value={cl.id}>
                    {cl.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={savingAsset || !name.trim() || !site.trim() || !line.trim()}
              className="rounded-sm bg-tesla-text px-3 py-1.5 text-sm text-white disabled:opacity-50"
              onClick={() => {
                setErr(null);
                setSavingAsset(true);
                void api(`/api/assets/${asset.id}`, {
                  method: "PATCH",
                  body: JSON.stringify({
                    name: name.trim(),
                    site: site.trim(),
                    line: line.trim(),
                    serial: serial.trim() || null,
                    clientId: clientId || null,
                    version: asset.version,
                  }),
                })
                  .then(() => refreshAsset())
                  .catch((ex: Error) => setErr(ex.message))
                  .finally(() => setSavingAsset(false));
              }}
            >
              Save machine
            </button>
            <button
              type="button"
              className="rounded-sm border border-red-300 px-3 py-1.5 text-sm text-red-700"
              onClick={() => setDeleteAsset(true)}
            >
              Delete machine
            </button>
          </div>
        </div>
      )}

      <div className="mb-4 flex flex-wrap gap-2">
        <button
          type="button"
          className="rounded-sm border border-tesla-border bg-white px-3 py-1.5 text-sm hover:bg-tesla-muted"
          onClick={() => openMachineServiceReport(asset, logs)}
        >
          Service report (PDF)
        </button>
        <Link
          to="/workspace/service-history"
          className="rounded-sm border border-tesla-border bg-white px-3 py-1.5 text-sm hover:bg-tesla-muted"
        >
          All service history
        </Link>
      </div>

      {dlErr && <p className="mb-2 text-sm text-red-600">{dlErr}</p>}
      {err && <p className="mb-2 text-sm text-red-600">{err}</p>}

      <h3 className="mb-2 text-sm font-semibold text-tesla-text">Service history</h3>
      <div className="mb-6 overflow-hidden rounded-sm border border-tesla-border">
        <table className="w-full text-sm">
          <thead className="bg-tesla-muted text-left">
            <tr>
              <th className="px-2 py-2 font-medium">Date</th>
              <th className="px-2 py-2 font-medium">Title</th>
              <th className="px-2 py-2 font-medium">Work performed</th>
              <th className="px-2 py-2 font-medium">Technician</th>
              <th className="px-2 py-2 font-medium">Reports</th>
              <th className="px-2 py-2 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {logs.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-2 py-3 text-tesla-text-secondary">
                  No service entries yet.
                </td>
              </tr>
            ) : (
              logs.map((l) => (
                <tr key={l.id} className="border-t border-tesla-border align-top">
                  <td className="px-2 py-2 whitespace-nowrap">{new Date(l.performedAt).toLocaleString()}</td>
                  <td className="px-2 py-2 font-medium">
                    <Link
                      to={`/workspace/service-history/${l.id}`}
                      className="underline-offset-2 hover:underline"
                    >
                      {l.title}
                    </Link>
                  </td>
                  <td className="px-2 py-2 text-tesla-text-secondary">{l.description ?? "—"}</td>
                  <td className="px-2 py-2">{l.technicianName ?? "—"}</td>
                  <td className="px-2 py-2">
                    <div className="flex flex-wrap gap-2">
                      {l.reportMarkdownStorage ? (
                        <button
                          type="button"
                          className="text-blue-700 underline"
                          onClick={() => {
                            setDlErr(null);
                            void downloadServiceReport(l.id, "md").catch((e: Error) =>
                              setDlErr(e.message),
                            );
                          }}
                        >
                          MD
                        </button>
                      ) : null}
                      {l.reportPdfStorage ? (
                        <button
                          type="button"
                          className="text-blue-700 underline"
                          onClick={() => {
                            setDlErr(null);
                            void downloadServiceReport(l.id, "pdf").catch((e: Error) =>
                              setDlErr(e.message),
                            );
                          }}
                        >
                          PDF
                        </button>
                      ) : null}
                      {!l.reportMarkdownStorage && !l.reportPdfStorage ? (
                        <span className="text-tesla-text-secondary">—</span>
                      ) : null}
                    </div>
                  </td>
                  <td className="px-2 py-2">
                    <div className="flex flex-wrap gap-2">
                      <Link
                        to={`/workspace/service-history/${l.id}`}
                        className="text-blue-700 underline"
                      >
                        Edit
                      </Link>
                      <button
                        type="button"
                        className="text-red-700 underline"
                        onClick={() =>
                          setDeleteLog({ id: l.id, label: l.title })
                        }
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="max-w-xl rounded-sm border border-dashed border-tesla-border bg-tesla-muted/30 p-3">
        <p className="mb-2 text-sm font-medium text-tesla-text">Log service work</p>
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

      <DeleteConfirmModal
        open={deleteAsset}
        recordTitle={asset.name}
        previewPath={`/api/assets/${asset.id}/delete-preview`}
        deletePath={`/api/assets/${asset.id}`}
        onClose={() => setDeleteAsset(false)}
        onDeleted={async () => {
          await qc.invalidateQueries({ queryKey: ["assets"] });
          nav("/workspace/machines");
        }}
      />
      <DeleteConfirmModal
        open={Boolean(deleteLog)}
        recordTitle={deleteLog?.label ?? ""}
        previewPath={
          deleteLog
            ? `/api/asset-service-logs/${deleteLog.id}/delete-preview`
            : ""
        }
        deletePath={
          deleteLog ? `/api/asset-service-logs/${deleteLog.id}` : ""
        }
        onClose={() => setDeleteLog(null)}
        onDeleted={async () => {
          setDeleteLog(null);
          await refresh();
        }}
      />
    </WorkspaceDetailChrome>
  );
}
