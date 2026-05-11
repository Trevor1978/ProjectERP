import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { isoToLocal, localToIso } from "../workspace/workspaceDates";
import type { Procurement, ProcurementLine } from "../workspace/purchasingTypes";
import { PROC_STATUS } from "../workspace/purchasingTypes";

type Project = { id: string; name: string };
type Supplier = { id: string; name: string };

function PurchasingDetailLineRow({
  line,
  onSaved,
}: {
  line: ProcurementLine;
  onSaved: () => Promise<void>;
}) {
  const [partNumber, setPartNumber] = useState(line.partNumber ?? "");
  const [description, setDescription] = useState(line.description);
  const [quantity, setQuantity] = useState(line.quantity);
  const [unit, setUnit] = useState(line.unit ?? "");
  const [estUnitPrice, setEstUnitPrice] = useState(line.estUnitPrice == null ? "" : String(line.estUnitPrice));
  const [orderIndex, setOrderIndex] = useState(String(line.orderIndex));
  const [receivedQty, setReceivedQty] = useState(String(line.receivedQty));
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    setPartNumber(line.partNumber ?? "");
    setDescription(line.description);
    setQuantity(line.quantity);
    setUnit(line.unit ?? "");
    setEstUnitPrice(line.estUnitPrice == null ? "" : String(line.estUnitPrice));
    setOrderIndex(String(line.orderIndex));
    setReceivedQty(String(line.receivedQty));
  }, [line]);
  return (
    <tr className="border-b align-top">
      <td className="py-1 pr-2">
        <input
          className="w-full min-w-[6rem] rounded border px-2 py-1"
          value={partNumber}
          onChange={(e) => setPartNumber(e.target.value)}
          placeholder="Part #"
        />
      </td>
      <td className="py-1 pr-2">
        {err && <p className="mb-1 text-xs text-red-600">{err}</p>}
        <textarea
          className="w-full min-w-[12rem] rounded border px-2 py-1"
          rows={2}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </td>
      <td className="py-1 pr-2">
        <input className="w-20 rounded border px-2 py-1" value={quantity} onChange={(e) => setQuantity(e.target.value)} />
      </td>
      <td className="py-1 pr-2">
        <input className="w-16 rounded border px-2 py-1" value={unit} onChange={(e) => setUnit(e.target.value)} />
      </td>
      <td className="py-1 pr-2">
        <input
          type="number"
          className="w-24 rounded border px-2 py-1"
          value={estUnitPrice}
          onChange={(e) => setEstUnitPrice(e.target.value)}
        />
      </td>
      <td className="py-1 pr-2">
        <input type="number" className="w-14 rounded border px-2 py-1" value={orderIndex} onChange={(e) => setOrderIndex(e.target.value)} />
      </td>
      <td className="py-1 pr-2">
        <input
          type="number"
          min={0}
          step={1}
          className="w-20 rounded border px-2 py-1"
          value={receivedQty}
          onChange={(e) => setReceivedQty(e.target.value)}
        />
      </td>
      <td className="py-1 whitespace-nowrap">
        <button
          type="button"
          className="mr-1 rounded border bg-slate-900 px-2 py-1 text-xs text-white disabled:opacity-50"
          disabled={saving || removing || !description.trim()}
          onClick={() => {
            setErr(null);
            setSaving(true);
            void api("/api/procurement-lines/" + line.id, {
              method: "PATCH",
              body: JSON.stringify({
                partNumber: partNumber.trim() || null,
                description: description.trim(),
                quantity: quantity || "1",
                unit: unit.trim() || null,
                estUnitPrice: estUnitPrice.trim() ? Number(estUnitPrice) : null,
                orderIndex: Number(orderIndex) || 0,
                receivedQty: Math.max(0, Math.trunc(Number(receivedQty) || 0)),
                version: line.version,
              }),
            })
              .then(onSaved)
              .catch((e: Error) => setErr(e.message))
              .finally(() => setSaving(false));
          }}
        >
          Save
        </button>
        <button
          type="button"
          className="rounded border px-2 py-1 text-xs text-red-700 disabled:opacity-50"
          disabled={saving || removing}
          onClick={() => {
            if (!window.confirm("Remove this line?")) return;
            setErr(null);
            setRemoving(true);
            void api("/api/procurement-lines/" + line.id, { method: "DELETE" })
              .then(onSaved)
              .catch((e: Error) => setErr(e.message))
              .finally(() => setRemoving(false));
          }}
        >
          Remove
        </button>
      </td>
    </tr>
  );
}

export function PurchasingDetailView({
  row,
  lines,
  projects,
  suppliers,
  onRefresh,
}: {
  row: Procurement;
  lines: ProcurementLine[];
  projects: Project[];
  suppliers: Supplier[];
  onRefresh: () => Promise<void>;
}) {
  const [title, setTitle] = useState(row.title);
  const [status, setStatus] = useState(row.status);
  const [supplierId, setSupplierId] = useState(row.supplierId ?? "");
  const [needBy, setNeedBy] = useState(isoToLocal(row.needBy));
  const [sapPo, setSapPo] = useState(row.sapPoNumber ?? "");
  const [headerSaving, setHeaderSaving] = useState(false);
  const [headerErr, setHeaderErr] = useState<string | null>(null);

  const [newPart, setNewPart] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [newQty, setNewQty] = useState("1");
  const [newUnit, setNewUnit] = useState("");
  const [newEst, setNewEst] = useState("");
  const [newOrder, setNewOrder] = useState(() =>
    lines.length ? String(Math.max(...lines.map((l) => l.orderIndex)) + 1) : "0",
  );
  const [newProjectId, setNewProjectId] = useState(lines[0]?.projectId ?? projects[0]?.id ?? "");
  const [newReceivedQty, setNewReceivedQty] = useState("0");
  const [fullyReceivedOverride, setFullyReceivedOverride] = useState(row.fullyReceivedOverride ?? false);
  const [lineAdding, setLineAdding] = useState(false);
  const [lineErr, setLineErr] = useState<string | null>(null);

  useEffect(() => {
    setTitle(row.title);
    setStatus(row.status);
    setSupplierId(row.supplierId ?? "");
    setNeedBy(isoToLocal(row.needBy));
    setSapPo(row.sapPoNumber ?? "");
    setFullyReceivedOverride(row.fullyReceivedOverride ?? false);
  }, [row]);

  useEffect(() => {
    setNewOrder(lines.length ? String(Math.max(...lines.map((l) => l.orderIndex)) + 1) : "0");
  }, [lines]);
  useEffect(() => {
    if (projects.length && !projects.some((p) => p.id === newProjectId)) {
      setNewProjectId(projects[0]!.id);
    }
  }, [projects, newProjectId]);

  return (
    <div className="mx-auto max-w-6xl rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      {headerErr && <p className="mb-2 text-sm text-red-600">{headerErr}</p>}
      <div className="mb-4 grid gap-2 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label className="block text-sm font-medium">Title</label>
          <input className="w-full rounded border px-2 py-1" value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>
        <div>
          <label className="block text-sm font-medium">Supplier</label>
          <select className="w-full rounded border px-2 py-1" value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
            <option value="">(none)</option>
            {suppliers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium">Status</label>
          <select className="w-full rounded border px-2 py-1" value={status} onChange={(e) => setStatus(e.target.value as Procurement["status"])}>
            {PROC_STATUS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium">Need by</label>
          <input type="datetime-local" className="w-full rounded border px-2 py-1" value={needBy} onChange={(e) => setNeedBy(e.target.value)} />
        </div>
        <div>
          <label className="block text-sm font-medium">SAP PO</label>
          <input className="w-full rounded border px-2 py-1" value={sapPo} onChange={(e) => setSapPo(e.target.value)} />
        </div>
        <div className="sm:col-span-2">
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" className="mt-1" checked={fullyReceivedOverride} onChange={(e) => setFullyReceivedOverride(e.target.checked)} />
            <span>
              <span className="font-medium">Fully received (order)</span>
              <span className="block text-xs font-normal text-slate-600">
                Marks the PO closed as fully received even when line quantities do not match.
              </span>
            </span>
          </label>
        </div>
        <div className="sm:col-span-2">
          <button
            type="button"
            className="rounded border bg-slate-900 px-3 py-1.5 text-sm text-white disabled:opacity-50"
            disabled={headerSaving || !title.trim()}
            onClick={() => {
              setHeaderErr(null);
              setHeaderSaving(true);
              void api("/api/procurement/" + row.id, {
                method: "PATCH",
                body: JSON.stringify({
                  title: title.trim(),
                  status,
                  supplierId: supplierId || null,
                  needBy: localToIso(needBy),
                  sapPoNumber: sapPo.trim() || null,
                  fullyReceivedOverride,
                  version: row.version,
                }),
              })
                .then(onRefresh)
                .catch((e: Error) => setHeaderErr(e.message))
                .finally(() => setHeaderSaving(false));
            }}
          >
            Save header
          </button>
        </div>
      </div>

      <h3 className="mb-2 text-sm font-semibold text-slate-800">Line items</h3>
      <div className="mb-4 overflow-x-auto rounded border">
        <table className="w-full min-w-[36rem] border-collapse text-sm">
          <thead>
            <tr className="border-b bg-slate-50 text-left">
              <th className="px-2 py-2 font-medium">Part #</th>
              <th className="px-2 py-2 font-medium">Description</th>
              <th className="px-2 py-2 font-medium">Qty</th>
              <th className="px-2 py-2 font-medium">Unit</th>
              <th className="px-2 py-2 font-medium">Est $</th>
              <th className="px-2 py-2 font-medium">Order</th>
              <th className="px-2 py-2 font-medium">Rcvd qty</th>
              <th className="px-2 py-2 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {lines.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-2 py-3 text-slate-500">
                  No lines yet — add one below.
                </td>
              </tr>
            ) : (
              lines.map((l) => <PurchasingDetailLineRow key={l.id} line={l} onSaved={onRefresh} />)
            )}
          </tbody>
        </table>
      </div>

      {lineErr && <p className="mb-2 text-sm text-red-600">{lineErr}</p>}
      <div className="rounded border border-dashed border-slate-300 bg-slate-50/80 p-3">
        <p className="mb-2 text-sm font-medium text-slate-700">Add line</p>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <label className="block text-xs font-medium text-slate-600">Project</label>
            <select className="w-full rounded border px-2 py-1" value={newProjectId} onChange={(e) => setNewProjectId(e.target.value)}>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600">Part #</label>
            <input className="w-full rounded border px-2 py-1" value={newPart} onChange={(e) => setNewPart(e.target.value)} />
          </div>
          <div className="sm:col-span-2 lg:col-span-3">
            <label className="block text-xs font-medium text-slate-600">Description</label>
            <textarea className="w-full rounded border px-2 py-1" rows={2} value={newDesc} onChange={(e) => setNewDesc(e.target.value)} />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600">Quantity</label>
            <input className="w-full rounded border px-2 py-1" value={newQty} onChange={(e) => setNewQty(e.target.value)} />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600">Unit</label>
            <input className="w-full rounded border px-2 py-1" value={newUnit} onChange={(e) => setNewUnit(e.target.value)} />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600">Est unit price</label>
            <input type="number" className="w-full rounded border px-2 py-1" value={newEst} onChange={(e) => setNewEst(e.target.value)} />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600">Order</label>
            <input type="number" className="w-full rounded border px-2 py-1" value={newOrder} onChange={(e) => setNewOrder(e.target.value)} />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600">Received qty</label>
            <input
              type="number"
              min={0}
              step={1}
              className="w-full rounded border px-2 py-1"
              value={newReceivedQty}
              onChange={(e) => setNewReceivedQty(e.target.value)}
            />
          </div>
        </div>
        <button
          type="button"
          className="mt-2 rounded border bg-slate-800 px-3 py-1.5 text-sm text-white disabled:opacity-50"
          disabled={lineAdding || !newDesc.trim() || !projects.length}
          onClick={() => {
            setLineErr(null);
            setLineAdding(true);
            void api("/api/procurement-lines", {
              method: "POST",
              body: JSON.stringify({
                procurementId: row.id,
                projectId: newProjectId,
                partNumber: newPart.trim() || null,
                description: newDesc.trim(),
                quantity: newQty || "1",
                unit: newUnit.trim() || null,
                estUnitPrice: newEst.trim() ? Number(newEst) : null,
                orderIndex: Number(newOrder) || 0,
                receivedQty: Math.max(0, Math.trunc(Number(newReceivedQty) || 0)),
              }),
            })
              .then(async () => {
                setNewPart("");
                setNewDesc("");
                setNewQty("1");
                setNewUnit("");
                setNewEst("");
                setNewReceivedQty("0");
                await onRefresh();
              })
              .catch((e: Error) => setLineErr(e.message))
              .finally(() => setLineAdding(false));
          }}
        >
          Add line
        </button>
      </div>
    </div>
  );
}
