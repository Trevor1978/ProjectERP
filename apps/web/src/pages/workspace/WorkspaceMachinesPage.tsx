import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { api } from "../../lib/api";
import { useMe } from "../../hooks/useMe";
import { WorkspaceDetailChrome } from "./WorkspaceDetailChrome";

type Asset = {
  id: string;
  name: string;
  site: string;
  line: string;
  serial: string | null;
};

export function WorkspaceMachinesPage() {
  const qc = useQueryClient();
  const { data: meData } = useMe();
  const isAdmin = meData?.user?.globalRole === "org_admin";

  const { data, isLoading } = useQuery({
    queryKey: ["assets"],
    queryFn: () => api<{ assets: Asset[] }>("/api/assets"),
  });

  const [name, setName] = useState("");
  const [site, setSite] = useState("");
  const [line, setLine] = useState("");
  const [serial, setSerial] = useState("");
  const [creating, setCreating] = useState(false);
  const [createErr, setCreateErr] = useState<string | null>(null);

  const assets = data?.assets ?? [];

  return (
    <WorkspaceDetailChrome backTo="/" backLabel="← Home" title="Machines">
      <p className="mb-4 text-sm text-tesla-text-secondary">
        Track equipment and open a machine to view service history or send a customer report.
      </p>

      {isAdmin && (
        <div className="mb-6 max-w-xl rounded-sm border border-dashed border-tesla-border bg-tesla-muted/30 p-3">
          <p className="mb-2 text-sm font-medium text-tesla-text">Add machine</p>
          {createErr && <p className="mb-2 text-sm text-red-600">{createErr}</p>}
          <div className="grid gap-2 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-medium text-tesla-text-secondary">Name</label>
              <input
                className="mt-1 w-full rounded-sm border border-tesla-border px-2 py-1"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-tesla-text-secondary">Site</label>
              <input
                className="mt-1 w-full rounded-sm border border-tesla-border px-2 py-1"
                value={site}
                onChange={(e) => setSite(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-tesla-text-secondary">Line</label>
              <input
                className="mt-1 w-full rounded-sm border border-tesla-border px-2 py-1"
                value={line}
                onChange={(e) => setLine(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-tesla-text-secondary">Serial (optional)</label>
              <input
                className="mt-1 w-full rounded-sm border border-tesla-border px-2 py-1"
                value={serial}
                onChange={(e) => setSerial(e.target.value)}
              />
            </div>
          </div>
          <button
            type="button"
            disabled={creating || !name.trim() || !site.trim() || !line.trim()}
            className="mt-3 rounded-sm bg-tesla-text px-3 py-1.5 text-sm text-white disabled:opacity-50"
            onClick={() => {
              setCreateErr(null);
              setCreating(true);
              void api("/api/assets", {
                method: "POST",
                body: JSON.stringify({
                  name: name.trim(),
                  site: site.trim(),
                  line: line.trim(),
                  serial: serial.trim() || null,
                }),
              })
                .then(async () => {
                  setName("");
                  setSite("");
                  setLine("");
                  setSerial("");
                  await qc.invalidateQueries({ queryKey: ["assets"] });
                })
                .catch((e: Error) => setCreateErr(e.message))
                .finally(() => setCreating(false));
            }}
          >
            Create machine
          </button>
        </div>
      )}

      {!isAdmin && (
        <p className="mb-4 text-xs text-tesla-text-secondary">
          Contact an org admin to register new machines.
        </p>
      )}

      {isLoading ? (
        <p className="text-tesla-text-secondary">Loading…</p>
      ) : assets.length === 0 ? (
        <p className="text-tesla-text-secondary">No machines yet.</p>
      ) : (
        <div className="overflow-hidden rounded-sm border border-tesla-border">
          <table className="w-full text-sm">
            <thead className="bg-tesla-muted text-left">
              <tr>
                <th className="px-3 py-2 font-medium">Name</th>
                <th className="px-3 py-2 font-medium">Site</th>
                <th className="px-3 py-2 font-medium">Line</th>
                <th className="px-3 py-2 font-medium">Serial</th>
              </tr>
            </thead>
            <tbody>
              {assets.map((a) => (
                <tr key={a.id} className="border-t border-tesla-border hover:bg-tesla-muted/50">
                  <td className="px-3 py-2">
                    <Link
                      to={`/workspace/machines/${a.id}`}
                      className="font-medium text-tesla-text underline-offset-2 hover:underline"
                    >
                      {a.name}
                    </Link>
                  </td>
                  <td className="px-3 py-2 text-tesla-text-secondary">{a.site}</td>
                  <td className="px-3 py-2 text-tesla-text-secondary">{a.line}</td>
                  <td className="px-3 py-2 text-tesla-text-secondary">{a.serial ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </WorkspaceDetailChrome>
  );
}
