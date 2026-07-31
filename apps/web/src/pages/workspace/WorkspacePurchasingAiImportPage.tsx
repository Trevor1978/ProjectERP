import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api, apiForm } from "../../lib/api";
import { QuickCreateSelect } from "../../components/QuickCreateSelect";
import { WorkspaceDetailChrome } from "./WorkspaceDetailChrome";
import { PROC_STATUS, type Procurement } from "../../workspace/purchasingTypes";

type ProcStatus = (typeof PROC_STATUS)[number];

type DraftLine = {
  partNumber: string | null;
  description: string;
  quantity: string;
  orderedQty: string | null;
  unit: string | null;
  estUnitPrice: string | null;
  projectId: string | null;
};

type Draft = {
  documentType?: "po" | "tax_invoice" | "other";
  title: string;
  supplierId: string | null;
  supplierNameRaw: string | null;
  status: ProcStatus;
  needBy: string | null;
  sapPoNumber: string | null;
  confidenceNotes: string | null;
  lines: DraftLine[];
};

type Supplier = { id: string; name: string };
type Project = { id: string; name: string; code: string | null };

const selectClass =
  "mt-1 w-full rounded-sm border border-tesla-border bg-white px-2 py-1.5 text-sm";
const inputClass =
  "mt-1 w-full rounded-sm border border-tesla-border px-2 py-1.5 text-sm";
const labelClass = "block text-xs font-medium text-tesla-text-secondary";
const cellInput =
  "w-full min-w-[4rem] rounded border border-slate-200 px-1.5 py-1 text-sm";

function emptyLine(defaultProjectId: string): DraftLine {
  return {
    partNumber: null,
    description: "",
    quantity: "1",
    orderedQty: null,
    unit: null,
    estUnitPrice: null,
    projectId: defaultProjectId || null,
  };
}

export function WorkspacePurchasingAiImportPage() {
  const nav = useNavigate();
  const [step, setStep] = useState<"entry" | "review">("entry");
  const [file, setFile] = useState<File | null>(null);
  const [notes, setNotes] = useState("");
  const [hintProjectId, setHintProjectId] = useState("");
  const [parsing, setParsing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);

  const { data: suppliersData } = useQuery({
    queryKey: ["suppliers"],
    queryFn: () => api<{ suppliers: Supplier[] }>("/api/suppliers"),
  });
  const { data: projectsData } = useQuery({
    queryKey: ["projects"],
    queryFn: () => api<{ projects: Project[] }>("/api/projects"),
  });

  const suppliers = suppliersData?.suppliers ?? [];
  const projects = projectsData?.projects ?? [];

  const canConfirm = useMemo(() => {
    if (!draft?.title.trim()) return false;
    if (!draft.lines.length) return false;
    return draft.lines.every(
      (l) => l.description.trim() && l.projectId && l.quantity.trim(),
    );
  }, [draft]);

  async function analyze() {
    setErr(null);
    if (!file) {
      setErr("Choose a PO or tax invoice file (PDF or image)");
      return;
    }
    setParsing(true);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("notes", notes);
      if (hintProjectId) form.append("projectId", hintProjectId);
      const res = await apiForm<{ draft: Draft }>("/api/procurement/ai-parse", form);
      const d = res.draft;
      setDraft({
        ...d,
        status: (PROC_STATUS as readonly string[]).includes(d.status)
          ? d.status
          : "draft",
        needBy: d.needBy ? String(d.needBy).slice(0, 10) : null,
        lines: (d.lines ?? []).map((l) => ({
          partNumber: l.partNumber ?? null,
          description: l.description ?? "",
          quantity: l.quantity != null ? String(l.quantity) : "1",
          orderedQty: l.orderedQty != null ? String(l.orderedQty) : null,
          unit: l.unit ?? null,
          estUnitPrice: l.estUnitPrice != null ? String(l.estUnitPrice) : null,
          projectId: l.projectId ?? (hintProjectId || null),
        })),
      });
      setStep("review");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Analyze failed");
    } finally {
      setParsing(false);
    }
  }

  async function confirmCreate() {
    if (!draft) return;
    setErr(null);
    if (!canConfirm) {
      setErr("Every line needs a description, quantity, and project");
      return;
    }
    setConfirming(true);
    try {
      const res = await api<{ procurement: Procurement }>(
        "/api/procurement/ai-confirm",
        {
          method: "POST",
          body: JSON.stringify({
            title: draft.title.trim(),
            supplierId: draft.supplierId || null,
            status: draft.status,
            needBy: draft.needBy || null,
            sapPoNumber: draft.sapPoNumber?.trim() || null,
            createProjectItems: true,
            lines: draft.lines.map((l) => ({
              partNumber: l.partNumber?.trim() || null,
              description: l.description.trim(),
              quantity: l.quantity.trim() || "1",
              orderedQty: l.orderedQty?.trim() || null,
              unit: l.unit?.trim() || null,
              estUnitPrice: l.estUnitPrice?.trim() || null,
              projectId: l.projectId!,
            })),
          }),
        },
      );
      nav(`/workspace/purchasing/${res.procurement.id}`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Create failed");
    } finally {
      setConfirming(false);
    }
  }

  function patchDraft(partial: Partial<Draft>) {
    setDraft((d) => (d ? { ...d, ...partial } : d));
  }

  function patchLine(idx: number, partial: Partial<DraftLine>) {
    setDraft((d) => {
      if (!d) return d;
      const lines = d.lines.map((l, i) => (i === idx ? { ...l, ...partial } : l));
      return { ...d, lines };
    });
  }

  function removeLine(idx: number) {
    setDraft((d) => {
      if (!d) return d;
      return { ...d, lines: d.lines.filter((_, i) => i !== idx) };
    });
  }

  return (
    <WorkspaceDetailChrome
      backTo="/workspace/purchasing"
      backLabel="← Purchasing"
      title="Import PO / invoice"
    >
      <p className="mb-4 text-sm text-tesla-text-secondary">
        Upload a purchase order or tax invoice. Add guidance notes so AI can
        assign projects, then review and edit before creating purchasing
        records.
      </p>

      {err && (
        <p className="mb-3 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {err}
        </p>
      )}

      {step === "entry" && (
        <div className="max-w-2xl space-y-4 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <div>
            <label className={labelClass} htmlFor="po-file">
              Document (PDF or image)
            </label>
            <input
              id="po-file"
              type="file"
              accept="application/pdf,image/jpeg,image/png,image/webp,.pdf,.jpg,.jpeg,.png,.webp"
              className="mt-1 block w-full text-sm"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
            {file && (
              <p className="mt-1 text-xs text-slate-500">
                {file.name} ({Math.round(file.size / 1024)} KB)
              </p>
            )}
          </div>

          <div>
            <label className={labelClass} htmlFor="po-notes">
              Guidance for AI
            </label>
            <textarea
              id="po-notes"
              className={`${inputClass} min-h-[6rem]`}
              placeholder='e.g. "All lines for Project Alpha except the cable reel — that is Project Beta"'
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>

          <div>
            <label className={labelClass}>Default project (optional)</label>
            <QuickCreateSelect
              entity="project"
              value={hintProjectId}
              onChange={setHintProjectId}
              allowEmpty
              emptyLabel="(none — assign in review)"
              className={selectClass}
            />
            <p className="mt-1 text-xs text-slate-500">
              Used as the default for lines when notes do not specify otherwise.
            </p>
          </div>

          <button
            type="button"
            disabled={parsing || !file}
            className="rounded border border-slate-800 bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
            onClick={() => void analyze()}
          >
            {parsing ? "Analyzing…" : "Analyze with AI"}
          </button>
        </div>
      )}

      {step === "review" && draft && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              className="text-sm text-blue-700 underline"
              onClick={() => {
                setStep("entry");
                setErr(null);
              }}
            >
              ← Back to upload
            </button>
            {draft.documentType && (
              <span className="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
                Detected: {draft.documentType.replace("_", " ")}
              </span>
            )}
          </div>

          {draft.confidenceNotes && (
            <p className="rounded border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
              {draft.confidenceNotes}
            </p>
          )}

          {draft.supplierNameRaw && !draft.supplierId && (
            <p className="text-sm text-slate-600">
              Document supplier: <strong>{draft.supplierNameRaw}</strong> — pick
              a matching supplier below or leave blank.
            </p>
          )}

          <div className="grid max-w-3xl gap-3 rounded-lg border border-slate-200 bg-white p-4 shadow-sm sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className={labelClass}>Title</label>
              <input
                className={inputClass}
                value={draft.title}
                onChange={(e) => patchDraft({ title: e.target.value })}
              />
            </div>
            <div>
              <label className={labelClass}>Supplier</label>
              <QuickCreateSelect
                entity="supplier"
                value={draft.supplierId ?? ""}
                onChange={(v) => patchDraft({ supplierId: v || null })}
                allowEmpty
                emptyLabel="(none)"
                className={selectClass}
              />
              {suppliers.length === 0 && (
                <p className="mt-1 text-xs text-slate-500">No suppliers yet.</p>
              )}
            </div>
            <div>
              <label className={labelClass}>Status</label>
              <select
                className={selectClass}
                value={draft.status}
                onChange={(e) =>
                  patchDraft({ status: e.target.value as ProcStatus })
                }
              >
                {PROC_STATUS.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelClass}>Need by</label>
              <input
                type="date"
                className={inputClass}
                value={draft.needBy ?? ""}
                onChange={(e) =>
                  patchDraft({ needBy: e.target.value || null })
                }
              />
            </div>
            <div>
              <label className={labelClass}>SAP / PO number</label>
              <input
                className={inputClass}
                value={draft.sapPoNumber ?? ""}
                onChange={(e) =>
                  patchDraft({ sapPoNumber: e.target.value || null })
                }
              />
            </div>
          </div>

          <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white shadow-sm">
            <table className="w-full min-w-[56rem] border-collapse text-sm">
              <thead>
                <tr className="border-b bg-slate-50 text-left">
                  <th className="px-2 py-2 font-medium">Part #</th>
                  <th className="px-2 py-2 font-medium">Description</th>
                  <th className="px-2 py-2 font-medium">Qty</th>
                  <th className="px-2 py-2 font-medium">Ordered</th>
                  <th className="px-2 py-2 font-medium">Unit</th>
                  <th className="px-2 py-2 font-medium">Price</th>
                  <th className="px-2 py-2 font-medium">Project</th>
                  <th className="px-2 py-2 font-medium" />
                </tr>
              </thead>
              <tbody>
                {draft.lines.map((line, idx) => (
                  <tr key={idx} className="border-b border-slate-100 align-top">
                    <td className="p-1.5">
                      <input
                        className={cellInput}
                        value={line.partNumber ?? ""}
                        onChange={(e) =>
                          patchLine(idx, {
                            partNumber: e.target.value || null,
                          })
                        }
                      />
                    </td>
                    <td className="p-1.5">
                      <input
                        className={`${cellInput} min-w-[10rem]`}
                        value={line.description}
                        onChange={(e) =>
                          patchLine(idx, { description: e.target.value })
                        }
                      />
                    </td>
                    <td className="p-1.5">
                      <input
                        className={`${cellInput} w-16`}
                        value={line.quantity}
                        onChange={(e) =>
                          patchLine(idx, { quantity: e.target.value })
                        }
                      />
                    </td>
                    <td className="p-1.5">
                      <input
                        className={`${cellInput} w-16`}
                        value={line.orderedQty ?? ""}
                        onChange={(e) =>
                          patchLine(idx, {
                            orderedQty: e.target.value || null,
                          })
                        }
                      />
                    </td>
                    <td className="p-1.5">
                      <input
                        className={`${cellInput} w-14`}
                        value={line.unit ?? ""}
                        onChange={(e) =>
                          patchLine(idx, { unit: e.target.value || null })
                        }
                      />
                    </td>
                    <td className="p-1.5">
                      <input
                        className={`${cellInput} w-20`}
                        value={line.estUnitPrice ?? ""}
                        onChange={(e) =>
                          patchLine(idx, {
                            estUnitPrice: e.target.value || null,
                          })
                        }
                      />
                    </td>
                    <td className="p-1.5 min-w-[10rem]">
                      <QuickCreateSelect
                        entity="project"
                        value={line.projectId ?? ""}
                        onChange={(v) =>
                          patchLine(idx, { projectId: v || null })
                        }
                        className="w-full rounded border border-slate-200 px-1.5 py-1 text-sm"
                      />
                      {!line.projectId && (
                        <p className="mt-0.5 text-xs text-red-600">Required</p>
                      )}
                    </td>
                    <td className="p-1.5">
                      <button
                        type="button"
                        className="text-xs text-red-600 hover:underline"
                        onClick={() => removeLine(idx)}
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              className="rounded border border-slate-300 bg-white px-3 py-1.5 text-sm hover:bg-slate-50"
              onClick={() =>
                patchDraft({
                  lines: [
                    ...draft.lines,
                    emptyLine(hintProjectId || projects[0]?.id || ""),
                  ],
                })
              }
            >
              Add line
            </button>
            <button
              type="button"
              disabled={confirming || !canConfirm}
              className="rounded border border-slate-800 bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
              onClick={() => void confirmCreate()}
            >
              {confirming ? "Creating…" : "Create purchasing"}
            </button>
            <span className="text-xs text-slate-500">
              {draft.lines.length} line{draft.lines.length === 1 ? "" : "s"}
            </span>
          </div>
        </div>
      )}
    </WorkspaceDetailChrome>
  );
}
