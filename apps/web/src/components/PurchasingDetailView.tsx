import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "../lib/api";
import { openProcurementPdfReport } from "../lib/procurementReport";
import { useDebouncedPatch } from "../hooks/useDebouncedPatch";
import { isoToLocal, localToIso } from "../workspace/workspaceDates";
import { Link } from "react-router-dom";
import type { Procurement, ProcurementLine } from "../workspace/purchasingTypes";
import type { OrgProfile } from "../workspace/orgProfileTypes";
import { PROC_STATUS } from "../workspace/purchasingTypes";
import {
  calcProcurementTotals,
  procurementLineRowClass,
} from "../workspace/procurementLineStatus";

type Project = { id: string; name: string };
type Supplier = { id: string; name: string };

function money(n: number): string {
  return n.toLocaleString(undefined, { style: "currency", currency: "AUD" });
}

function PurchasingDetailLineRow({
  line,
  projects,
  procStatus,
  needBy,
  fullyReceivedOverride,
  onLineSaved,
  onRemoved,
}: {
  line: ProcurementLine;
  projects: Project[];
  procStatus: Procurement["status"];
  needBy: string | null;
  fullyReceivedOverride: boolean;
  onLineSaved: (line: ProcurementLine) => void;
  onRemoved: (lineId: string) => void;
}) {
  const [partNumber, setPartNumber] = useState(line.partNumber ?? "");
  const [description, setDescription] = useState(line.description);
  const [projectId, setProjectId] = useState(line.projectId);
  const [quantity, setQuantity] = useState(line.quantity);
  const [orderedQty, setOrderedQty] = useState(line.orderedQty ?? "");
  const [unit, setUnit] = useState(line.unit ?? "");
  const [estUnitPrice, setEstUnitPrice] = useState(line.estUnitPrice == null ? "" : String(line.estUnitPrice));
  const [receivedQty, setReceivedQty] = useState(String(line.receivedQty));
  const [version, setVersion] = useState(line.version);
  const [removing, setRemoving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const syncedVersion = useRef(line.version);

  useEffect(() => {
    if (line.version === syncedVersion.current) return;
    syncedVersion.current = line.version;
    setPartNumber(line.partNumber ?? "");
    setDescription(line.description);
    setProjectId(line.projectId);
    setQuantity(line.quantity);
    setOrderedQty(line.orderedQty ?? "");
    setUnit(line.unit ?? "");
    setEstUnitPrice(line.estUnitPrice == null ? "" : String(line.estUnitPrice));
    setReceivedQty(String(line.receivedQty));
    setVersion(line.version);
  }, [line]);

  const patchBody = useMemo(
    () => ({
      partNumber: partNumber.trim() || null,
      description: description.trim(),
      projectId,
      quantity: quantity || "1",
      orderedQty: orderedQty.trim() || null,
      unit: unit.trim() || null,
      estUnitPrice: estUnitPrice.trim() ? Number(estUnitPrice) : null,
      receivedQty: Math.max(0, Math.trunc(Number(receivedQty) || 0)),
      version,
    }),
    [partNumber, description, projectId, quantity, orderedQty, unit, estUnitPrice, receivedQty, version],
  );

  const save = useCallback(
    async (body: typeof patchBody) => {
      const res = await api<{ line: ProcurementLine }>("/api/procurement-lines/" + line.id, {
        method: "PATCH",
        body: JSON.stringify(body),
      });
      setVersion(res.line.version);
      syncedVersion.current = res.line.version;
      onLineSaved(res.line);
      return { version: res.line.version };
    },
    [line.id, onLineSaved],
  );

  useDebouncedPatch({
    enabled: Boolean(description.trim()),
    payload: patchBody,
    save,
    onVersion: setVersion,
  });

  const rowClass = procurementLineRowClass(
    {
      quantity,
      orderedQty: orderedQty.trim() || null,
      receivedQty: Number(receivedQty) || 0,
    },
    { needBy, fullyReceivedOverride, procStatus },
  );

  return (
    <tr className={`border-b align-top ${rowClass}`}>
      <td className="py-1 pr-2">
        <input
          className="w-full min-w-[6rem] rounded border border-tesla-border px-2 py-1"
          value={partNumber}
          onChange={(e) => setPartNumber(e.target.value)}
          placeholder="Part #"
        />
      </td>
      <td className="py-1 pr-2">
        {err && <p className="mb-1 text-xs text-red-600">{err}</p>}
        <textarea
          className="w-full min-w-[12rem] rounded border border-tesla-border px-2 py-1"
          rows={2}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </td>
      <td className="py-1 pr-2">
        <select
          className="w-full min-w-[8rem] rounded border border-tesla-border px-2 py-1"
          value={projectId}
          onChange={(e) => setProjectId(e.target.value)}
        >
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </td>
      <td className="py-1 pr-2">
        <input className="w-16 rounded border border-tesla-border px-2 py-1" value={unit} onChange={(e) => setUnit(e.target.value)} />
      </td>
      <td className="py-1 pr-2">
        <input
          type="number"
          className="w-24 rounded border border-tesla-border px-2 py-1"
          value={estUnitPrice}
          onChange={(e) => setEstUnitPrice(e.target.value)}
        />
      </td>
      <td className="py-1 pr-2">
        <input className="w-20 rounded border border-tesla-border px-2 py-1" value={quantity} onChange={(e) => setQuantity(e.target.value)} />
      </td>
      <td className="py-1 pr-2">
        <input
          className="w-20 rounded border border-tesla-border px-2 py-1 tabular-nums"
          value={orderedQty}
          onChange={(e) => setOrderedQty(e.target.value)}
          placeholder="—"
        />
      </td>
      <td className="py-1 pr-2">
        <input
          type="number"
          min={0}
          step={1}
          className="w-20 rounded border border-tesla-border px-2 py-1"
          value={receivedQty}
          onChange={(e) => setReceivedQty(e.target.value)}
        />
      </td>
      <td className="py-1 whitespace-nowrap">
        <button
          type="button"
          className="rounded border border-red-200 px-2 py-1 text-xs text-red-700 disabled:opacity-50"
          disabled={removing}
          onClick={() => {
            if (!window.confirm("Remove this line?")) return;
            setErr(null);
            setRemoving(true);
            void api("/api/procurement-lines/" + line.id, { method: "DELETE" })
              .then(() => onRemoved(line.id))
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
  orgName,
  orgProfile,
  isOrgAdmin,
  onHeaderSaved,
  onLineSaved,
  onLineAdded,
  onLineRemoved,
}: {
  row: Procurement;
  lines: ProcurementLine[];
  projects: Project[];
  suppliers: Supplier[];
  orgName: string;
  orgProfile?: OrgProfile | null;
  isOrgAdmin?: boolean;
  onHeaderSaved: (procurement: Procurement) => void;
  onLineSaved: (line: ProcurementLine) => void;
  onLineAdded: (line: ProcurementLine) => void;
  onLineRemoved: (lineId: string) => void;
}) {
  const [reportOpening, setReportOpening] = useState(false);
  const [title, setTitle] = useState(row.title);
  const [status, setStatus] = useState(row.status);
  const [supplierId, setSupplierId] = useState(row.supplierId ?? "");
  const [needBy, setNeedBy] = useState(isoToLocal(row.needBy));
  const [sapPo, setSapPo] = useState(row.sapPoNumber ?? "");
  const [headerVersion, setHeaderVersion] = useState(row.version);
  const [headerErr, setHeaderErr] = useState<string | null>(null);

  const [newPart, setNewPart] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [newQty, setNewQty] = useState("1");
  const [newOrderedQty, setNewOrderedQty] = useState("");
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

  const supplier = suppliers.find((s) => s.id === row.supplierId);
  const totals = useMemo(() => calcProcurementTotals(lines), [lines]);

  const procurementId = row.id;
  const headerSyncedVersion = useRef(row.version);

  useEffect(() => {
    setTitle(row.title);
    setStatus(row.status);
    setSupplierId(row.supplierId ?? "");
    setNeedBy(isoToLocal(row.needBy));
    setSapPo(row.sapPoNumber ?? "");
    setFullyReceivedOverride(row.fullyReceivedOverride ?? false);
    setHeaderVersion(row.version);
    headerSyncedVersion.current = row.version;
  }, [procurementId]);

  const headerPayload = useMemo(
    () => ({
      title: title.trim(),
      status,
      supplierId: supplierId || null,
      needBy: localToIso(needBy),
      sapPoNumber: sapPo.trim() || null,
      fullyReceivedOverride,
      version: headerVersion,
    }),
    [title, status, supplierId, needBy, sapPo, fullyReceivedOverride, headerVersion],
  );

  const saveHeader = useCallback(
    async (body: typeof headerPayload) => {
      try {
        const res = await api<{ procurement: Procurement }>("/api/procurement/" + row.id, {
          method: "PATCH",
          body: JSON.stringify(body),
        });
        const p = res.procurement;
        setHeaderVersion(p.version);
        headerSyncedVersion.current = p.version;
        setTitle(p.title);
        setStatus(p.status);
        setSupplierId(p.supplierId ?? "");
        setSapPo(p.sapPoNumber ?? "");
        setFullyReceivedOverride(p.fullyReceivedOverride ?? false);
        setHeaderErr(null);
        onHeaderSaved(p);
        return { version: p.version };
      } catch (e) {
        setHeaderErr(e instanceof Error ? e.message : "Save failed");
        throw e;
      }
    },
    [row.id, onHeaderSaved],
  );

  useDebouncedPatch({
    enabled: Boolean(title.trim()),
    payload: headerPayload,
    save: saveHeader,
    onVersion: setHeaderVersion,
  });

  useEffect(() => {
    setNewOrder(lines.length ? String(Math.max(...lines.map((l) => l.orderIndex)) + 1) : "0");
  }, [lines]);
  useEffect(() => {
    if (projects.length && !projects.some((p) => p.id === newProjectId)) {
      setNewProjectId(projects[0]!.id);
    }
  }, [projects, newProjectId]);

  return (
    <div className="mx-auto max-w-6xl rounded-lg border border-tesla-border bg-white p-4 shadow-sm">
      {headerErr && <p className="mb-2 text-sm text-red-600">{headerErr}</p>}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-medium tracking-tight text-tesla-text">Purchasing order</h2>
        <div className="flex flex-wrap items-center gap-2">
          {isOrgAdmin && (
            <Link
              to="/workspace/organization"
              className="text-sm text-tesla-text-secondary underline hover:text-tesla-text"
            >
              Organization details
            </Link>
          )}
          <button
            type="button"
            disabled={reportOpening}
            className="rounded-sm border border-tesla-border bg-white px-3 py-1.5 text-sm font-medium text-tesla-text hover:bg-tesla-muted disabled:opacity-60"
            title="Opens the RFQ/PO report in a new tab. Use Print → Save as PDF when ready."
            onClick={() => {
              setReportOpening(true);
              void openProcurementPdfReport({
                row,
                lines,
                supplier: supplier ?? null,
                projects,
                orgName,
                orgProfile,
              }).finally(() => setReportOpening(false));
            }}
          >
            {reportOpening ? "Opening…" : "RFQ / PO report"}
          </button>
        </div>
      </div>
      <div className="mb-4 grid gap-2 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label className="block text-sm font-medium text-tesla-text-secondary">Title</label>
          <input className="mt-1 w-full rounded-sm border border-tesla-border px-2 py-1" value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>
        <div>
          <label className="block text-sm font-medium text-tesla-text-secondary">Supplier</label>
          <select className="mt-1 w-full rounded-sm border border-tesla-border px-2 py-1" value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
            <option value="">(none)</option>
            {suppliers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-tesla-text-secondary">Status</label>
          <select className="mt-1 w-full rounded-sm border border-tesla-border px-2 py-1" value={status} onChange={(e) => setStatus(e.target.value as Procurement["status"])}>
            {PROC_STATUS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-tesla-text-secondary">Need by</label>
          <input type="datetime-local" className="mt-1 w-full rounded-sm border border-tesla-border px-2 py-1" value={needBy} onChange={(e) => setNeedBy(e.target.value)} />
        </div>
        <div>
          <label className="block text-sm font-medium text-tesla-text-secondary">SAP PO</label>
          <input className="mt-1 w-full rounded-sm border border-tesla-border px-2 py-1" value={sapPo} onChange={(e) => setSapPo(e.target.value)} />
        </div>
        <div className="sm:col-span-2">
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" className="mt-1" checked={fullyReceivedOverride} onChange={(e) => setFullyReceivedOverride(e.target.checked)} />
            <span>
              <span className="font-medium text-tesla-text">Fully received (order)</span>
              <span className="block text-xs font-normal text-tesla-text-secondary">
                Marks the PO closed as fully received even when line quantities do not match.
              </span>
            </span>
          </label>
        </div>
        <p className="sm:col-span-2 text-xs text-tesla-text-secondary">Header saves automatically.</p>
      </div>

      <div className="mb-4 flex flex-wrap justify-end gap-6 rounded-sm border border-tesla-border bg-tesla-muted/50 px-4 py-3 text-sm">
        <div>
          <span className="text-tesla-text-secondary">Subtotal (ex GST)</span>
          <p className="font-medium tabular-nums text-tesla-text">{money(totals.subtotal)}</p>
        </div>
        <div>
          <span className="text-tesla-text-secondary">GST (10%)</span>
          <p className="font-medium tabular-nums text-tesla-text">{money(totals.gst)}</p>
        </div>
        <div>
          <span className="text-tesla-text-secondary">Total</span>
          <p className="text-base font-semibold tabular-nums text-tesla-text">{money(totals.total)}</p>
        </div>
      </div>

      <h3 className="mb-2 text-sm font-semibold text-tesla-text">Line items</h3>
      <p className="mb-2 text-xs text-tesla-text-secondary">
        Changes save automatically. Green = received, amber = partial, red = overdue. Use{" "}
        <strong>RFQ / PO report</strong> above to open the order in a new tab (Print → Save as PDF when ready).
      </p>
      <div className="mb-4 overflow-x-auto rounded-sm border border-tesla-border">
        <table className="w-full min-w-[42rem] border-collapse text-sm">
          <thead>
            <tr className="border-b bg-tesla-muted text-left">
              <th className="px-2 py-2 font-medium">Part #</th>
              <th className="px-2 py-2 font-medium">Description</th>
              <th className="px-2 py-2 font-medium">Project</th>
              <th className="px-2 py-2 font-medium">Unit</th>
              <th className="px-2 py-2 font-medium">Est $</th>
              <th className="px-2 py-2 font-medium">Qty</th>
              <th className="px-2 py-2 font-medium">Ordered</th>
              <th className="px-2 py-2 font-medium">Received</th>
              <th className="px-2 py-2 font-medium" />
            </tr>
          </thead>
          <tbody>
            {lines.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-2 py-3 text-tesla-text-secondary">
                  No lines yet — add one below.
                </td>
              </tr>
            ) : (
              lines.map((l) => (
                <PurchasingDetailLineRow
                  key={l.id}
                  line={l}
                  projects={projects}
                  procStatus={status}
                  needBy={row.needBy}
                  fullyReceivedOverride={fullyReceivedOverride}
                  onLineSaved={onLineSaved}
                  onRemoved={onLineRemoved}
                />
              ))
            )}
          </tbody>
        </table>
      </div>

      {lineErr && <p className="mb-2 text-sm text-red-600">{lineErr}</p>}
      <div className="rounded-sm border border-dashed border-tesla-border bg-tesla-muted/30 p-3">
        <p className="mb-2 text-sm font-medium text-tesla-text">Add line</p>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <label className="block text-xs font-medium text-tesla-text-secondary">Project</label>
            <select className="w-full rounded-sm border border-tesla-border px-2 py-1" value={newProjectId} onChange={(e) => setNewProjectId(e.target.value)}>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-tesla-text-secondary">Part #</label>
            <input className="w-full rounded-sm border border-tesla-border px-2 py-1" value={newPart} onChange={(e) => setNewPart(e.target.value)} />
          </div>
          <div className="sm:col-span-2 lg:col-span-3">
            <label className="block text-xs font-medium text-tesla-text-secondary">Description</label>
            <textarea className="w-full rounded-sm border border-tesla-border px-2 py-1" rows={2} value={newDesc} onChange={(e) => setNewDesc(e.target.value)} />
          </div>
          <div>
            <label className="block text-xs font-medium text-tesla-text-secondary">Qty</label>
            <input className="w-full rounded-sm border border-tesla-border px-2 py-1" value={newQty} onChange={(e) => setNewQty(e.target.value)} />
          </div>
          <div>
            <label className="block text-xs font-medium text-tesla-text-secondary">Ordered</label>
            <input
              className="w-full rounded-sm border border-tesla-border px-2 py-1"
              value={newOrderedQty}
              onChange={(e) => setNewOrderedQty(e.target.value)}
              placeholder="Optional"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-tesla-text-secondary">Unit</label>
            <input className="w-full rounded-sm border border-tesla-border px-2 py-1" value={newUnit} onChange={(e) => setNewUnit(e.target.value)} />
          </div>
          <div>
            <label className="block text-xs font-medium text-tesla-text-secondary">Est unit price</label>
            <input type="number" className="w-full rounded-sm border border-tesla-border px-2 py-1" value={newEst} onChange={(e) => setNewEst(e.target.value)} />
          </div>
          <div>
            <label className="block text-xs font-medium text-tesla-text-secondary">Received</label>
            <input
              type="number"
              min={0}
              step={1}
              className="w-full rounded-sm border border-tesla-border px-2 py-1"
              value={newReceivedQty}
              onChange={(e) => setNewReceivedQty(e.target.value)}
            />
          </div>
        </div>
        <button
          type="button"
          className="mt-2 rounded-sm bg-tesla-text px-3 py-1.5 text-sm text-white disabled:opacity-50"
          disabled={lineAdding || !newDesc.trim() || !projects.length}
          onClick={() => {
            setLineErr(null);
            setLineAdding(true);
            void api<{ line: ProcurementLine }>("/api/procurement-lines", {
              method: "POST",
              body: JSON.stringify({
                procurementId: row.id,
                projectId: newProjectId,
                partNumber: newPart.trim() || null,
                description: newDesc.trim(),
                quantity: newQty || "1",
                orderedQty: newOrderedQty.trim() || null,
                unit: newUnit.trim() || null,
                estUnitPrice: newEst.trim() ? Number(newEst) : null,
                orderIndex: Number(newOrder) || 0,
                receivedQty: Math.max(0, Math.trunc(Number(newReceivedQty) || 0)),
              }),
            })
              .then((res) => {
                setNewPart("");
                setNewDesc("");
                setNewQty("1");
                setNewOrderedQty("");
                setNewUnit("");
                setNewEst("");
                setNewReceivedQty("0");
                onLineAdded(res.line);
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
