import { z } from "zod";
import {
  digestTimeZone,
  nowInTimeZoneIso,
  parseAiDateTime,
} from "./digestTz.js";

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

async function callGemini(opts: {
  model: string;
  apiKey: string;
  parts: GeminiPart[];
  responseSchema?: Record<string, unknown>;
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

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ role: "user", parts: opts.parts }],
      generationConfig,
    }),
  });

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
  let lastError: unknown;
  for (const model of models) {
    try {
      let text: string;
      try {
        text = await callGemini({
          model,
          apiKey: opts.apiKey,
          parts: opts.parts,
          responseSchema: opts.responseSchema,
        });
      } catch (first) {
        if (isModelUnavailableError(first)) throw first;
        console.warn(
          `[gemini] ${model} structured call failed, retrying without schema:`,
          first instanceof Error ? first.message : first,
        );
        text = await callGemini({
          model,
          apiKey: opts.apiKey,
          parts: opts.parts,
        });
      }
      console.info(`[gemini] using model ${model}`);
      return text;
    } catch (e) {
      lastError = e;
      if (isModelUnavailableError(e)) {
        console.warn(
          `[gemini] model unavailable, trying next:`,
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
    "gemini-3.5-flash",
    "gemini-flash-latest",
    "gemini-2.0-flash",
  ];
  return [preferred, ...fallbacks.filter((m) => m !== preferred)];
}

function isModelUnavailableError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /Gemini HTTP 404|no longer available|NOT_FOUND|not found/i.test(msg);
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

const procurementAiDraftSchema = z.object({
  documentType: z.enum(["po", "tax_invoice", "other"]).optional().default("other"),
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
    documentType: { type: "string", enum: ["po", "tax_invoice", "other"] },
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
          suggestedProjectId: { type: "string", nullable: true },
        },
        required: [
          "partNumber",
          "description",
          "quantity",
          "orderedQty",
          "unit",
          "estUnitPrice",
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
    "confidenceNotes",
    "lines",
  ],
};

function buildProcurementPrompt(opts: {
  notes: string;
  hintProjectId?: string | null;
  catalogs: ProcurementAiCatalogs;
}): string {
  return `You are a purchasing assistant for Spantec ERP. Analyse the attached purchase order or tax invoice and extract structured purchasing header + line items.

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
1. Read the attached document carefully. Extract every distinct line item.
2. title: short purchasing title (supplier + PO/invoice number when present).
3. documentType: "po" for purchase orders, "tax_invoice" for tax invoices, otherwise "other".
4. status: use "ordered" for clear POs/invoices; use "draft" if unclear.
5. suggestedSupplierId: catalog id only, or null. Never invent UUIDs. Put the printed vendor name in supplierNameRaw.
6. sapPoNumber: PO / order number from the document when present, else null.
7. needBy: delivery / due date as ISO date YYYY-MM-DD when present, else null.
8. For each line: description required; partNumber, quantity, orderedQty, unit, estUnitPrice when present.
9. Project assignment: prefer the user's guidance notes; else use hint projectId for all lines; else match catalog by name/code mentioned in notes or document. Leave suggestedProjectId null if unsure. Never invent project ids.
10. quantities and prices as strings of numbers (e.g. "10", "12.50").
11. confidenceNotes: brief notes on uncertain matches.`;
}

function qtyToString(v: string | number | null | undefined): string | null {
  if (v == null || v === "") return null;
  return String(v);
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
  const prompt = buildProcurementPrompt(opts);
  const text = await callGeminiWithModelFallback({
    apiKey,
    parts: [
      { text: prompt },
      { inlineData: { mimeType: opts.file.mimeType, data: opts.file.base64 } },
    ],
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
    })),
  };
}
