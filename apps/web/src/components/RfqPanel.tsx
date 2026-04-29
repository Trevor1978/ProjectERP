import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, useMemo } from "react";
import { api } from "../lib/api";

type Line = {
  id: string;
  procurementId: string;
  description: string;
  quantity: string;
  version: number;
};

type RFQ = {
  id: string;
  title: string;
  status: string;
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
  const [title, setTitle] = useState("");
  const [newTitle, setNewTitle] = useState("");
  const [newQty, setNewQty] = useState("1");
  const [newLineFor, setNewLineFor] = useState<string | null>(null);

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
      }),
    });
    setTitle("");
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
      <div className="flex gap-2 items-end">
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
      <ul className="space-y-4">
        {data?.procurement.map((p) => {
          const lines = linesByPr[p.id] ?? [];
          return (
            <li key={p.id} className="bg-white border rounded p-3 space-y-2">
              <div className="font-medium">{p.title}</div>
              <div className="text-xs text-slate-500">
                Status: {p.status}
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
                <ul className="text-sm list-disc pl-4 space-y-0.5">
                  {lines.map((l) => (
                    <li key={l.id}>
                      {l.description} · qty {l.quantity}
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
