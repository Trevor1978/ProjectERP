import { z } from "zod";
import {
  digestTimeZone,
  nowInTimeZoneIso,
  parseAiDateTime,
} from "./digestTz.js";
import { extractPdfText, isUsefulPdfText } from "./pdfText.js";

const geminiDraftSchema = z.object({
  suggestedClientId: z.string().nullable().optional(),
  suggestedAssetId: z.string().nullable().optional(),
  suggestedProjectId: z.string().nullable().optional(),
  suggestedTaskId: z.string().nullable().optional(),
  createNewTask: z.boolean().optional(),
  newTaskTitle: z.string().nullable().optional(),
  timeEntry: z.object({
    startedAt: z.string().nullable().optional(),
    endedAt: z.string().nullable().optional(),
    durationMinutes: z.number().int().nullable().optional(),
    note: z.string().nullable().optional(),
  }),
  serviceLog: z.object({
    title: z.string(),
    description: z.string().nullable().optional(),
    performedAt: z.string().nullable().optional(),
    technicianName: z.string().nullable().optional(),
  }),
  reportMarkdown: z.string(),
});

export type GeminiWorkDraft = z.infer<typeof geminiDraftSchema>;

export type CatalogItem = { id: string; label: string };

export type WorkCompleteCatalogs = {
  clients: CatalogItem[];
  assets: CatalogItem[];
  projects: CatalogItem[];
  tasks: CatalogItem[];
  technicianName?: string;
};

/** OpenAPI-style schema for Gemini structured JSON. */
const RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    suggestedClientId: { type: "string", nullable: true },
    suggestedAssetId: { type: "string", nullable: true },
    suggestedProjectId: { type: "string", nullable: true },
    suggestedTaskId: { type: "string", nullable: true },
    createNewTask: { type: "boolean" },
    newTaskTitle: { type: "string", nullable: true },
    timeEntry: {
      type: "object",
      properties: {
        startedAt: { type: "string", nullable: true },
        endedAt: { type: "string", nullable: true },
        durationMinutes: { type: "integer", nullable: true },
        note: { type: "string", nullable: true },
      },
      required: ["startedAt", "endedAt", "durationMinutes", "note"],
    },
    serviceLog: {
      type: "object",
      properties: {
        title: { type: "string" },
        description: { type: "string", nullable: true },
        performedAt: { type: "string", nullable: true },
        technicianName: { type: "string", nullable: true },
      },
      required: ["title", "description", "performedAt", "technicianName"],
    },
    reportMarkdown: { type: "string" },
  },
  required: [
    "suggestedClientId",
    "suggestedAssetId",
    "suggestedProjectId",
    "suggestedTaskId",
    "createNewTask",
    "newTaskTitle",
    "timeEntry",
    "serviceLog",
    "reportMarkdown",
  ],
};

function formatCatalog(items: CatalogItem[]): string {
  if (items.length === 0) return "(none)";
  return items.map((i) => `- ${i.id}: ${i.label}`).join("\n");
}

function buildPrompt(opts: {
  workType: "machine" | "customer_service";
  notes: string;
  clientId?: string | null;
  assetId?: string | null;
  catalogs: WorkCompleteCatalogs;
}): string {
  const timeZone = digestTimeZone();
  const nowLocal = nowInTimeZoneIso(timeZone);
  return `You are a field-service assistant for Spantec. Parse the technician's natural-language work notes into structured ERP fields and a client-ready service report.

Work type: ${opts.workType}
(machine = work on a machine; customer_service = service call at a customer site)

Pre-selected clientId: ${opts.clientId ?? "(none)"}
Pre-selected assetId: ${opts.assetId ?? "(none)"}
Current technician display name: ${opts.catalogs.technicianName ?? "(unknown)"}
Organization timezone: ${timeZone}
Current local datetime: ${nowLocal}

Customers (id: label):
${formatCatalog(opts.catalogs.clients)}

Machines / assets (id: label):
${formatCatalog(opts.catalogs.assets)}

Projects (id: label):
${formatCatalog(opts.catalogs.projects)}

Tasks (id: label):
${formatCatalog(opts.catalogs.tasks)}

Technician notes:
---
${opts.notes}
---

Rules:
1. Match suggestedClientId / suggestedAssetId / suggestedProjectId / suggestedTaskId to catalog ids when possible. Use null if no good match.
2. Prefer pre-selected ids when provided.
3. If no suitable existing task, set createNewTask=true and propose newTaskTitle; set suggestedTaskId=null.
4. Otherwise createNewTask=false and set suggestedTaskId to the best matching task.
5. Times in the notes are local wall-clock times in ${timeZone}. Emit timeEntry.startedAt / endedAt / serviceLog.performedAt as ISO-8601 WITH that timezone offset (example: 2026-07-21T09:00:00+10:00). Do NOT append Z / treat local times as UTC. durationMinutes is a positive integer when hours can be inferred.
6. serviceLog.title is a short summary; description is a concise work summary for the machine history.
7. reportMarkdown must be a complete Spantec service report in markdown with this structure (no YAML front-matter):

![Spantec](SpantecLogo.jpg)

# Service Report

## Field details

| | |
|---|---|
| **Site** | ... |
| **Date of service** | DD-MM-YYYY |
| **Machine / asset** | ... |
| **Reported faults** | ... |
| **Affected components** | ... |
| **Attending engineer** | ... |
| **Technician onsite** | ... |
| **Service call type** | ... |

## Initial assessment & findings

(prose)

## Actions taken

### 1. [Issue title]

- **Inspection:**
- **Findings:**
- **Action:**

(more numbered issues as needed)

## Conclusion & recommendations

- **Summary:**
- **Operational test / follow-up:**

---

ABN: 56 053 584 384 · PO Box 81 · 17 Drapers Road · MITTAGONG NSW 2575 · P: 02 4860 1000 · [www.spantec.com.au](https://www.spantec.com.au)

Tone: clear, professional field-service English. Fill unknowns with reasonable inference from notes or "Not specified".`;
}

function extractJsonText(raw: string): string {
  const trimmed = raw.trim();
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence?.[1]) return fence[1].trim();
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start >= 0 && end > start) return trimmed.slice(start, end + 1);
  return trimmed;
}

export type GeminiPart =
  | { text: string }
  | { inlineData: { mimeType: string; data: string } };

/** Per-call cap. Stay under nginx/Cloudflare gateways (typically 60–100s). */
const GEMINI_CALL_TIMEOUT_MS = 50_000;
/** Whole parse budget including model fallbacks. Return JSON before a 504. */
const GEMINI_OVERALL_DEADLINE_MS = 85_000;

function geminiErrorMessage(err: unknown): string {
  if (err instanceof Error) {
    if (err.name === "TimeoutError" || err.name === "AbortError") {
      return "Gemini request timed out";
    }
    return err.message;
  }
  return String(err);
}

function isTimeoutError(err: unknown): boolean {
  if (err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError")) {
    return true;
  }
  return /timed out|aborted/i.test(geminiErrorMessage(err));
}

function isFatalGeminiError(err: unknown): boolean {
  return /Gemini HTTP 401|Gemini HTTP 403|Gemini HTTP 429/i.test(geminiErrorMessage(err));
}

/** A timeout used to abort the whole parse. Try the next model while time remains. */
export function geminiFailureAction(
  err: unknown,
): "fatal" | "next-model" | "retry-without-schema" {
  if (isFatalGeminiError(err)) return "fatal";
  if (isTimeoutError(err) || isModelUnavailableError(err)) return "next-model";
  return "retry-without-schema";
}

async function callGemini(opts: {
  model: string;
  apiKey: string;
  parts: GeminiPart[];
  responseSchema?: Record<string, unknown>;
  timeoutMs: number;
}): Promise<string> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(opts.model)}:generateContent?key=${encodeURIComponent(opts.apiKey)}`;
  const generationConfig: Record<string, unknown> = {
    responseMimeType: "application/json",
    temperature: 0.2,
    maxOutputTokens: 8192,
  };
  if (opts.responseSchema) {
    generationConfig.responseSchema = opts.responseSchema;
  }

  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: opts.parts }],
        generationConfig,
      }),
      signal: AbortSignal.timeout(Math.max(1_000, opts.timeoutMs)),
    });
  } catch (e) {
    if (isTimeoutError(e)) {
      throw new Error(
        `Gemini request timed out after ${Math.round(opts.timeoutMs / 1000)}s`,
      );
    }
    throw e;
  }

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Gemini HTTP ${res.status}: ${body.slice(0, 800)}`);
  }

  const data = (await res.json()) as {
    candidates?: {
      content?: { parts?: { text?: string }[] };
      finishReason?: string;
    }[];
    error?: { message?: string };
  };
  if (data.error?.message) {
    throw new Error(`Gemini error: ${data.error.message}`);
  }
  const candidate = data.candidates?.[0];
  const text =
    candidate?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
  if (!text.trim()) {
    throw new Error(
      `Gemini returned an empty response (finishReason=${candidate?.finishReason ?? "unknown"})`,
    );
  }
  return text;
}

async function callGeminiWithModelFallback(opts: {
  apiKey: string;
  parts: GeminiPart[];
  responseSchema: Record<string, unknown>;
}): Promise<string> {
  const models = resolveModelCandidates();
  const deadline = Date.now() + GEMINI_OVERALL_DEADLINE_MS;
  let lastError: unknown;
  for (const model of models) {
    const remaining = deadline - Date.now();
    if (remaining < 8_000) {
      throw new Error(
        lastError instanceof Error
          ? lastError.message
          : "Gemini request timed out",
      );
    }
    const timeoutMs = Math.min(GEMINI_CALL_TIMEOUT_MS, remaining - 2_000);
    try {
      let text: string;
      try {
        text = await callGemini({
          model,
          apiKey: opts.apiKey,
          parts: opts.parts,
          responseSchema: opts.responseSchema,
          timeoutMs,
        });
      } catch (first) {
        if (geminiFailureAction(first) !== "retry-without-schema") {
          throw first;
        }
        const retryRemaining = deadline - Date.now();
        if (retryRemaining < 8_000) throw first;
        console.warn(
          `[gemini] ${model} structured call failed, retrying without schema:`,
          first instanceof Error ? first.message : first,
        );
        text = await callGemini({
          model,
          apiKey: opts.apiKey,
          parts: opts.parts,
          timeoutMs: Math.min(GEMINI_CALL_TIMEOUT_MS, retryRemaining - 2_000),
        });
      }
      console.info(`[gemini] using model ${model}`);
      return text;
    } catch (e) {
      lastError = e;
      const action = geminiFailureAction(e);
      if (action === "fatal") {
        throw e instanceof Error ? e : new Error(geminiErrorMessage(e));
      }
      if (action === "next-model") {
        console.warn(
          `[gemini] ${model} failed, trying next:`,
          e instanceof Error ? e.message : e,
        );
        continue;
      }
      throw e;
    }
  }
  throw lastError instanceof Error
    ? lastError
    : new Error("Gemini request failed for all candidate models");
}

function resolveModelCandidates(): string[] {
  const preferred = process.env.GEMINI_MODEL?.trim() || "gemini-3.6-flash";
  const fallbacks = [
    "gemini-3.6-flash",
    "gemini-3.8-flash",
    "gemini-3.5-flash",
    "gemini-flash-latest",
    "gemini-3.5-flash-lite",
    "gemini-flash-lite-latest",
  ];
  return [preferred, ...fallbacks.filter((m) => m !== preferred)];
}

function isModelUnavailableError(err: unknown): boolean {
  const msg = geminiErrorMessage(err);
  return /Gemini HTTP 404|Gemini HTTP 503|no longer available|NOT_FOUND|not found|UNAVAILABLE|high demand/i.test(
    msg,
  );
}

function normalizeDraftTimes(draft: GeminiWorkDraft): GeminiWorkDraft {
  const tz = digestTimeZone();
  return {
    ...draft,
    timeEntry: {
      ...draft.timeEntry,
      startedAt: parseAiDateTime(draft.timeEntry.startedAt, tz),
      endedAt: parseAiDateTime(draft.timeEntry.endedAt, tz),
    },
    serviceLog: {
      ...draft.serviceLog,
      performedAt: parseAiDateTime(draft.serviceLog.performedAt, tz),
    },
  };
}

export async function parseWorkNotesWithGemini(opts: {
  workType: "machine" | "customer_service";
  notes: string;
  clientId?: string | null;
  assetId?: string | null;
  catalogs: WorkCompleteCatalogs;
}): Promise<GeminiWorkDraft> {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not set");
  }
  const prompt = buildPrompt(opts);
  const text = await callGeminiWithModelFallback({
    apiKey,
    parts: [{ text: prompt }],
    responseSchema: RESPONSE_SCHEMA,
  });

  let parsed: unknown;
  try {
    parsed = JSON.parse(extractJsonText(text));
  } catch {
    throw new Error("Gemini returned invalid JSON");
  }

  const draft = geminiDraftSchema.safeParse(parsed);
  if (!draft.success) {
    throw new Error(`Gemini JSON failed validation: ${draft.error.message}`);
  }
  return normalizeDraftTimes(draft.data);
}

const procurementDocumentTypeSchema = z.enum([
  "rfq",
  "quote",
  "po",
  "proforma_invoice",
  "tax_invoice",
  "delivery_docket",
  "other",
]);

const procurementAiDraftSchema = z.object({
  documentType: procurementDocumentTypeSchema.optional().default("other"),
  title: z.string().min(1),
  suggestedSupplierId: z.string().nullable().optional(),
  supplierNameRaw: z.string().nullable().optional(),
  status: z
    .enum([
      "draft",
      "rfq_sent",
      "quoted",
      "ordered",
      "partially_received",
      "closed",
      "cancelled",
    ])
    .optional()
    .default("draft"),
  needBy: z.string().nullable().optional(),
  sapPoNumber: z.string().nullable().optional(),
  quoteNumber: z.string().nullable().optional(),
  invoiceNumber: z.string().nullable().optional(),
  deliveryDocketNumber: z.string().nullable().optional(),
  confidenceNotes: z.string().nullable().optional(),
  lines: z
    .array(
      z.object({
        partNumber: z.string().nullable().optional(),
        description: z.string().min(1),
        quantity: z.union([z.string(), z.number()]).optional().nullable(),
        orderedQty: z.union([z.string(), z.number()]).optional().nullable(),
        unit: z.string().nullable().optional(),
        estUnitPrice: z.union([z.string(), z.number()]).optional().nullable(),
        deliveredQty: z.union([z.string(), z.number()]).optional().nullable(),
        suggestedProjectId: z.string().nullable().optional(),
      }),
    )
    .default([]),
});

export type GeminiProcurementDraft = z.infer<typeof procurementAiDraftSchema>;

export type ProcurementAiCatalogs = {
  suppliers: CatalogItem[];
  projects: CatalogItem[];
};

const PROCUREMENT_RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    documentType: {
      type: "string",
      enum: [
        "rfq",
        "quote",
        "po",
        "proforma_invoice",
        "tax_invoice",
        "delivery_docket",
        "other",
      ],
    },
    title: { type: "string" },
    suggestedSupplierId: { type: "string", nullable: true },
    supplierNameRaw: { type: "string", nullable: true },
    status: {
      type: "string",
      enum: [
        "draft",
        "rfq_sent",
        "quoted",
        "ordered",
        "partially_received",
        "closed",
        "cancelled",
      ],
    },
    needBy: { type: "string", nullable: true },
    sapPoNumber: { type: "string", nullable: true },
    quoteNumber: { type: "string", nullable: true },
    invoiceNumber: { type: "string", nullable: true },
    deliveryDocketNumber: { type: "string", nullable: true },
    confidenceNotes: { type: "string", nullable: true },
    lines: {
      type: "array",
      items: {
        type: "object",
        properties: {
          partNumber: { type: "string", nullable: true },
          description: { type: "string" },
          quantity: { type: "string", nullable: true },
          orderedQty: { type: "string", nullable: true },
          unit: { type: "string", nullable: true },
          estUnitPrice: { type: "string", nullable: true },
          deliveredQty: { type: "string", nullable: true },
          suggestedProjectId: { type: "string", nullable: true },
        },
        required: [
          "partNumber",
          "description",
          "quantity",
          "orderedQty",
          "unit",
          "estUnitPrice",
          "deliveredQty",
          "suggestedProjectId",
        ],
      },
    },
  },
  required: [
    "documentType",
    "title",
    "suggestedSupplierId",
    "supplierNameRaw",
    "status",
    "needBy",
    "sapPoNumber",
    "quoteNumber",
    "invoiceNumber",
    "deliveryDocketNumber",
    "confidenceNotes",
    "lines",
  ],
};

const CATALOG_CAP = 500;

function preferCatalogMatches(
  items: CatalogItem[],
  documentText: string | null,
): CatalogItem[] {
  if (items.length <= CATALOG_CAP) return items;
  const hay = (documentText ?? "").toLowerCase();
  const matched = hay
    ? items.filter((item) =>
        item.label
          .toLowerCase()
          .split(/[^a-z0-9]+/)
          .some((token) => token.length >= 4 && hay.includes(token)),
      )
    : [];
  const matchedIds = new Set(matched.map((item) => item.id));
  const rest = items.filter((item) => !matchedIds.has(item.id));
  return [...matched, ...rest].slice(0, CATALOG_CAP);
}

function buildProcurementPrompt(opts: {
  notes: string;
  hintProjectId?: string | null;
  catalogs: ProcurementAiCatalogs;
  documentText?: string | null;
}): string {
  const documentBlock = opts.documentText
    ? `Purchasing document text, extracted from the uploaded PDF. Treat this text as the document:
---
${opts.documentText}
---`
    : "The purchasing document is attached as a file.";
  return `You are a purchasing assistant for Spantec ERP. Analyse the purchasing document and extract structured header + line items. Documents may be a request for quotation (RFQ), supplier quote, purchase order (PO), proforma invoice (PI), tax invoice, or delivery docket / packing slip / goods receipt.

${documentBlock}

Guidance notes from the user (use these to assign projects to lines):
---
${opts.notes.trim() || "(none)"}
---

Optional default / hint projectId: ${opts.hintProjectId ?? "(none)"}

Suppliers (id: label) — match suggestedSupplierId only to these ids:
${formatCatalog(opts.catalogs.suppliers)}

Projects (id: label) — match suggestedProjectId only to these ids:
${formatCatalog(opts.catalogs.projects)}

Rules:
1. Read the document carefully. Extract every distinct line item.
2. title: short purchasing title (supplier + the document's own number when present).
3. documentType:
   - "rfq" request for quotation
   - "quote" supplier quotation
   - "po" purchase order
   - "proforma_invoice" proforma invoice (often labelled PI)
   - "tax_invoice" tax invoice or commercial invoice
   - "delivery_docket" delivery docket, delivery note, packing slip, or goods receipt
   - "other" if none of those fit
4. status: "rfq_sent" for an RFQ, "quoted" for a quote, "ordered" for a PO, PI, tax invoice, or delivery docket (including marketplace orders). Use "draft" if unclear.
5. suggestedSupplierId: catalog id only, or null. Never invent UUIDs. Put the printed vendor name in supplierNameRaw.
6. sapPoNumber: the purchase order number this document belongs to. On a PO it is the PO number. On a PI, tax invoice, quote, or delivery docket it is the PO / order number they reference. Null if none is printed.
7. quoteNumber: supplier quote number when this is a quote, else null.
8. invoiceNumber: PI or tax invoice number when printed, else null.
9. deliveryDocketNumber: delivery docket / packing slip number when printed, else null.
10. needBy: delivery / due date as ISO date YYYY-MM-DD when present, else null.
11. For each line: description required; partNumber, quantity, orderedQty, unit, estUnitPrice when present.
12. deliveredQty: on a delivery docket, the quantity delivered on this document for that line (string). Null for every other document type.
13. Project assignment: prefer the user's guidance notes; else use hint projectId for all lines; else match catalog by name/code mentioned in notes or document. Leave suggestedProjectId null if unsure. Never invent project ids.
14. quantities and prices as strings of numbers (e.g. "10", "12.50"). Strip currency symbols (AU$, $, USD).
15. confidenceNotes: brief notes on uncertain matches, including when a PO number was inferred from a reference line.
16. Marketplace order lists (AliExpress, Amazon, eBay, etc.): extract every visible product as a line (description, qty, unit price, SKU when shown). Ignore UI chrome such as "Verifying your payment", coupons, and free-returns banners. If multiple sellers appear, leave suggestedSupplierId null unless exactly one catalog supplier matches; put seller names in supplierNameRaw and confidenceNotes. Prefer a screenshot of a single order when possible.`;
}

function qtyToString(v: string | number | null | undefined): string | null {
  if (v == null || v === "") return null;
  return String(v);
}

export function procurementGeminiParts(opts: {
  notes: string;
  hintProjectId?: string | null;
  file: { mimeType: string; base64: string };
  catalogs: ProcurementAiCatalogs;
}): { parts: GeminiPart[]; usedExtractedText: boolean } {
  let documentText: string | null = null;
  if (opts.file.mimeType === "application/pdf") {
    try {
      const buf = Buffer.from(opts.file.base64, "base64");
      const extracted = extractPdfText(buf);
      if (isUsefulPdfText(extracted)) documentText = extracted.slice(0, 100_000);
    } catch (e) {
      console.warn(
        "[gemini] PDF text extraction failed:",
        e instanceof Error ? e.message : e,
      );
    }
  }
  const prompt = buildProcurementPrompt({
    notes: opts.notes,
    hintProjectId: opts.hintProjectId,
    documentText,
    catalogs: {
      suppliers: preferCatalogMatches(opts.catalogs.suppliers, documentText),
      projects: preferCatalogMatches(opts.catalogs.projects, documentText),
    },
  });
  const parts: GeminiPart[] = [{ text: prompt }];
  if (!documentText) {
    parts.push({
      inlineData: { mimeType: opts.file.mimeType, data: opts.file.base64 },
    });
  }
  return { parts, usedExtractedText: documentText != null };
}

export async function parseProcurementDocumentWithGemini(opts: {
  notes: string;
  hintProjectId?: string | null;
  file: { mimeType: string; base64: string };
  catalogs: ProcurementAiCatalogs;
}): Promise<GeminiProcurementDraft> {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not set");
  }
  const prepared = procurementGeminiParts(opts);
  if (prepared.usedExtractedText) {
    console.info("[gemini] procurement parse using extracted PDF text");
  }
  const text = await callGeminiWithModelFallback({
    apiKey,
    parts: prepared.parts,
    responseSchema: PROCUREMENT_RESPONSE_SCHEMA,
  });

  let parsed: unknown;
  try {
    parsed = JSON.parse(extractJsonText(text));
  } catch {
    throw new Error("Gemini returned invalid JSON");
  }

  const draft = procurementAiDraftSchema.safeParse(parsed);
  if (!draft.success) {
    throw new Error(`Gemini JSON failed validation: ${draft.error.message}`);
  }

  const data = draft.data;
  return {
    ...data,
    lines: data.lines.map((l) => ({
      ...l,
      quantity: qtyToString(l.quantity) ?? "1",
      orderedQty: qtyToString(l.orderedQty),
      estUnitPrice: qtyToString(l.estUnitPrice),
      deliveredQty: qtyToString(l.deliveredQty),
    })),
  };
}
