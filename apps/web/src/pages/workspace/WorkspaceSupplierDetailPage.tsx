import { useMemo, useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import { api } from "../../lib/api";
import { WorkspaceDetailChrome } from "./WorkspaceDetailChrome";
import type { Procurement } from "../../workspace/purchasingTypes";

type Supplier = { id: string; name: string; code: string | null; notes: string | null; version: number };

export function WorkspaceSupplierDetailPage() {
  const { supplierId } = useParams<{ supplierId: string }>();
  const qc = useQueryClient();
  const { data: suppliersData } = useQuery({
    queryKey: ["suppliers"],
    queryFn: () => api<{ suppliers: Supplier[] }>("/api/suppliers"),
  });
  const { data: procData } = useQuery({
    queryKey: ["proc-all"],
    queryFn: () => api<{ procurement: Procurement[] }>("/api/procurement"),
  });

  const supplier = suppliersData?.suppliers.find((s) => s.id === supplierId);
  const purchasing = useMemo(
    () => (procData?.procurement ?? []).filter((p) => p.supplierId === supplierId),
    [procData?.procurement, supplierId],
  );

  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [newPurchasingTitle, setNewPurchasingTitle] = useState("");
  const [childBusy, setChildBusy] = useState(false);

  useEffect(() => {
    if (!supplier) return;
    setName(supplier.name);
    setCode(supplier.code ?? "");
    setNotes(supplier.notes ?? "");
  }, [supplier]);

  async function refresh() {
    await qc.invalidateQueries({ queryKey: ["suppliers"] });
  }
  async function refreshProcurement() {
    await qc.invalidateQueries({ queryKey: ["proc-all"] });
  }

  if (!supplierId) return null;
  if (!suppliersData) return <p className="text-slate-500">Loading…</p>;
  if (!supplier) {
    return (
      <WorkspaceDetailChrome backTo="/workspace/suppliers" backLabel="← Suppliers" title="Not found">
        <p className="text-slate-600">Supplier not found.</p>
      </WorkspaceDetailChrome>
    );
  }

  return (
    <WorkspaceDetailChrome backTo="/workspace/suppliers" backLabel="← Suppliers" title={supplier.name}>
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
        <div>
          <label className="block text-sm font-medium">Notes</label>
          <textarea className="mt-1 w-full rounded border px-2 py-1.5" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>
        <button
          type="button"
          disabled={saving || !name.trim()}
          className="w-fit rounded border bg-slate-900 px-3 py-1.5 text-sm text-white disabled:opacity-50"
          onClick={() => {
            setErr(null);
            setSaving(true);
            void api("/api/suppliers/" + supplier.id, {
              method: "PATCH",
              body: JSON.stringify({
                name: name.trim(),
                code: code.trim() || null,
                notes: notes.trim() || null,
                version: supplier.version,
              }),
            })
              .then(refresh)
              .catch((e: Error) => setErr(e.message))
              .finally(() => setSaving(false));
          }}
        >
          Save supplier
        </button>
      </div>

      <h2 className="mb-2 text-lg font-semibold text-slate-800">Purchasing</h2>
      <p className="mb-2 text-sm text-slate-600">
        <Link
          to={`/workspace/purchasing-lines?supplierId=${encodeURIComponent(supplier.id)}`}
          className="font-medium text-blue-700 underline hover:text-blue-900"
        >
          View purchasing lines for this supplier
        </Link>
      </p>
      {purchasing.length === 0 ? (
        <p className="mb-2 text-sm text-slate-500">No purchasing records for this supplier — add one below.</p>
      ) : (
        <ul className="mb-3 divide-y divide-slate-200 rounded-lg border border-slate-200 bg-white">
          {purchasing.map((p) => (
            <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 hover:bg-slate-50">
              <span className="text-slate-900">{p.title}</span>
              <Link to={`/workspace/purchasing/${p.id}`} className="text-sm font-medium text-blue-700 underline">
                Open
              </Link>
            </li>
          ))}
        </ul>
      )}
      <div className="max-w-xl rounded-lg border border-dashed border-slate-300 bg-slate-50/80 p-3">
        <p className="mb-2 text-sm font-medium text-slate-700">Add purchasing</p>
        <div className="flex flex-wrap items-end gap-2">
          <div className="min-w-[12rem] flex-1">
            <label className="block text-xs font-medium text-slate-600">Title</label>
            <input
              className="mt-1 w-full rounded border border-slate-300 bg-white px-2 py-1.5 text-sm"
              value={newPurchasingTitle}
              onChange={(e) => setNewPurchasingTitle(e.target.value)}
              placeholder="RFQ / PO title"
            />
          </div>
          <button
            type="button"
            disabled={childBusy || !newPurchasingTitle.trim()}
            className="rounded border bg-slate-900 px-3 py-1.5 text-sm text-white disabled:opacity-50"
            onClick={() => {
              setErr(null);
              setChildBusy(true);
              void api("/api/procurement", {
                method: "POST",
                body: JSON.stringify({
                  title: newPurchasingTitle.trim(),
                  status: "draft",
                  supplierId: supplier.id,
                }),
              })
                .then(async () => {
                  setNewPurchasingTitle("");
                  await refreshProcurement();
                })
                .catch((e: Error) => setErr(e.message))
                .finally(() => setChildBusy(false));
            }}
          >
            {childBusy ? "…" : "Add purchasing"}
          </button>
        </div>
      </div>
    </WorkspaceDetailChrome>
  );
}
