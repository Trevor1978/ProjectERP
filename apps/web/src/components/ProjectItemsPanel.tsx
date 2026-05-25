import { useCallback, useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import type { ProjectItem, ProjectItemKind, ProjectItemStatus } from "../workspace/projectItemTypes";
import {
  PROJECT_ITEM_KINDS,
  PROJECT_ITEM_STATUSES,
  projectItemStatusLabel,
} from "../workspace/projectItemTypes";

function statusClass(s: ProjectItemStatus): string {
  switch (s) {
    case "received":
      return "bg-emerald-100 text-emerald-800";
    case "partial":
      return "bg-amber-100 text-amber-800";
    case "on_order":
      return "bg-blue-100 text-blue-800";
    case "cancelled":
      return "bg-slate-200 text-slate-600";
    default:
      return "bg-slate-100 text-slate-700";
  }
}

export function ProjectItemsPanel({ projectId }: { projectId: string }) {
  const qc = useQueryClient();
  const queryKey = ["project-items", projectId] as const;
  const { data, isLoading } = useQuery({
    queryKey,
    queryFn: () => api<{ items: ProjectItem[] }>(`/api/projects/${projectId}/items`),
  });

  const items = data?.items ?? [];
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [newKind, setNewKind] = useState<ProjectItemKind>("hardware");
  const [newPart, setNewPart] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [newQty, setNewQty] = useState("1");
  const [newUnit, setNewUnit] = useState("");

  const refresh = useCallback(() => {
    return qc.invalidateQueries({ queryKey });
  }, [qc, queryKey]);

  async function addItem() {
    setErr(null);
    setBusy(true);
    try {
      const maxOrder = items.length ? Math.max(...items.map((i) => i.orderIndex)) + 1 : 0;
      await api("/api/project-items", {
        method: "POST",
        body: JSON.stringify({
          projectId,
          kind: newKind,
          partNumber: newPart.trim() || null,
          description: newDesc.trim(),
          quantity: newQty.trim() || "1",
          unit: newUnit.trim() || null,
          orderIndex: maxOrder,
        }),
      });
      setNewPart("");
      setNewDesc("");
      setNewQty("1");
      setNewUnit("");
      await refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to add item");
    } finally {
      setBusy(false);
    }
  }

  async function removeItem(item: ProjectItem) {
    if (!window.confirm(`Remove item "${item.description}"?`)) return;
    setBusy(true);
    try {
      await api(`/api/project-items/${item.id}`, { method: "DELETE", body: "{}" });
      await refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to remove");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="mt-8">
      <h2 className="mb-1 text-lg font-semibold text-slate-800">Items</h2>
      <p className="mb-3 text-sm text-slate-600">
        Hardware and software required for this project. Items can exist before they appear on a
        purchase order; add them to purchasing from the PO detail page.
      </p>
      {err && <p className="mb-2 text-sm text-red-600">{err}</p>}
      {isLoading ? (
        <p className="text-sm text-slate-500">Loading items…</p>
      ) : items.length === 0 ? (
        <p className="mb-3 text-sm text-slate-500">No items yet — add one below.</p>
      ) : (
        <div className="mb-4 overflow-x-auto rounded-lg border border-slate-200 bg-white">
          <table className="w-full min-w-[36rem] border-collapse text-sm">
            <thead>
              <tr className="border-b bg-slate-50 text-left">
                <th className="px-2 py-2 font-medium">Kind</th>
                <th className="px-2 py-2 font-medium">Part #</th>
                <th className="px-2 py-2 font-medium">Description</th>
                <th className="px-2 py-2 font-medium text-right">Qty</th>
                <th className="px-2 py-2 font-medium">Status</th>
                <th className="px-2 py-2 font-medium text-right">On POs</th>
                <th className="px-2 py-2 font-medium" />
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <ProjectItemRow
                  key={item.id}
                  item={item}
                  disabled={busy}
                  onSaved={refresh}
                  onRemove={() => void removeItem(item)}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="max-w-3xl rounded-lg border border-dashed border-slate-300 bg-slate-50/80 p-3">
        <p className="mb-2 text-sm font-medium text-slate-700">Add item</p>
        <div className="grid gap-2 sm:grid-cols-2">
          <div>
            <label htmlFor="new-item-kind" className="block text-xs font-medium text-slate-600">
              Kind
            </label>
            <select
              id="new-item-kind"
              className="mt-1 w-full rounded border border-slate-300 bg-white px-2 py-1.5 text-sm"
              value={newKind}
              onChange={(e) => setNewKind(e.target.value as ProjectItemKind)}
            >
              {PROJECT_ITEM_KINDS.map((k) => (
                <option key={k} value={k}>
                  {k}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="new-item-part" className="block text-xs font-medium text-slate-600">
              Part #
            </label>
            <input
              id="new-item-part"
              className="mt-1 w-full rounded border border-slate-300 bg-white px-2 py-1.5 text-sm"
              value={newPart}
              onChange={(e) => setNewPart(e.target.value)}
            />
          </div>
          <div className="sm:col-span-2">
            <label htmlFor="new-item-desc" className="block text-xs font-medium text-slate-600">
              Description
            </label>
            <input
              id="new-item-desc"
              className="mt-1 w-full rounded border border-slate-300 bg-white px-2 py-1.5 text-sm"
              value={newDesc}
              onChange={(e) => setNewDesc(e.target.value)}
            />
          </div>
          <div>
            <label htmlFor="new-item-qty" className="block text-xs font-medium text-slate-600">
              Quantity
            </label>
            <input
              id="new-item-qty"
              className="mt-1 w-full rounded border border-slate-300 bg-white px-2 py-1.5 text-sm"
              value={newQty}
              onChange={(e) => setNewQty(e.target.value)}
            />
          </div>
          <div>
            <label htmlFor="new-item-unit" className="block text-xs font-medium text-slate-600">
              Unit
            </label>
            <input
              id="new-item-unit"
              className="mt-1 w-full rounded border border-slate-300 bg-white px-2 py-1.5 text-sm"
              value={newUnit}
              onChange={(e) => setNewUnit(e.target.value)}
            />
          </div>
        </div>
        <button
          type="button"
          disabled={busy || !newDesc.trim()}
          className="mt-3 rounded border bg-slate-900 px-3 py-1.5 text-sm text-white disabled:opacity-50"
          onClick={() => void addItem()}
        >
          {busy ? "…" : "Add item"}
        </button>
      </div>
    </section>
  );
}

function ProjectItemRow({
  item,
  disabled,
  onSaved,
  onRemove,
}: {
  item: ProjectItem;
  disabled: boolean;
  onSaved: () => Promise<void>;
  onRemove: () => void;
}) {
  const [kind, setKind] = useState(item.kind);
  const [partNumber, setPartNumber] = useState(item.partNumber ?? "");
  const [description, setDescription] = useState(item.description);
  const [quantity, setQuantity] = useState(item.quantity);
  const [unit, setUnit] = useState(item.unit ?? "");
  const [status, setStatus] = useState(item.status);
  const [version, setVersion] = useState(item.version);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setKind(item.kind);
    setPartNumber(item.partNumber ?? "");
    setDescription(item.description);
    setQuantity(item.quantity);
    setUnit(item.unit ?? "");
    setStatus(item.status);
    setVersion(item.version);
  }, [item.id, item.version]);

  const save = async (overrides?: Partial<{
    kind: ProjectItemKind;
    status: ProjectItemStatus;
  }>) => {
    setSaving(true);
    try {
      const res = await api<{ item: ProjectItem }>(`/api/project-items/${item.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          kind: overrides?.kind ?? kind,
          partNumber: partNumber.trim() || null,
          description: description.trim(),
          quantity: quantity.trim() || "1",
          unit: unit.trim() || null,
          status: overrides?.status ?? status,
          version,
        }),
      });
      setVersion(res.item.version);
      await onSaved();
    } finally {
      setSaving(false);
    }
  };

  return (
    <tr className="border-b border-slate-100">
      <td className="px-2 py-1.5">
        <select
          className="w-full min-w-[5rem] rounded border border-slate-200 px-1 py-0.5 text-sm"
          value={kind}
          disabled={disabled || saving}
          onChange={(e) => {
            const k = e.target.value as ProjectItemKind;
            setKind(k);
            void save({ kind: k });
          }}
        >
          {PROJECT_ITEM_KINDS.map((k) => (
            <option key={k} value={k}>
              {k}
            </option>
          ))}
        </select>
      </td>
      <td className="px-2 py-1.5">
        <input
          className="w-full min-w-[4rem] rounded border border-slate-200 px-1 py-0.5 text-sm"
          value={partNumber}
          disabled={disabled || saving}
          onChange={(e) => setPartNumber(e.target.value)}
          onBlur={() => void save()}
        />
      </td>
      <td className="px-2 py-1.5">
        <input
          className="w-full min-w-[8rem] rounded border border-slate-200 px-1 py-0.5 text-sm"
          value={description}
          disabled={disabled || saving}
          onChange={(e) => setDescription(e.target.value)}
          onBlur={() => void save()}
        />
      </td>
      <td className="px-2 py-1.5 text-right">
        <input
          className="w-16 rounded border border-slate-200 px-1 py-0.5 text-right text-sm"
          value={quantity}
          disabled={disabled || saving}
          onChange={(e) => setQuantity(e.target.value)}
          onBlur={() => void save()}
        />
        {item.unit ? (
          <span className="ml-1 text-xs text-slate-500">{item.unit}</span>
        ) : (
          <input
            className="ml-1 w-12 rounded border border-slate-200 px-1 py-0.5 text-sm"
            placeholder="unit"
            value={unit}
            disabled={disabled || saving}
            onChange={(e) => setUnit(e.target.value)}
            onBlur={() => void save()}
          />
        )}
      </td>
      <td className="px-2 py-1.5">
        <select
          className={`rounded px-1.5 py-0.5 text-xs font-medium ${statusClass(status)}`}
          value={status}
          disabled={disabled || saving}
          onChange={(e) => {
            const s = e.target.value as ProjectItemStatus;
            setStatus(s);
            void save({ status: s });
          }}
        >
          {PROJECT_ITEM_STATUSES.map((s) => (
            <option key={s} value={s}>
              {projectItemStatusLabel(s)}
            </option>
          ))}
        </select>
      </td>
      <td className="px-2 py-1.5 text-right tabular-nums text-slate-600">
        {item.linkedLineCount ?? 0}
        {(item.receivedTotal ?? 0) > 0 && (
          <span className="block text-xs">
            rcv {item.receivedTotal}/{item.orderedTotal ?? "—"}
          </span>
        )}
      </td>
      <td className="px-2 py-1.5">
        <button
          type="button"
          className="text-xs text-red-600 hover:underline disabled:opacity-50"
          disabled={disabled || saving}
          onClick={onRemove}
        >
          Remove
        </button>
      </td>
    </tr>
  );
}
