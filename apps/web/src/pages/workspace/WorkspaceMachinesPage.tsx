import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { api } from "../../lib/api";
import { useMe } from "../../hooks/useMe";
import { WorkspaceDetailChrome } from "./WorkspaceDetailChrome";
import { DeleteConfirmModal } from "../../components/DeleteConfirmModal";
import {
  StackedList,
  StackedListEmpty,
  StackedListHeading,
  StackedListRow,
  StackedMetaGrid,
  StackedMetaItem,
  StackedListShell,
} from "../../components/StackedDataList";

type Asset = {
  id: string;
  name: string;
  site: string;
  line: string;
  serial: string | null;
  clientId: string | null;
};

type Client = { id: string; name: string };

export function WorkspaceMachinesPage() {
  const qc = useQueryClient();
  const { data: meData } = useMe();
  const isAdmin = meData?.user?.globalRole === "org_admin";

  const { data, isLoading } = useQuery({
    queryKey: ["assets"],
    queryFn: () => api<{ assets: Asset[] }>("/api/assets"),
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
  const [creating, setCreating] = useState(false);
  const [createErr, setCreateErr] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{
    id: string;
    label: string;
  } | null>(null);

  const assets = data?.assets ?? [];
  const clients = clientsData?.clients ?? [];
  const clientName = (id: string | null) =>
    id ? clients.find((c) => c.id === id)?.name ?? "—" : "—";

  return (
    <WorkspaceDetailChrome backTo="/" backLabel="← Home" title="Machines">
      <p className="mb-4 text-sm text-tesla-text-secondary">
        Track equipment and open a machine to view service history or send a customer report.
        Assign a customer so service calls can target that machine.
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
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-tesla-text-secondary">
                Customer (optional)
              </label>
              <select
                className="mt-1 w-full rounded-sm border border-tesla-border bg-white px-2 py-1"
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
                  clientId: clientId || null,
                }),
              })
                .then(async () => {
                  setName("");
                  setSite("");
                  setLine("");
                  setSerial("");
                  setClientId("");
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

      <StackedListShell>
        {isLoading ? (
          <StackedListEmpty>Loading…</StackedListEmpty>
        ) : assets.length === 0 ? (
          <StackedListEmpty>No machines yet.</StackedListEmpty>
        ) : (
          <StackedList>
            {assets.map((a) => (
              <StackedListRow key={a.id}>
                <StackedListHeading
                  title={
                    <Link
                      to={`/workspace/machines/${a.id}`}
                      className="underline-offset-2 hover:underline"
                    >
                      {a.name}
                    </Link>
                  }
                  actions={
                    isAdmin ? (
                      <button
                        type="button"
                        className="text-sm text-red-700 underline"
                        onClick={() =>
                          setDeleteTarget({ id: a.id, label: a.name })
                        }
                      >
                        Delete
                      </button>
                    ) : null
                  }
                />
                <StackedMetaGrid>
                  <StackedMetaItem label="Customer">
                    {clientName(a.clientId)}
                  </StackedMetaItem>
                  <StackedMetaItem label="Site">{a.site}</StackedMetaItem>
                  <StackedMetaItem label="Line">{a.line}</StackedMetaItem>
                  <StackedMetaItem label="Serial">{a.serial ?? "—"}</StackedMetaItem>
                </StackedMetaGrid>
              </StackedListRow>
            ))}
          </StackedList>
        )}
      </StackedListShell>

      <DeleteConfirmModal
        open={Boolean(deleteTarget)}
        recordTitle={deleteTarget?.label ?? ""}
        previewPath={
          deleteTarget ? `/api/assets/${deleteTarget.id}/delete-preview` : ""
        }
        deletePath={deleteTarget ? `/api/assets/${deleteTarget.id}` : ""}
        onClose={() => setDeleteTarget(null)}
        onDeleted={async () => {
          setDeleteTarget(null);
          await qc.invalidateQueries({ queryKey: ["assets"] });
        }}
      />
    </WorkspaceDetailChrome>
  );
}
