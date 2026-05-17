import { useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import { api } from "../../lib/api";
import { WorkspaceDetailChrome } from "./WorkspaceDetailChrome";
import type { ProcurementLine } from "../../workspace/purchasingTypes";

type Project = { id: string; name: string; version: number };

export function WorkspacePurchasingLineDetailPage() {
  const { lineId } = useParams<{ lineId: string }>();
  const qc = useQueryClient();
  const { data: procData } = useQuery({
    queryKey: ["proc-all"],
    queryFn: () => api<{ procurement: { id: string; title: string }[]; lines: ProcurementLine[] }>("/api/procurement"),
  });
  const { data: projectsData } = useQuery({
    queryKey: ["projects"],
    queryFn: () => api<{ projects: Project[] }>("/api/projects"),
  });

  const line = procData?.lines.find((l) => l.id === lineId);
  const parent = procData?.procurement.find((p) => p.id === line?.procurementId);
  const projects = projectsData?.projects ?? [];

  const [projectId, setProjectId] = useState("");
  const [partNumber, setPartNumber] = useState("");
  const [description, setDescription] = useState("");
  const [quantity, setQuantity] = useState("");
  const [orderedQty, setOrderedQty] = useState("");
  const [unit, setUnit] = useState("");
  const [estUnitPrice, setEstUnitPrice] = useState("");
  const [orderIndex, setOrderIndex] = useState("0");
  const [receivedQty, setReceivedQty] = useState("0");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!line) return;
    setProjectId(line.projectId);
    setPartNumber(line.partNumber ?? "");
    setDescription(line.description);
    setQuantity(line.quantity);
    setOrderedQty(line.orderedQty ?? "");
    setUnit(line.unit ?? "");
    setEstUnitPrice(line.estUnitPrice == null ? "" : String(line.estUnitPrice));
    setOrderIndex(String(line.orderIndex));
    setReceivedQty(String(line.receivedQty));
  }, [line]);

  async function refresh() {
    await qc.invalidateQueries({ queryKey: ["proc-all"] });
  }

  if (!lineId) return null;
  if (!procData) return <p className="text-slate-500">Loading…</p>;
  if (!line) {
    return (
      <WorkspaceDetailChrome backTo="/workspace/purchasing-lines" backLabel="← Purchasing lines" title="Not found">
        <p className="text-slate-600">Line not found.</p>
      </WorkspaceDetailChrome>
    );
  }

  const back = parent ? `/workspace/purchasing/${parent.id}` : "/workspace/purchasing-lines";

  return (
    <WorkspaceDetailChrome backTo={back} backLabel={parent ? `← ${parent.title}` : "← Purchasing lines"} title="Purchasing line">
      {parent && (
        <p className="text-sm text-slate-600">
          Purchasing:{" "}
          <Link to={`/workspace/purchasing/${parent.id}`} className="text-blue-700 underline">
            {parent.title}
          </Link>
        </p>
      )}

      {err && <p className="text-sm text-red-600">{err}</p>}
      <div className="grid max-w-xl gap-3 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <div>
          <label className="block text-sm font-medium">Project</label>
          <select className="mt-1 w-full rounded border px-2 py-1.5" value={projectId} onChange={(e) => setProjectId(e.target.value)}>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium">Part #</label>
          <input className="mt-1 w-full rounded border px-2 py-1.5" value={partNumber} onChange={(e) => setPartNumber(e.target.value)} />
        </div>
        <div>
          <label className="block text-sm font-medium">Description</label>
          <textarea className="mt-1 w-full rounded border px-2 py-1.5" rows={3} value={description} onChange={(e) => setDescription(e.target.value)} />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="block text-sm font-medium">Qty (requested)</label>
            <input className="mt-1 w-full rounded border px-2 py-1.5" value={quantity} onChange={(e) => setQuantity(e.target.value)} />
          </div>
          <div>
            <label className="block text-sm font-medium">Ordered</label>
            <input className="mt-1 w-full rounded border px-2 py-1.5" value={orderedQty} onChange={(e) => setOrderedQty(e.target.value)} placeholder="Optional" />
          </div>
          <div>
            <label className="block text-sm font-medium">Unit</label>
            <input className="mt-1 w-full rounded border px-2 py-1.5" value={unit} onChange={(e) => setUnit(e.target.value)} />
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="block text-sm font-medium">Est unit price</label>
            <input type="number" className="mt-1 w-full rounded border px-2 py-1.5" value={estUnitPrice} onChange={(e) => setEstUnitPrice(e.target.value)} />
          </div>
          <div>
            <label className="block text-sm font-medium">Order</label>
            <input type="number" className="mt-1 w-full rounded border px-2 py-1.5" value={orderIndex} onChange={(e) => setOrderIndex(e.target.value)} />
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium">Received qty</label>
          <input type="number" min={0} step={1} className="mt-1 w-full rounded border px-2 py-1.5" value={receivedQty} onChange={(e) => setReceivedQty(e.target.value)} />
        </div>
        <button
          type="button"
          disabled={saving || !description.trim()}
          className="w-fit rounded border bg-slate-900 px-3 py-1.5 text-sm text-white disabled:opacity-50"
          onClick={() => {
            setErr(null);
            setSaving(true);
            void api("/api/procurement-lines/" + line.id, {
              method: "PATCH",
              body: JSON.stringify({
                projectId,
                partNumber: partNumber.trim() || null,
                description: description.trim(),
                quantity: quantity || "1",
                orderedQty: orderedQty.trim() || null,
                unit: unit.trim() || null,
                estUnitPrice: estUnitPrice.trim() ? Number(estUnitPrice) : null,
                orderIndex: Number(orderIndex) || 0,
                receivedQty: Math.max(0, Math.trunc(Number(receivedQty) || 0)),
                version: line.version,
              }),
            })
              .then(refresh)
              .catch((e: Error) => setErr(e.message))
              .finally(() => setSaving(false));
          }}
        >
          Save line
        </button>
      </div>
    </WorkspaceDetailChrome>
  );
}
