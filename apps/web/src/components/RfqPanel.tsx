import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, useMemo, useRef } from "react";
import { api, apiForm } from "../lib/api";
import { DeleteConfirmModal } from "./DeleteConfirmModal";

type Line = {
  id: string;
  procurementId: string;
  description: string;
  quantity: string;
  received: boolean;
  version: number;
};

type SupplierRow = { id: string; name: string };

type RFQ = {
  id: string;
  title: string;
  status: string;
  supplierId: string | null;
  sapPoNumber: string | null;
  version: number;
  sapLineCache: string | null;
};

export function RfqPanel({ projectId }: { projectId: string }) {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["rfq", projectId],
    queryFn: () =>
      api<{
        procurement: RFQ[];
        lines: Line[];
      }>("/api/procurement?projectId=" + encodeURIComponent(projectId)),
  });
  const { data: suppliersData } = useQuery({
    queryKey: ["suppliers"],
    queryFn: () => api<{ suppliers: SupplierRow[] }>("/api/suppliers"),
  });
  const suppliers = suppliersData?.suppliers ?? [];
  const supplierName = useMemo(
    () => new Map(suppliers.map((s) => [s.id, s.name] as const)),
    [suppliers],
  );
  const [title, setTitle] = useState("");
  const [newSupplierId, setNewSupplierId] = useState("");
  const [newTitle, setNewTitle] = useState("");
  const [newQty, setNewQty] = useState("1");
  const [newLineFor, setNewLineFor] = useState<string | null>(null);
  const dbfInputRef = useRef<HTMLInputElement>(null);
  const [dbfBusy, setDbfBusy] = useState(false);
  const [dbfMsg, setDbfMsg] = useState<string | null>(null);
  const [deleteRfq, setDeleteRfq] = useState<{ id: string; title: string } | null>(null);

  const linesByPr = useMemo(() => {
    const m: Record<string, Line[]> = {};
    for (const l of data?.lines ?? []) {
      if (!m[l.procurementId]) {
        m[l.procurementId] = [];
      }
      m[l.procurementId]!.push(l);
    }
    return m;
  }, [data?.lines]);

  async function createRfq() {
    if (!title.trim()) {
      return;
    }
    await api("/api/procurement", {
      method: "POST",
      body: JSON.stringify({
        projectId,
        title: title.trim(),
        status: "draft",
        supplierId: newSupplierId || null,
      }),
    });
    setTitle("");
    setNewSupplierId("");
    await qc.invalidateQueries({ queryKey: ["rfq", projectId] });
  }

  async function saveSupplier(id: string, version: number, supplierId: string | null) {
    await api("/api/procurement/" + id, {
      method: "PATCH",
      body: JSON.stringify({ supplierId, version }),
    });
    await qc.invalidateQueries({ queryKey: ["rfq", projectId] });
  }

  async function savePo(id: string, v: number, po: string) {
    await api("/api/procurement/" + id, {
      method: "PATCH",
      body: JSON.stringify({
        sapPoNumber: po.trim() || null,
        version: v,
      }),
    });
    await qc.invalidateQueries({ queryKey: ["rfq", projectId] });
  }

  async function refreshSap(id: string) {
    await api("/api/procurement/" + id + "/sap-refresh", { method: "POST" });
    await qc.invalidateQueries({ queryKey: ["rfq", projectId] });
  }

  async function importDbf() {
    const input = dbfInputRef.current;
    const file = input?.files?.[0];
    if (!file) {
      setDbfMsg("Choose a .dbf file first.");
      return;
    }
    setDbfBusy(true);
    setDbfMsg(null);
    try {
      const fd = new FormData();
      fd.append("projectId", projectId);
      fd.append("file", file);
      const res = await apiForm<{
        created: { id: string; title: string; lineCount: number }[];
        rowCount: number;
      }>("/api/bom-dbf-import", fd);
      setDbfMsg(
        `Imported ${res.created.length} RFQ(s) from ${res.rowCount} BOM row(s).`,
      );
      if (input) input.value = "";
      await qc.invalidateQueries({ queryKey: ["rfq", projectId] });
      await qc.invalidateQueries({ queryKey: ["proc-all"] });
    } catch (e) {
      setDbfMsg((e as Error).message);
    } finally {
      setDbfBusy(false);
    }
  }

  async function addLine(procurementId: string) {
    if (!newTitle.trim()) {
      return;
    }
    await api("/api/procurement-lines", {
      method: "POST",
      body: JSON.stringify({
        procurementId,
        description: newTitle.trim(),
        quantity: newQty || "1",
        orderIndex: (linesByPr[procurementId] ?? []).length,
      }),
    });
    setNewTitle("");
    setNewQty("1");
    setNewLineFor(null);
    await qc.invalidateQueries({ queryKey: ["rfq", projectId] });
  }

  if (isLoading) {
    return <p className="text-slate-500">Loading RFQs…</p>;
  }

  return (
    <div className="space-y-4 max-w-3xl">
      <div className="flex flex-wrap gap-2 items-end">
        <div>
          <label className="text-xs text-slate-500">Supplier (optional)</label>
          <select
            className="border rounded px-2 py-1 w-56 block text-sm"
            value={newSupplierId}
            onChange={(e) => setNewSupplierId(e.target.value)}
          >
            <option value="">(none)</option>
            {suppliers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-xs text-slate-500">New RFQ / quotation request</label>
          <input
            className="border rounded px-2 py-1 w-64 block"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                void createRfq();
              }
            }}
            placeholder="Title"
          />
        </div>
        <button
          type="button"
          onClick={() => void createRfq()}
          className="px-3 py-1.5 bg-slate-800 text-white rounded text-sm"
        >
          Add RFQ
        </button>
      </div>
      <div className="rounded border border-dashed border-slate-300 bg-slate-50/80 p-3 space-y-2">
        <div className="text-sm font-medium text-slate-800">Import Elecdes BOM (.dbf)</div>
        <p className="text-xs text-slate-600">
          One procurement (RFQ) is created per distinct manufacturer column (MFG / MANUFACTURER / VENDOR, etc.); each
          BOM line becomes a line item.
        </p>
        <div className="flex flex-wrap items-end gap-2">
          <input ref={dbfInputRef} type="file" accept=".dbf,.DBF" className="text-sm max-w-full" />
          <button
            type="button"
            disabled={dbfBusy}
            className="px-3 py-1.5 rounded border border-slate-800 bg-white text-sm font-medium hover:bg-slate-100 disabled:opacity-50"
            onClick={() => void importDbf()}
          >
            {dbfBusy ? "Importing…" : "Import DBF"}
          </button>
        </div>
        {dbfMsg && (
          <p className={"text-xs " + (dbfMsg.startsWith("Imported") ? "text-green-800" : "text-red-600")}>
            {dbfMsg}
          </p>
        )}
      </div>
      <ul className="space-y-4">
        {data?.procurement.map((p) => {
          const lines = linesByPr[p.id] ?? [];
          return (
            <li key={p.id} className="bg-white border rounded p-3 space-y-2">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="font-medium">{p.title}</div>
                <button
                  type="button"
                  className="shrink-0 rounded border border-red-200 bg-red-50 px-2 py-1 text-xs font-medium text-red-800 hover:bg-red-100"
                  onClick={() => setDeleteRfq({ id: p.id, title: p.title })}
                >
                  Delete RFQ
                </button>
              </div>
              <div className="text-xs text-slate-500">Status: {p.status}</div>
              <div className="flex flex-wrap items-center gap-2">
                <label className="text-xs text-slate-500">Supplier</label>
                <select
                  className="border rounded px-2 py-0.5 text-sm max-w-[14rem]"
                  value={p.supplierId ?? ""}
                  onChange={(e) => void saveSupplier(p.id, p.version, e.target.value || null)}
                  title={p.supplierId ? supplierName.get(p.supplierId) ?? "" : ""}
                >
                  <option value="">(none)</option>
                  {suppliers.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <label className="text-xs text-slate-500">SAP PO</label>
                <PoField
                  key={`${p.id}-${p.version}`}
                  initial={p.sapPoNumber ?? ""}
                  onSave={(po) => void savePo(p.id, p.version, po)}
                />
                {p.sapPoNumber && (
                  <button
                    type="button"
                    className="text-xs text-blue-700"
                    onClick={() => void refreshSap(p.id)}
                  >
                    Refresh from SAP
                  </button>
                )}
              </div>
              {p.sapLineCache && (
                <pre className="text-xs p-2 bg-slate-50 max-h-28 overflow-auto rounded">
                  {p.sapLineCache}
                </pre>
              )}
              <div>
                <div className="text-xs font-medium text-slate-600 mb-1">
                  Line items
                </div>
                <ul className="text-sm space-y-1 pl-0 list-none">
                  {lines.map((l) => (
                    <li key={l.id} className="flex items-start gap-2">
                      <input
                        type="checkbox"
                        className="mt-1 shrink-0"
                        title="Received"
                        checked={l.received}
                        onChange={(e) => {
                          void api("/api/procurement-lines/" + l.id, {
                            method: "PATCH",
                            body: JSON.stringify({
                              received: e.target.checked,
                              version: l.version,
                            }),
                          }).then(async () => {
                            await qc.invalidateQueries({ queryKey: ["rfq", projectId] });
                            await qc.invalidateQueries({ queryKey: ["proc-all"] });
                            await qc.invalidateQueries({ queryKey: ["crud-procurement", projectId] });
                          });
                        }}
                      />
                      <span className={l.received ? "text-slate-600" : ""}>
                        {l.description} · qty {l.quantity}
                      </span>
                    </li>
                  ))}
                </ul>
                {newLineFor === p.id ? (
                  <div className="mt-2 flex flex-wrap gap-2 items-end">
                    <input
                      className="border rounded px-2 py-1 text-sm flex-1 min-w-[200px]"
                      value={newTitle}
                      onChange={(e) => setNewTitle(e.target.value)}
                      placeholder="Description"
                    />
                    <input
                      className="border rounded px-2 py-1 w-20 text-sm"
                      value={newQty}
                      onChange={(e) => setNewQty(e.target.value)}
                      placeholder="Qty"
                    />
                    <button
                      type="button"
                      className="px-2 py-1 bg-slate-200 rounded text-sm"
                      onClick={() => void addLine(p.id)}
                    >
                      Save line
                    </button>
                    <button
                      type="button"
                      className="text-sm text-slate-500"
                      onClick={() => {
                        setNewLineFor(null);
                        setNewTitle("");
                      }}
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    className="text-sm text-blue-700 mt-1"
                    onClick={() => {
                      setNewLineFor(p.id);
                      setNewTitle("");
                    }}
                  >
                    + Line item
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ul>

      {deleteRfq ? (
        <DeleteConfirmModal
          open
          recordTitle={deleteRfq.title}
          previewPath={`/api/procurement/${deleteRfq.id}/delete-preview`}
          deletePath={`/api/procurement/${deleteRfq.id}`}
          onClose={() => setDeleteRfq(null)}
          onDeleted={async () => {
            await qc.invalidateQueries({ queryKey: ["rfq", projectId] });
            await qc.invalidateQueries({ queryKey: ["proc-all"] });
            await qc.invalidateQueries({ queryKey: ["crud-procurement", projectId] });
          }}
        />
      ) : null}
    </div>
  );
}

function PoField({
  initial,
  onSave,
}: {
  initial: string;
  onSave: (po: string) => void;
}) {
  const [val, setVal] = useState(initial);
  return (
    <div className="flex gap-1 items-center">
      <input
        className="border rounded px-2 py-0.5 text-sm w-40"
        value={val}
        onChange={(e) => setVal(e.target.value)}
        placeholder="e.g. 4500001"
        aria-label="SAP purchase order number"
      />
      <button
        type="button"
        className="text-xs px-2 py-0.5 border rounded"
        onClick={() => onSave(val)}
      >
        Save
      </button>
    </div>
  );
}
