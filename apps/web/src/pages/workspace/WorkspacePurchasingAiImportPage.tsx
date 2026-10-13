import { useMemo, useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api, apiForm } from "../../lib/api";
import { QuickCreateSelect } from "../../components/QuickCreateSelect";
import { FileDropZone } from "../../components/FileDropZone";
import { WorkspaceDetailChrome } from "./WorkspaceDetailChrome";
import { PROC_STATUS, type Procurement } from "../../workspace/purchasingTypes";

type ProcStatus = (typeof PROC_STATUS)[number];

const DOCUMENT_TYPES = [
  "rfq",
  "quote",
  "po",
  "proforma_invoice",
  "tax_invoice",
  "delivery_docket",
  "other",
] as const;

type DocumentType = (typeof DOCUMENT_TYPES)[number];

const DOCUMENT_LABELS: Record<DocumentType, string> = {
  rfq: "RFQ",
  quote: "Quote",
  po: "Purchase order",
  proforma_invoice: "Proforma invoice (PI)",
  tax_invoice: "Tax invoice",
  delivery_docket: "Delivery docket",
  other: "Other",
};

type DraftLine = {
  partNumber: string | null;
  description: string;
  quantity: string;
  orderedQty: string | null;
  unit: string | null;
  estUnitPrice: string | null;
  deliveredQty: string | null;
  projectId: string | null;
  matchedLineId: string | null;
};

type Draft = {
  documentType: DocumentType;
  title: string;
  supplierId: string | null;
  supplierNameRaw: string | null;
  status: ProcStatus;
  needBy: string | null;
  sapPoNumber: string | null;
  quoteNumber: string | null;
  invoiceNumber: string | null;
  deliveryDocketNumber: string | null;
  confidenceNotes: string | null;
  lines: DraftLine[];
};

type MatchCandidate = {
  id: string;
  title: string;
  status: string;
  sapPoNumber: string | null;
  quoteNumber: string | null;
  invoiceNumber: string | null;
  score: number;
  reasons: string[];
  lineMatches: { incomingIndex: number; lineId: string | null }[];
  orderLines?: { id: string; partNumber: string | null; description: string }[];
};

type MatchInfo = {
  procurementId: string | null;
  confidence: "high" | "suggested" | "none";
  candidates: MatchCandidate[];
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

function asDocumentType(value: string | undefined): DocumentType {
  return (DOCUMENT_TYPES as readonly string[]).includes(value ?? "")
    ? (value as DocumentType)
    : "other";
}

function emptyLine(defaultProjectId: string): DraftLine {
  return {
    partNumber: null,
    description: "",
    quantity: "1",
    orderedQty: null,
    unit: null,
    estUnitPrice: null,
    deliveredQty: null,
    projectId: defaultProjectId || null,
    matchedLineId: null,
  };
}

function compactRef(value: string | null | undefined): string {
  const compact = (value ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  const withoutPo = compact.replace(/^PO/, "");
  return withoutPo || compact;
}

function compactText(value: string | null | undefined): string {
  return (value ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

/** Pair draft lines to an existing order after the user edits or switches orders. */
function withLineMatches(
  lines: DraftLine[],
  candidate: MatchCandidate | undefined,
): DraftLine[] {
  const orderLines = candidate?.orderLines ?? [];
  if (!candidate || orderLines.length === 0) {
    if (!candidate) return lines.map((line) => ({ ...line, matchedLineId: null }));
    return lines.map((line, index) => ({
      ...line,
      matchedLineId:
        candidate.lineMatches.find((item) => item.incomingIndex === index)?.lineId ??
        null,
    }));
  }
  const used = new Set<string>();
  const matched: (string | null)[] = lines.map(() => null);
  for (let i = 0; i < lines.length; i += 1) {
    const part = compactRef(lines[i]?.partNumber);
    if (!part) continue;
    const found = orderLines.find(
      (line) => !used.has(line.id) && compactRef(line.partNumber) === part,
    );
    if (found) {
      used.add(found.id);
      matched[i] = found.id;
    }
  }
  for (let i = 0; i < lines.length; i += 1) {
    if (matched[i]) continue;
    const description = compactText(lines[i]?.description);
    if (!description) continue;
    const found = orderLines.find(
      (line) => !used.has(line.id) && compactText(line.description) === description,
    );
    if (found) {
      used.add(found.id);
      matched[i] = found.id;
    }
  }
  return lines.map((line, index) => ({
    ...line,
    matchedLineId: matched[index] ?? null,
  }));
}

function normalizeParsedImport(
  raw: { draft: Draft; match?: MatchInfo },
  pinnedOrderId: string,
  hintProjectId: string,
): { draft: Draft; match: MatchInfo; targetId: string } {
  const d = raw.draft;
  const nextMatch = raw.match ?? {
    procurementId: null,
    confidence: "none" as const,
    candidates: [],
  };
  const nextTarget = pinnedOrderId || nextMatch.procurementId || "";
  const lines = (d.lines ?? []).map((l) => ({
    partNumber: l.partNumber ?? null,
    description: l.description ?? "",
    quantity: l.quantity != null ? String(l.quantity) : "1",
    orderedQty: l.orderedQty != null ? String(l.orderedQty) : null,
    unit: l.unit ?? null,
    estUnitPrice: l.estUnitPrice != null ? String(l.estUnitPrice) : null,
    deliveredQty: l.deliveredQty != null ? String(l.deliveredQty) : null,
    projectId: l.projectId ?? (hintProjectId || null),
    matchedLineId: l.matchedLineId ?? null,
  }));
  const candidate = nextMatch.candidates.find((item) => item.id === nextTarget);
  return {
    match: nextMatch,
    targetId: nextTarget,
    draft: {
      ...d,
      documentType: asDocumentType(d.documentType),
      status: (PROC_STATUS as readonly string[]).includes(d.status) ? d.status : "draft",
      needBy: d.needBy ? String(d.needBy).slice(0, 10) : null,
      quoteNumber: d.quoteNumber ?? null,
      invoiceNumber: d.invoiceNumber ?? null,
      deliveryDocketNumber: d.deliveryDocketNumber ?? null,
      lines: withLineMatches(lines, candidate),
    },
  };
}

export function WorkspacePurchasingAiImportPage() {
  const nav = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const pinnedOrderId = searchParams.get("order")?.trim() ?? "";
  const seed = location.state as {
    parseResult?: { draft: Draft; match?: MatchInfo };
    orderTitle?: string;
  } | null;
  const seeded = seed?.parseResult
    ? normalizeParsedImport(seed.parseResult, pinnedOrderId, "")
    : null;
  const [step, setStep] = useState<"entry" | "review">(seeded ? "review" : "entry");
  const [file, setFile] = useState<File | null>(null);
  const [notes, setNotes] = useState("");
  const [hintProjectId, setHintProjectId] = useState("");
  const [parsing, setParsing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(seeded?.draft ?? null);
  const [match, setMatch] = useState<MatchInfo | null>(seeded?.match ?? null);
  const [targetId, setTargetId] = useState(seeded?.targetId ?? pinnedOrderId);
  const [orderTitle, setOrderTitle] = useState(seed?.orderTitle ?? "");

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
  const updating = Boolean(targetId);
  const isDelivery = draft?.documentType === "delivery_docket";

  const canConfirm = useMemo(() => {
    if (!draft?.title.trim()) return false;
    if (!draft.lines.length) return false;
    return draft.lines.every(
      (l) => l.description.trim() && l.projectId && l.quantity.trim(),
    );
  }, [draft]);

  const selected = match?.candidates.find((candidate) => candidate.id === targetId);
  const matchedCount = draft?.lines.filter((line) => line.matchedLineId).length ?? 0;
  const newCount = (draft?.lines.length ?? 0) - matchedCount;

  async function analyze() {
    setErr(null);
    if (!file) {
      setErr("Choose a purchasing document (PDF or image)");
      return;
    }
    setParsing(true);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("notes", notes);
      if (hintProjectId) form.append("projectId", hintProjectId);
      if (pinnedOrderId) form.append("procurementId", pinnedOrderId);
      const res = await apiForm<{ draft: Draft; match: MatchInfo }>(
        "/api/procurement/ai-parse",
        form,
      );
      const parsed = normalizeParsedImport(res, pinnedOrderId, hintProjectId);
      setDraft(parsed.draft);
      setMatch(parsed.match);
      setTargetId(parsed.targetId);
      const pinned = parsed.match.candidates.find((item) => item.id === pinnedOrderId);
      if (pinned) setOrderTitle(pinned.title);
      setStep("review");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Analyze failed");
    } finally {
      setParsing(false);
    }
  }

  function chooseTarget(nextId: string) {
    setTargetId(nextId);
    const candidate = match?.candidates.find((item) => item.id === nextId);
    setDraft((current) =>
      current
        ? { ...current, lines: withLineMatches(current.lines, candidate) }
        : current,
    );
  }

  async function confirmImport() {
    if (!draft) return;
    setErr(null);
    if (!canConfirm) {
      setErr("Every line needs a description, quantity, and project");
      return;
    }
    setConfirming(true);
    try {
      const res = await api<{ procurement: Procurement; mode?: "created" | "updated" }>(
        "/api/procurement/ai-confirm",
        {
          method: "POST",
          body: JSON.stringify({
            documentType: draft.documentType,
            procurementId: targetId || null,
            title: draft.title.trim(),
            supplierId: draft.supplierId || null,
            status: draft.status,
            needBy: draft.needBy || null,
            sapPoNumber: draft.sapPoNumber?.trim() || null,
            quoteNumber: draft.quoteNumber?.trim() || null,
            invoiceNumber: draft.invoiceNumber?.trim() || null,
            deliveryDocketNumber: draft.deliveryDocketNumber?.trim() || null,
            createProjectItems: true,
            lines: draft.lines.map((l) => ({
              partNumber: l.partNumber?.trim() || null,
              description: l.description.trim(),
              quantity: l.quantity.trim() || "1",
              orderedQty: l.orderedQty?.trim() || null,
              unit: l.unit?.trim() || null,
              estUnitPrice: l.estUnitPrice?.trim() || null,
              deliveredQty: l.deliveredQty?.trim() || null,
              matchedLineId: l.matchedLineId,
              projectId: l.projectId!,
            })),
          }),
        },
      );
      nav(`/workspace/purchasing/${res.procurement.id}`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Save failed");
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
      title="Import purchasing document"
    >
      <p className="mb-4 text-sm text-tesla-text-secondary">
        Upload an RFQ, quote, purchase order, proforma invoice (PI), tax invoice,
        or delivery docket. A matching PO number is only a hint. The suggestion
        also uses the supplier and the line items, and you choose the order
        before anything is saved. To add a document to an order you already
        have open, use Add document on that purchase order.
      </p>

      {err && (
        <p className="mb-3 max-h-40 overflow-auto rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 break-words">
          {err}
        </p>
      )}

      {step === "entry" && (
        <div className="max-w-2xl space-y-4 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          {pinnedOrderId && (
            <p className="text-sm text-slate-700">
              This upload updates {orderTitle || "the purchase order you opened"}. It will not create a separate order unless you change that on the review screen.
            </p>
          )}
          <FileDropZone
            id="po-file"
            label="Document (PDF or image)"
            accept="application/pdf,image/jpeg,image/png,image/webp,.pdf,.jpg,.jpeg,.png,.webp"
            hint="PDF, JPEG, PNG, or WebP — max 15MB. Analysis can take up to a minute."
            onFiles={(files) => setFile(files[0] ?? null)}
          >
            {file ? (
              <p className="mt-2 text-xs text-slate-600">
                Selected: <strong>{file.name}</strong> ({Math.round(file.size / 1024)} KB)
              </p>
            ) : null}
          </FileDropZone>

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
            <span className="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
              {DOCUMENT_LABELS[draft.documentType]}
            </span>
          </div>

          {draft.confidenceNotes && (
            <p className="rounded border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
              {draft.confidenceNotes}
            </p>
          )}

          <div className="max-w-3xl rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <label className={labelClass} htmlFor="apply-target">
              Apply to
            </label>
            <select
              id="apply-target"
              className={selectClass}
              value={targetId}
              onChange={(e) => chooseTarget(e.target.value)}
            >
              <option value="">Create a new order</option>
              {(match?.candidates ?? []).map((candidate) => (
                <option key={candidate.id} value={candidate.id}>
                  Update {candidate.title}
                  {candidate.sapPoNumber ? ` · PO ${candidate.sapPoNumber}` : ""}
                  {candidate.reasons.length ? ` (${candidate.reasons.join(", ")})` : ""}
                </option>
              ))}
            </select>
            <p className="mt-2 text-sm text-slate-600">
              {pinnedOrderId && targetId === pinnedOrderId
                ? `This document will update ${orderTitle || "the purchase order you opened"}.`
                : match?.confidence === "high" && updating
                  ? `Supplier, line items, and reference numbers agree on this order (${selected?.reasons.filter((reason) => reason !== "selected order").join(", ")}).`
                  : match?.confidence === "suggested" && updating
                    ? "This looks similar, but a PO number on its own is not enough. Check the supplier and lines before updating."
                    : "No existing order was selected. This will create a new purchasing record."}
              {updating
                ? ` ${matchedCount} line${matchedCount === 1 ? "" : "s"} match, ${newCount} new.`
                : ""}
            </p>
            {updating && (
              <p className="mt-1 text-xs text-slate-500">
                The existing order title is kept. Prices, quantities, invoice
                number, and receipts update from this document.
              </p>
            )}
            {isDelivery && !draft.deliveryDocketNumber?.trim() && (
              <p className="mt-2 text-sm text-amber-800">
                No delivery docket number was found. Received quantities will be
                added, and uploading this docket again can count them twice.
              </p>
            )}
          </div>

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
              <label className={labelClass}>Document type</label>
              <select
                className={selectClass}
                value={draft.documentType}
                onChange={(e) =>
                  patchDraft({ documentType: asDocumentType(e.target.value) })
                }
              >
                {DOCUMENT_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {DOCUMENT_LABELS[type]}
                  </option>
                ))}
              </select>
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
              <label className={labelClass}>PO number</label>
              <input
                className={inputClass}
                value={draft.sapPoNumber ?? ""}
                onChange={(e) =>
                  patchDraft({ sapPoNumber: e.target.value || null })
                }
              />
            </div>
            <div>
              <label className={labelClass}>Quote number</label>
              <input
                className={inputClass}
                value={draft.quoteNumber ?? ""}
                onChange={(e) =>
                  patchDraft({ quoteNumber: e.target.value || null })
                }
              />
            </div>
            <div>
              <label className={labelClass}>Invoice / PI number</label>
              <input
                className={inputClass}
                value={draft.invoiceNumber ?? ""}
                onChange={(e) =>
                  patchDraft({ invoiceNumber: e.target.value || null })
                }
              />
            </div>
            <div>
              <label className={labelClass}>Delivery docket number</label>
              <input
                className={inputClass}
                value={draft.deliveryDocketNumber ?? ""}
                onChange={(e) =>
                  patchDraft({ deliveryDocketNumber: e.target.value || null })
                }
              />
            </div>
          </div>

          <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white shadow-sm">
            <table className="w-full min-w-[64rem] border-collapse text-sm">
              <thead>
                <tr className="border-b bg-slate-50 text-left">
                  <th className="px-2 py-2 font-medium">Part #</th>
                  <th className="px-2 py-2 font-medium">Description</th>
                  <th className="px-2 py-2 font-medium">Qty</th>
                  <th className="px-2 py-2 font-medium">Ordered</th>
                  {isDelivery && (
                    <th className="px-2 py-2 font-medium">Delivered</th>
                  )}
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
                      {updating && (
                        <p className="mt-0.5 text-xs text-slate-500">
                          {line.matchedLineId ? "Updates existing line" : "New line"}
                        </p>
                      )}
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
                    {isDelivery && (
                      <td className="p-1.5">
                        <input
                          className={`${cellInput} w-16`}
                          value={line.deliveredQty ?? ""}
                          onChange={(e) =>
                            patchLine(idx, {
                              deliveredQty: e.target.value || null,
                            })
                          }
                        />
                      </td>
                    )}
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
              onClick={() => void confirmImport()}
            >
              {confirming
                ? "Saving…"
                : updating
                  ? "Update order"
                  : "Create purchasing"}
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
