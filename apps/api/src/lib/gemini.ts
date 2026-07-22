import { z } from "zod";

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
  const today = new Date().toISOString();
  return `You are a field-service assistant for Spantec. Parse the technician's natural-language work notes into structured ERP fields and a client-ready service report.

Work type: ${opts.workType}
(machine = work on a machine; customer_service = service call at a customer site)

Pre-selected clientId: ${opts.clientId ?? "(none)"}
Pre-selected assetId: ${opts.assetId ?? "(none)"}
Current technician display name: ${opts.catalogs.technicianName ?? "(unknown)"}
Current datetime (ISO): ${today}

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
5. timeEntry.startedAt / endedAt / performedAt must be ISO-8601 datetimes when known; durationMinutes is a positive integer when hours can be inferred.
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

async function callGemini(opts: {
  model: string;
  apiKey: string;
  prompt: string;
  useSchema: boolean;
}): Promise<string> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(opts.model)}:generateContent?key=${encodeURIComponent(opts.apiKey)}`;
  const generationConfig: Record<string, unknown> = {
    responseMimeType: "application/json",
    temperature: 0.2,
    maxOutputTokens: 8192,
  };
  if (opts.useSchema) {
    generationConfig.responseSchema = RESPONSE_SCHEMA;
  }

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: opts.prompt }] }],
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
  const models = resolveModelCandidates();

  let lastError: unknown;
  let text: string | null = null;

  for (const model of models) {
    try {
      try {
        text = await callGemini({ model, apiKey, prompt, useSchema: true });
      } catch (first) {
        if (isModelUnavailableError(first)) throw first;
        console.warn(
          `[gemini] ${model} structured call failed, retrying without schema:`,
          first instanceof Error ? first.message : first,
        );
        text = await callGemini({ model, apiKey, prompt, useSchema: false });
      }
      console.info(`[gemini] using model ${model}`);
      break;
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

  if (!text) {
    throw lastError instanceof Error
      ? lastError
      : new Error("Gemini request failed for all candidate models");
  }

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
  return draft.data;
}
