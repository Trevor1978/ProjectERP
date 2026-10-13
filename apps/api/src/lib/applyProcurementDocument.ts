import { and, eq, inArray } from "drizzle-orm";
import type { z } from "zod";
import {
  db,
  procurementRequest,
  procurementRequestLine,
  procurementSourceDocument,
  projectMember,
} from "@project-erp/db";
import { procurementAiConfirm } from "@project-erp/validators";
import type { AuthUser } from "./session.js";
import { requireProject } from "./projectAccess.js";
import { resolveProjectItemIdForLine } from "./projectItemForLine.js";
import { syncProjectItemStatus } from "./syncProjectItemStatus.js";
import { syncProcurementStatusFromLineReceipts } from "./syncProcurementReceiveStatus.js";
import {
  isProcurementDocumentType,
  matchIncomingLines,
  matchOrders,
  normalizeRef,
  parseWholeQty,
  planDocumentApply,
  planHeaderUpdate,
  primaryDocumentReference,
  type DocumentIdentity,
  type IncomingProcLine,
  type OrderSnapshot,
} from "./procurementDocumentMatch.js";

export type ProcurementAiConfirmBody = z.infer<typeof procurementAiConfirm>;

type ProcRow = typeof procurementRequest.$inferSelect;
type LineRow = typeof procurementRequestLine.$inferSelect;

export type DocumentMatchPayload = {
  procurementId: string | null;
  confidence: "high" | "suggested" | "none";
  candidates: {
    id: string;
    title: string;
    status: string;
    supplierId: string | null;
    sapPoNumber: string | null;
    quoteNumber: string | null;
    invoiceNumber: string | null;
    deliveryDocketNumbers: string | null;
    score: number;
    reasons: string[];
    lineMatches: { incomingIndex: number; lineId: string | null }[];
    orderLines: { id: string; partNumber: string | null; description: string }[];
  }[];
};

function priceOrNull(value: string | number | null | undefined): number | null {
  if (value == null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function parseReceipt(json: string | null | undefined): Record<string, number> {
  if (!json) return {};
  try {
    const value = JSON.parse(json) as unknown;
    if (!value || typeof value !== "object") return {};
    const out: Record<string, number> = {};
    for (const [key, raw] of Object.entries(value)) {
      const n = Number(raw);
      if (Number.isFinite(n) && n >= 0) out[key] = Math.trunc(n);
    }
    return out;
  } catch {
    return {};
  }
}

function incomingFromBody(body: ProcurementAiConfirmBody): IncomingProcLine[] {
  return body.lines.map((line) => ({
    partNumber: line.partNumber ?? null,
    description: line.description,
    quantity: line.quantity,
    orderedQty: line.orderedQty ?? null,
    unit: line.unit ?? null,
    estUnitPrice: priceOrNull(line.estUnitPrice),
    deliveredQty: parseWholeQty(line.deliveredQty),
    projectId: line.projectId,
    matchedLineId: line.matchedLineId ?? null,
  }));
}

function identityFromDraft(opts: {
  documentType: string;
  supplierId: string | null;
  sapPoNumber: string | null;
  quoteNumber: string | null;
  invoiceNumber: string | null;
  deliveryDocketNumber: string | null;
  lines: { partNumber: string | null; description: string }[];
}): DocumentIdentity {
  return {
    documentType: isProcurementDocumentType(opts.documentType)
      ? opts.documentType
      : "other",
    supplierId: opts.supplierId,
    sapPoNumber: opts.sapPoNumber,
    quoteNumber: opts.quoteNumber,
    invoiceNumber: opts.invoiceNumber,
    deliveryDocketNumber: opts.deliveryDocketNumber,
    lines: opts.lines,
  };
}

async function allowedProjectIds(a: AuthUser): Promise<string[] | null> {
  if (a.globalRole === "org_admin") return null;
  const rows = await db
    .select({ projectId: projectMember.projectId })
    .from(projectMember)
    .where(eq(projectMember.userId, a.id));
  return rows.map((row) => row.projectId);
}

export async function loadDocumentMatch(
  a: AuthUser,
  doc: DocumentIdentity,
): Promise<DocumentMatchPayload> {
  const orders = await db
    .select({
      id: procurementRequest.id,
      title: procurementRequest.title,
      supplierId: procurementRequest.supplierId,
      status: procurementRequest.status,
      sapPoNumber: procurementRequest.sapPoNumber,
      quoteNumber: procurementRequest.quoteNumber,
      invoiceNumber: procurementRequest.invoiceNumber,
      deliveryDocketNumbers: procurementRequest.deliveryDocketNumbers,
    })
    .from(procurementRequest)
    .where(eq(procurementRequest.organizationId, a.organizationId));

  const active: OrderSnapshot[] = orders.filter((order) => order.status !== "cancelled");
  const ids = active.map((order) => order.id);
  const lineRows =
    ids.length === 0
      ? []
      : await db
          .select({
            id: procurementRequestLine.id,
            procurementId: procurementRequestLine.procurementId,
            partNumber: procurementRequestLine.partNumber,
            description: procurementRequestLine.description,
            projectId: procurementRequestLine.projectId,
          })
          .from(procurementRequestLine)
          .where(inArray(procurementRequestLine.procurementId, ids));

  const allowed = await allowedProjectIds(a);
  const linesByOrder = new Map<
    string,
    { id: string; partNumber: string | null; description: string; projectId: string }[]
  >();
  for (const line of lineRows) {
    const list = linesByOrder.get(line.procurementId) ?? [];
    list.push(line);
    linesByOrder.set(line.procurementId, list);
  }
  const visibleIds = new Set(
    active
      .filter((order) => {
        if (allowed == null) return true;
        const lines = linesByOrder.get(order.id) ?? [];
        return lines.some((line) => allowed.includes(line.projectId));
      })
      .map((order) => order.id),
  );
  const visibleOrders = active.filter((order) => visibleIds.has(order.id));

  const match = matchOrders(
    doc,
    visibleOrders,
    new Map(
      [...linesByOrder.entries()].map(([id, lines]) => [
        id,
        lines.map((line) => ({
          partNumber: line.partNumber,
          description: line.description,
        })),
      ]),
    ),
  );

  const incoming: IncomingProcLine[] = doc.lines.map((line) => ({
    partNumber: line.partNumber,
    description: line.description,
    quantity: "1",
    orderedQty: null,
    unit: null,
    estUnitPrice: null,
    deliveredQty: null,
    projectId: "",
  }));

  return {
    procurementId: match.procurementId,
    confidence: match.confidence,
    candidates: match.candidates.map((candidate) => {
      const existing = (linesByOrder.get(candidate.order.id) ?? []).map((line) => ({
        id: line.id,
        partNumber: line.partNumber,
        description: line.description,
        quantity: "1",
        orderedQty: null,
        unit: null,
        estUnitPrice: null,
        receivedQty: 0,
        projectId: line.projectId,
      }));
      const matched = matchIncomingLines(existing, incoming);
      return {
        id: candidate.order.id,
        title: candidate.order.title,
        status: candidate.order.status,
        supplierId: candidate.order.supplierId,
        sapPoNumber: candidate.order.sapPoNumber,
        quoteNumber: candidate.order.quoteNumber,
        invoiceNumber: candidate.order.invoiceNumber,
        deliveryDocketNumbers: candidate.order.deliveryDocketNumbers,
        score: candidate.score,
        reasons: candidate.reasons,
        lineMatches: matched.map((lineId, incomingIndex) => ({
          incomingIndex,
          lineId,
        })),
        orderLines: existing.map((line) => ({
          id: line.id,
          partNumber: line.partNumber,
          description: line.description,
        })),
      };
    }),
  };
}

export function documentIdentityFromExtract(opts: {
  documentType: string;
  supplierId: string | null;
  sapPoNumber: string | null;
  quoteNumber: string | null;
  invoiceNumber: string | null;
  deliveryDocketNumber: string | null;
  lines: { partNumber: string | null; description: string }[];
}): DocumentIdentity {
  return identityFromDraft(opts);
}

async function userCanAccessProcurement(
  a: AuthUser,
  procurementId: string,
): Promise<boolean> {
  const prRows = await db
    .select({
      id: procurementRequest.id,
      organizationId: procurementRequest.organizationId,
    })
    .from(procurementRequest)
    .where(eq(procurementRequest.id, procurementId));
  if (prRows.length === 0 || prRows[0]!.organizationId !== a.organizationId) {
    return false;
  }
  if (a.globalRole === "org_admin") return true;
  const allowed = await db
    .select({ projectId: projectMember.projectId })
    .from(projectMember)
    .where(eq(projectMember.userId, a.id));
  const allowedIds = allowed.map((row) => row.projectId);
  if (allowedIds.length === 0) return false;
  const lines = await db
    .select({ id: procurementRequestLine.id })
    .from(procurementRequestLine)
    .where(
      and(
        eq(procurementRequestLine.procurementId, procurementId),
        inArray(procurementRequestLine.projectId, allowedIds),
      ),
    )
    .limit(1);
  return lines.length > 0;
}

async function previousDeliveryReceipt(
  procurementId: string,
  docketNumber: string | null,
): Promise<Record<string, number>> {
  const ref = normalizeRef(docketNumber);
  if (!ref) return {};
  const rows = await db
    .select()
    .from(procurementSourceDocument)
    .where(
      and(
        eq(procurementSourceDocument.procurementId, procurementId),
        eq(procurementSourceDocument.documentType, "delivery_docket"),
      ),
    );
  const found = rows.find((row) => normalizeRef(row.referenceNumber) === ref);
  return parseReceipt(found?.receiptJson);
}

async function saveSourceDocument(opts: {
  a: AuthUser;
  procurementId: string;
  documentType: string;
  referenceNumber: string | null;
  poNumber: string | null;
  receipt: Record<string, number> | null;
}): Promise<void> {
  const receiptJson = opts.receipt ? JSON.stringify(opts.receipt) : null;
  const ref = normalizeRef(opts.referenceNumber);
  if (ref) {
    const rows = await db
      .select()
      .from(procurementSourceDocument)
      .where(
        and(
          eq(procurementSourceDocument.procurementId, opts.procurementId),
          eq(procurementSourceDocument.documentType, opts.documentType),
        ),
      );
    const found = rows.find((row) => normalizeRef(row.referenceNumber) === ref);
    if (found) {
      await db
        .update(procurementSourceDocument)
        .set({
          referenceNumber: opts.referenceNumber,
          poNumber: opts.poNumber,
          receiptJson,
          notes: "Imported purchasing document",
        })
        .where(eq(procurementSourceDocument.id, found.id));
      return;
    }
  }
  await db.insert(procurementSourceDocument).values({
    procurementId: opts.procurementId,
    organizationId: opts.a.organizationId,
    documentType: opts.documentType,
    referenceNumber: opts.referenceNumber,
    poNumber: opts.poNumber,
    notes: "Imported purchasing document",
    receiptJson,
    createdById: opts.a.id,
  });
}

async function touchProjectItems(ids: (string | null | undefined)[]): Promise<void> {
  const unique = [...new Set(ids.filter((id): id is string => Boolean(id)))];
  for (const id of unique) {
    await syncProjectItemStatus(id);
  }
}

async function reload(
  procurementId: string,
): Promise<{ procurement: ProcRow; lines: LineRow[] }> {
  await syncProcurementStatusFromLineReceipts(procurementId);
  const [procurement] = await db
    .select()
    .from(procurementRequest)
    .where(eq(procurementRequest.id, procurementId));
  const lines = await db
    .select()
    .from(procurementRequestLine)
    .where(eq(procurementRequestLine.procurementId, procurementId));
  if (!procurement) {
    throw new Error("Purchasing record disappeared during import");
  }
  return { procurement, lines };
}

export async function createProcurementFromDocument(
  a: AuthUser,
  body: ProcurementAiConfirmBody,
  supplierId: string | null,
): Promise<
  | { ok: true; procurement: ProcRow; lines: LineRow[]; mode: "created" }
  | { ok: false; error: string; status: number }
> {
  const documentType = body.documentType ?? "other";
  const delivery = documentType === "delivery_docket";
  const [procurement] = await db
    .insert(procurementRequest)
    .values({
      organizationId: a.organizationId,
      supplierId,
      title: body.title,
      status: body.status ?? "draft",
      fullyReceivedOverride: false,
      needBy: body.needBy ?? null,
      sapPoNumber: body.sapPoNumber ?? null,
      quoteNumber: body.quoteNumber ?? null,
      invoiceNumber: body.invoiceNumber ?? null,
      deliveryDocketNumbers: delivery
        ? body.deliveryDocketNumber?.trim() || null
        : null,
      createdById: a.id,
    })
    .returning();
  if (!procurement) {
    return { ok: false, error: "Failed to create purchasing record", status: 500 };
  }

  const lines: LineRow[] = [];
  const receipt: Record<string, number> = {};
  const itemIds: (string | null)[] = [];
  let orderIndex = 0;
  for (const line of body.lines) {
    const itemRes = await resolveProjectItemIdForLine(a, {
      projectId: line.projectId,
      partNumber: line.partNumber,
      description: line.description,
      quantity: line.quantity,
      unit: line.unit,
      createProjectItem: body.createProjectItems,
    });
    if (!itemRes.ok) {
      return { ok: false, error: itemRes.error, status: itemRes.status ?? 400 };
    }
    const delivered = delivery
      ? (parseWholeQty(line.deliveredQty) ?? parseWholeQty(line.quantity) ?? 0)
      : 0;
    const [created] = await db
      .insert(procurementRequestLine)
      .values({
        procurementId: procurement.id,
        projectId: line.projectId,
        projectItemId: itemRes.projectItemId,
        partNumber: line.partNumber ?? null,
        description: line.description,
        quantity: line.quantity,
        orderedQty: line.orderedQty?.trim() ? line.orderedQty : null,
        unit: line.unit ?? null,
        estUnitPrice: priceOrNull(line.estUnitPrice),
        orderIndex,
        receivedQty: delivered,
      })
      .returning();
    if (created) {
      lines.push(created);
      if (delivery) receipt[created.id] = delivered;
    }
    itemIds.push(itemRes.projectItemId);
    orderIndex += 1;
  }

  await saveSourceDocument({
    a,
    procurementId: procurement.id,
    documentType,
    referenceNumber: primaryDocumentReference({
      documentType,
      sapPoNumber: body.sapPoNumber ?? null,
      quoteNumber: body.quoteNumber ?? null,
      invoiceNumber: body.invoiceNumber ?? null,
      deliveryDocketNumber: body.deliveryDocketNumber ?? null,
    }),
    poNumber: body.sapPoNumber ?? null,
    receipt: delivery ? receipt : null,
  });
  await touchProjectItems(itemIds);
  const reloaded = await reload(procurement.id);
  return { ok: true, ...reloaded, mode: "created" };
}

export async function updateProcurementFromDocument(
  a: AuthUser,
  procurementId: string,
  body: ProcurementAiConfirmBody,
  supplierId: string | null,
): Promise<
  | { ok: true; procurement: ProcRow; lines: LineRow[]; mode: "updated" }
  | { ok: false; error: string; status: number }
> {
  if (!(await userCanAccessProcurement(a, procurementId))) {
    return { ok: false, error: "Purchasing record not found", status: 404 };
  }
  const [current] = await db
    .select()
    .from(procurementRequest)
    .where(
      and(
        eq(procurementRequest.id, procurementId),
        eq(procurementRequest.organizationId, a.organizationId),
      ),
    );
  if (!current) {
    return { ok: false, error: "Purchasing record not found", status: 404 };
  }

  const documentType = body.documentType ?? "other";
  const existingLines = await db
    .select()
    .from(procurementRequestLine)
    .where(eq(procurementRequestLine.procurementId, procurementId));
  for (const line of existingLines) {
    const projectAccess = await requireProject(a, line.projectId);
    if ("error" in projectAccess) {
      return {
        ok: false,
        error:
          "This order includes a project you cannot edit. An organization admin can import the document.",
        status: 403,
      };
    }
  }
  const previousReceipt =
    documentType === "delivery_docket"
      ? await previousDeliveryReceipt(procurementId, body.deliveryDocketNumber ?? null)
      : {};
  const plan = planDocumentApply({
    documentType,
    existingLines: existingLines.map((line) => ({
      id: line.id,
      partNumber: line.partNumber,
      description: line.description,
      quantity: line.quantity,
      orderedQty: line.orderedQty,
      unit: line.unit,
      estUnitPrice: line.estUnitPrice,
      receivedQty: line.receivedQty,
      projectId: line.projectId,
    })),
    incoming: incomingFromBody(body),
    previousReceiptByLineId: previousReceipt,
  });
  const header = planHeaderUpdate({
    currentStatus: current.status,
    currentSupplierId: current.supplierId,
    currentNeedBy: current.needBy,
    currentPoNumber: current.sapPoNumber,
    currentQuoteNumber: current.quoteNumber,
    currentInvoiceNumber: current.invoiceNumber,
    currentDocketNumbers: current.deliveryDocketNumbers,
    documentType,
    formStatus: body.status ?? null,
    supplierId,
    needBy: body.needBy ?? null,
    sapPoNumber: body.sapPoNumber ?? null,
    quoteNumber: body.quoteNumber ?? null,
    invoiceNumber: body.invoiceNumber ?? null,
    deliveryDocketNumber: body.deliveryDocketNumber ?? null,
  });

  await db
    .update(procurementRequest)
    .set({
      supplierId: header.supplierId,
      status: header.status as ProcRow["status"],
      needBy: header.needBy,
      sapPoNumber: header.sapPoNumber,
      quoteNumber: header.quoteNumber,
      invoiceNumber: header.invoiceNumber,
      deliveryDocketNumbers: header.deliveryDocketNumbers,
      version: (current.version ?? 0) + 1,
      updatedAt: new Date(),
    })
    .where(eq(procurementRequest.id, procurementId));

  const byId = new Map(existingLines.map((line) => [line.id, line]));
  const itemIds: (string | null)[] = [];
  const receipt: Record<string, number> = {};

  for (const update of plan.updates) {
    const line = byId.get(update.lineId);
    if (!line) continue;
    await db
      .update(procurementRequestLine)
      .set({
        partNumber: update.partNumber,
        description: update.description,
        quantity: update.quantity,
        orderedQty: update.orderedQty,
        unit: update.unit,
        estUnitPrice: update.estUnitPrice,
        receivedQty: update.receivedQty,
        version: (line.version ?? 0) + 1,
      })
      .where(eq(procurementRequestLine.id, update.lineId));
    if (update.receiptContribution != null) {
      receipt[update.lineId] = update.receiptContribution;
    }
    itemIds.push(line.projectItemId);
  }

  let orderIndex =
    existingLines.reduce((max, line) => Math.max(max, line.orderIndex), -1) + 1;
  for (const insert of plan.inserts) {
    const itemRes = await resolveProjectItemIdForLine(a, {
      projectId: insert.projectId,
      partNumber: insert.partNumber,
      description: insert.description,
      quantity: insert.quantity,
      unit: insert.unit,
      createProjectItem: body.createProjectItems,
    });
    if (!itemRes.ok) {
      return { ok: false, error: itemRes.error, status: itemRes.status ?? 400 };
    }
    const [created] = await db
      .insert(procurementRequestLine)
      .values({
        procurementId,
        projectId: insert.projectId,
        projectItemId: itemRes.projectItemId,
        partNumber: insert.partNumber,
        description: insert.description,
        quantity: insert.quantity,
        orderedQty: insert.orderedQty,
        unit: insert.unit,
        estUnitPrice: insert.estUnitPrice,
        orderIndex,
        receivedQty: insert.receivedQty,
      })
      .returning();
    if (created && insert.receiptContribution != null) {
      receipt[created.id] = insert.receiptContribution;
    }
    itemIds.push(itemRes.projectItemId);
    orderIndex += 1;
  }

  await saveSourceDocument({
    a,
    procurementId,
    documentType,
    referenceNumber: primaryDocumentReference({
      documentType,
      sapPoNumber: body.sapPoNumber ?? null,
      quoteNumber: body.quoteNumber ?? null,
      invoiceNumber: body.invoiceNumber ?? null,
      deliveryDocketNumber: body.deliveryDocketNumber ?? null,
    }),
    poNumber: header.sapPoNumber,
    receipt: documentType === "delivery_docket" ? receipt : null,
  });
  await touchProjectItems(itemIds);
  const reloaded = await reload(procurementId);
  return { ok: true, ...reloaded, mode: "updated" };
}
