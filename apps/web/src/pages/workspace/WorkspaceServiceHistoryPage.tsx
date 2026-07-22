import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { api } from "../../lib/api";
import { localToIso } from "../../workspace/workspaceDates";
import { WorkspaceDetailChrome } from "./WorkspaceDetailChrome";
import { DeleteConfirmModal } from "../../components/DeleteConfirmModal";

type Asset = { id: string; name: string; site: string };
type ServiceLog = {
  id: string;
  assetId: string;
  title: string;
  description: string | null;
  performedAt: string;
  technicianName: string | null;
  assetName?: string;
  assetSite?: string;
  version: number;
};

export function WorkspaceServiceHistoryPage() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["asset-service-logs"],
    queryFn: () => api<{ logs: ServiceLog[] }>("/api/asset-service-logs"),
  });
  const { data: assetsData } = useQuery({
    queryKey: ["assets"],
    queryFn: () => api<{ assets: Asset[] }>("/api/assets"),
  });

  const [assetId, setAssetId] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [performedAt, setPerformedAt] = useState("");
  const [technicianName, setTechnicianName] = useState("");
  const [creating, setCreating] = useState(false);
  const [createErr, setCreateErr] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{
    id: string;
    label: string;
  } | null>(null);

  const logs = data?.logs ?? [];
  const assets = assetsData?.assets ?? [];

  return (
    <WorkspaceDetailChrome backTo="/" backLabel="← Home" title="Service history">
      <p className="mb-4 text-sm text-tesla-text-secondary">
        All machine service entries across the organisation. Open a row to edit,
        or use Log work for AI-assisted reports.
      </p>

      <div className="mb-6 max-w-xl rounded-sm border border-dashed border-tesla-border bg-tesla-muted/30 p-3">
        <p className="mb-2 text-sm font-medium text-tesla-text">Add service entry</p>
        {createErr && <p className="mb-2 text-sm text-red-600">{createErr}</p>}
        <div className="grid gap-2">
          <div>
            <label className="block text-xs font-medium text-tesla-text-secondary">
              Machine
            </label>
            <select
              className="mt-1 w-full rounded-sm border border-tesla-border bg-white px-2 py-1"
              value={assetId}
              onChange={(e) => setAssetId(e.target.value)}
            >
              <option value="">—</option>
              {assets.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name} · {a.site}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-tesla-text-secondary">
              Title
            </label>
            <input
              className="mt-1 w-full rounded-sm border border-tesla-border px-2 py-1"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-tesla-text-secondary">
              Work performed
            </label>
            <textarea
              className="mt-1 w-full rounded-sm border border-tesla-border px-2 py-1"
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-medium text-tesla-text-secondary">
                Performed at
              </label>
              <input
                type="datetime-local"
                className="mt-1 w-full rounded-sm border border-tesla-border px-2 py-1"
                value={performedAt}
                onChange={(e) => setPerformedAt(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-tesla-text-secondary">
                Technician
              </label>
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
          disabled={creating || !assetId || !title.trim()}
          className="mt-3 rounded-sm bg-tesla-text px-3 py-1.5 text-sm text-white disabled:opacity-50"
          onClick={() => {
            setCreateErr(null);
            setCreating(true);
            void api("/api/asset-service-logs", {
              method: "POST",
              body: JSON.stringify({
                assetId,
                title: title.trim(),
                description: description.trim() || null,
                performedAt: localToIso(performedAt) ?? undefined,
                technicianName: technicianName.trim() || null,
              }),
            })
              .then(async () => {
                setAssetId("");
                setTitle("");
                setDescription("");
                setPerformedAt("");
                setTechnicianName("");
                await qc.invalidateQueries({ queryKey: ["asset-service-logs"] });
              })
              .catch((e: Error) => setCreateErr(e.message))
              .finally(() => setCreating(false));
          }}
        >
          Create entry
        </button>
      </div>

      {isLoading ? (
        <p className="text-tesla-text-secondary">Loading…</p>
      ) : logs.length === 0 ? (
        <p className="text-tesla-text-secondary">No service history yet.</p>
      ) : (
        <div className="overflow-hidden rounded-sm border border-tesla-border">
          <table className="w-full text-sm">
            <thead className="bg-tesla-muted text-left">
              <tr>
                <th className="px-3 py-2 font-medium">Date</th>
                <th className="px-3 py-2 font-medium">Machine</th>
                <th className="px-3 py-2 font-medium">Title</th>
                <th className="px-3 py-2 font-medium">Technician</th>
                <th className="px-3 py-2 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((l) => (
                <tr key={l.id} className="border-t border-tesla-border hover:bg-tesla-muted/50">
                  <td className="px-3 py-2 whitespace-nowrap">
                    {new Date(l.performedAt).toLocaleString()}
                  </td>
                  <td className="px-3 py-2">
                    <Link
                      to={`/workspace/machines/${l.assetId}`}
                      className="underline-offset-2 hover:underline"
                    >
                      {l.assetName ?? l.assetId}
                    </Link>
                  </td>
                  <td className="px-3 py-2">
                    <Link
                      to={`/workspace/service-history/${l.id}`}
                      className="font-medium underline-offset-2 hover:underline"
                    >
                      {l.title}
                    </Link>
                  </td>
                  <td className="px-3 py-2 text-tesla-text-secondary">
                    {l.technicianName ?? "—"}
                  </td>
                  <td className="px-3 py-2">
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
                          setDeleteTarget({ id: l.id, label: l.title })
                        }
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <DeleteConfirmModal
        open={Boolean(deleteTarget)}
        recordTitle={deleteTarget?.label ?? ""}
        previewPath={
          deleteTarget
            ? `/api/asset-service-logs/${deleteTarget.id}/delete-preview`
            : ""
        }
        deletePath={
          deleteTarget ? `/api/asset-service-logs/${deleteTarget.id}` : ""
        }
        onClose={() => setDeleteTarget(null)}
        onDeleted={async () => {
          setDeleteTarget(null);
          await qc.invalidateQueries({ queryKey: ["asset-service-logs"] });
        }}
      />
    </WorkspaceDetailChrome>
  );
}
