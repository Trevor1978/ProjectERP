import { Hono } from "hono";
import { and, asc, eq, inArray } from "drizzle-orm";
import { db, project, projectMember, supplier } from "@project-erp/db";
import { procurementAiConfirm } from "@project-erp/validators";
import { requireAuth, type AuthUser } from "../lib/session.js";
import { requireProject } from "../lib/projectAccess.js";
import { writeAudit } from "../lib/audit.js";
import {
  parseProcurementDocumentWithGemini,
  type CatalogItem,
} from "../lib/gemini.js";
import {
  createProcurementFromDocument,
  documentIdentityFromExtract,
  loadDocumentMatch,
  updateProcurementFromDocument,
} from "../lib/applyProcurementDocument.js";

const app = new Hono();
app.use("/*", requireAuth);

const ALLOWED_MIME = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
]);
const MAX_BYTES = 15 * 1024 * 1024;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function visibleProjectIds(a: AuthUser): Promise<string[]> {
  if (a.globalRole === "org_admin") {
    const prows = await db
      .select({ id: project.id })
      .from(project)
      .where(eq(project.organizationId, a.organizationId));
    return prows.map((p) => p.id);
  }
  const mem = await db
    .select({ projectId: projectMember.projectId })
    .from(projectMember)
    .where(eq(projectMember.userId, a.id));
  return mem.map((m) => m.projectId);
}

function catalogIdIn(
  list: CatalogItem[],
  id: string | null | undefined,
): string | null {
  if (!id) return null;
  return list.some((i) => i.id === id) ? id : null;
}

async function supplierIdForOrg(
  a: AuthUser,
  supplierId: string | null | undefined,
): Promise<{ ok: true; supplierId: string | null } | { ok: false; message: string }> {
  if (supplierId == null || supplierId === "") {
    return { ok: true, supplierId: null };
  }
  const rows = await db
    .select({ id: supplier.id })
    .from(supplier)
    .where(
      and(
        eq(supplier.id, supplierId),
        eq(supplier.organizationId, a.organizationId),
      ),
    );
  if (rows.length === 0) {
    return { ok: false, message: "Supplier not found" };
  }
  return { ok: true, supplierId };
}

function parseNeedBy(raw: string | null | undefined): string | null {
  if (!raw?.trim()) return null;
  const t = raw.trim();
  // Accept YYYY-MM-DD or ISO datetime → date only for JSON draft
  const m = t.match(/^(\d{4}-\d{2}-\d{2})/);
  if (m) return m[1]!;
  const d = new Date(t);
  if (!Number.isNaN(d.getTime())) {
    return d.toISOString().slice(0, 10);
  }
  return null;
}

app.post("/procurement/ai-parse", async (c) => {
  const a = c.get("auth") as AuthUser;
  if (!process.env.GEMINI_API_KEY?.trim()) {
    return c.json(
      {
        error:
          "GEMINI_API_KEY is not set on the API server. Add it in Coolify env for the api service, then redeploy.",
      },
      400,
    );
  }

  const body = await c.req.parseBody({ all: true });
  const file = body["file"];
  const notesRaw = body["notes"];
  const projectIdRaw = body["projectId"];
  const procurementIdRaw = body["procurementId"];

  const notes =
    typeof notesRaw === "string" ? notesRaw.slice(0, 50000) : "";
  const hintProjectId =
    typeof projectIdRaw === "string" && UUID_RE.test(projectIdRaw.trim())
      ? projectIdRaw.trim()
      : null;
  const pinProcurementId =
    typeof procurementIdRaw === "string" && UUID_RE.test(procurementIdRaw.trim())
      ? procurementIdRaw.trim()
      : null;

  if (!(file instanceof File)) {
    return c.json({ error: 'Expected multipart field "file"' }, 400);
  }
  if (file.size > MAX_BYTES) {
    return c.json({ error: "File too large (max 15MB)" }, 400);
  }
  const mime = (file.type || "").toLowerCase() || "application/octet-stream";
  if (!ALLOWED_MIME.has(mime)) {
    return c.json(
      {
        error:
          "Unsupported file type. Upload a PDF or image (JPEG, PNG, WebP).",
      },
      400,
    );
  }

  const buf = Buffer.from(await file.arrayBuffer());
  const base64 = buf.toString("base64");

  const supplierRows = await db
    .select({ id: supplier.id, name: supplier.name, code: supplier.code })
    .from(supplier)
    .where(eq(supplier.organizationId, a.organizationId))
    .orderBy(asc(supplier.name));

  const pids = await visibleProjectIds(a);
  const projectRows =
    pids.length === 0
      ? []
      : await db
          .select({
            id: project.id,
            name: project.name,
            code: project.code,
          })
          .from(project)
          .where(inArray(project.id, pids))
          .orderBy(asc(project.name));

  if (hintProjectId && !pids.includes(hintProjectId)) {
    return c.json({ error: "Hint project not found or not accessible" }, 400);
  }

  const supplierCatalog: CatalogItem[] = supplierRows.map((s) => ({
    id: s.id,
    label: s.code ? `${s.name} (${s.code})` : s.name,
  }));
  const projectCatalog: CatalogItem[] = projectRows.map((p) => ({
    id: p.id,
    label: p.code ? `${p.name} [${p.code}]` : p.name,
  }));

  let raw;
  try {
    raw = await parseProcurementDocumentWithGemini({
      notes,
      hintProjectId,
      file: { mimeType: mime, base64 },
      catalogs: { suppliers: supplierCatalog, projects: projectCatalog },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[procurement/ai-parse]", msg);
    // 400 (not 504): Cloudflare replaces origin 504s with an HTML error page.
    if (/timed out|aborted/i.test(msg)) {
      return c.json(
        {
          error:
            "AI analysis timed out. Try again. One invoice or order at a time works best.",
        },
        400,
      );
    }
    return c.json({ error: msg }, 400);
  }

  const supplierId = catalogIdIn(supplierCatalog, raw.suggestedSupplierId);
  const defaultProject =
    hintProjectId ??
    (projectCatalog.length === 1 ? projectCatalog[0]!.id : null);

  const lines = raw.lines.map((l) => {
    const matched = catalogIdIn(projectCatalog, l.suggestedProjectId);
    return {
      partNumber: l.partNumber?.slice(0, 256) ?? null,
      description: l.description.slice(0, 2000),
      quantity: String(l.quantity ?? "1"),
      orderedQty: l.orderedQty != null ? String(l.orderedQty) : null,
      unit: l.unit?.slice(0, 32) ?? null,
      estUnitPrice:
        l.estUnitPrice != null && l.estUnitPrice !== ""
          ? String(l.estUnitPrice)
          : null,
      deliveredQty:
        l.deliveredQty != null && l.deliveredQty !== ""
          ? String(l.deliveredQty)
          : null,
      projectId: matched ?? defaultProject,
      matchedLineId: null as string | null,
    };
  });

  const draft = {
    documentType: raw.documentType,
    title: raw.title.slice(0, 500),
    supplierId,
    supplierNameRaw: raw.supplierNameRaw?.slice(0, 500) ?? null,
    status: raw.status,
    needBy: parseNeedBy(raw.needBy),
    sapPoNumber: raw.sapPoNumber?.slice(0, 32) ?? null,
    quoteNumber: raw.quoteNumber?.slice(0, 64) ?? null,
    invoiceNumber: raw.invoiceNumber?.slice(0, 64) ?? null,
    deliveryDocketNumber: raw.deliveryDocketNumber?.slice(0, 64) ?? null,
    confidenceNotes: raw.confidenceNotes?.slice(0, 4000) ?? null,
    lines,
  };

  const match = await loadDocumentMatch(
    a,
    documentIdentityFromExtract({
      documentType: draft.documentType,
      supplierId: draft.supplierId,
      sapPoNumber: draft.sapPoNumber,
      quoteNumber: draft.quoteNumber,
      invoiceNumber: draft.invoiceNumber,
      deliveryDocketNumber: draft.deliveryDocketNumber,
      lines: draft.lines.map((line) => ({
        partNumber: line.partNumber,
        description: line.description,
      })),
    }),
    pinProcurementId,
  );
  const selected = match.candidates.find(
    (candidate) => candidate.id === match.procurementId,
  );
  if (selected) {
    draft.lines = draft.lines.map((line, index) => ({
      ...line,
      matchedLineId:
        selected.lineMatches.find((item) => item.incomingIndex === index)
          ?.lineId ?? null,
    }));
  }

  return c.json({ draft, match });
});

app.post("/procurement/ai-confirm", async (c) => {
  const a = c.get("auth") as AuthUser;
  const p = procurementAiConfirm.safeParse(await c.req.json());
  if (!p.success) {
    return c.json({ error: p.error.flatten() }, 400);
  }

  const sid = await supplierIdForOrg(a, p.data.supplierId);
  if (!sid.ok) {
    return c.json({ error: sid.message }, 400);
  }

  for (const line of p.data.lines) {
    const pr = await requireProject(a, line.projectId);
    if ("error" in pr) {
      return c.json({ error: pr.error }, pr.status);
    }
  }

  const result = p.data.procurementId
    ? await updateProcurementFromDocument(
        a,
        p.data.procurementId,
        p.data,
        sid.supplierId,
      )
    : await createProcurementFromDocument(a, p.data, sid.supplierId);
  if (!result.ok) {
    return c.json({ error: result.error }, result.status as 400);
  }

  await writeAudit(
    a,
    result.mode === "updated" ? "procurement.ai_update" : "procurement.ai_import",
    "procurement_request",
    result.procurement.id,
    {
      lineCount: result.lines.length,
      documentType: p.data.documentType ?? "other",
      mode: result.mode,
    },
  );

  return c.json({
    procurement: result.procurement,
    lines: result.lines,
    mode: result.mode,
  });
});

export { app as procurementAiApp };
