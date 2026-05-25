import { Hono } from "hono";
import type { Context } from "hono";
import { and, asc, desc, eq, inArray, max } from "drizzle-orm";
import { z } from "zod";
import {
  db,
  comment,
  procurementRequest,
  procurementRequestLine,
  project,
  projectMember,
  supplier,
} from "@project-erp/db";
import {
  procurementCreate,
  procurementMerge,
  procurementPatch,
  procurementLineCreate,
  procurementLinePatch,
} from "@project-erp/validators";
import { requireAuth, type AuthUser } from "../lib/session.js";
import { requireProject } from "../lib/projectAccess.js";
import { writeAudit } from "../lib/audit.js";
import {
  executeDeleteProcurement,
  executeDeleteProcurementLine,
  previewDeleteProcurement,
  previewDeleteProcurementLine,
} from "../lib/deleteResource.js";
import { fetchSapPoLines } from "../lib/sap.js";
import { syncProcurementStatusFromLineReceipts } from "../lib/syncProcurementReceiveStatus.js";
import { resolveProjectItemIdForLine } from "../lib/projectItemForLine.js";
import { syncProjectItemStatus } from "../lib/syncProjectItemStatus.js";
import {
  groupBomRowsByManufacturer,
  readDbfRecordsFromBuffer,
  procurementTitleForManufacturer,
} from "../lib/bomDbfImport.js";

const app = new Hono();
app.use("/*", requireAuth);

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
    .where(and(eq(supplier.id, supplierId), eq(supplier.organizationId, a.organizationId)));
  if (rows.length === 0) {
    return { ok: false, message: "Supplier not found" };
  }
  return { ok: true, supplierId };
}

async function allowedProjectIdsForUser(a: AuthUser): Promise<string[]> {
  if (a.globalRole === "org_admin") {
    const rows = await db
      .select({ id: project.id })
      .from(project)
      .where(eq(project.organizationId, a.organizationId));
    return rows.map((r) => r.id);
  }
  const rows = await db
    .select({ projectId: projectMember.projectId })
    .from(projectMember)
    .where(eq(projectMember.userId, a.id));
  return rows.map((r) => r.projectId);
}

async function canAccessProcurement(a: AuthUser, procurementId: string): Promise<boolean> {
  const prRows = await db
    .select({ id: procurementRequest.id, organizationId: procurementRequest.organizationId })
    .from(procurementRequest)
    .where(eq(procurementRequest.id, procurementId));
  if (prRows.length === 0 || prRows[0]!.organizationId !== a.organizationId) {
    return false;
  }
  if (a.globalRole === "org_admin") {
    return true;
  }
  const allowedIds = await allowedProjectIdsForUser(a);
  if (allowedIds.length === 0) {
    return false;
  }
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

app.get("/procurement", async (c) => {
  const a = c.get("auth") as AuthUser;
  const projectId = c.req.query("projectId");
  let rows: (typeof procurementRequest.$inferSelect)[] = [];
  let lines: (typeof procurementRequestLine.$inferSelect)[] = [];
  if (projectId) {
    const pr = await requireProject(a, projectId);
    if ("error" in pr) {
      return c.json({ error: pr.error }, pr.status);
    }
    lines = await db
      .select()
      .from(procurementRequestLine)
      .where(eq(procurementRequestLine.projectId, projectId))
      .orderBy(asc(procurementRequestLine.orderIndex));
  } else {
    const allowedIds = await allowedProjectIdsForUser(a);
    if (a.globalRole === "org_admin") {
      rows = await db
        .select()
        .from(procurementRequest)
        .where(eq(procurementRequest.organizationId, a.organizationId))
        .orderBy(desc(procurementRequest.updatedAt));
      const ids = rows.map((r) => r.id);
      lines = ids.length
        ? await db
            .select()
            .from(procurementRequestLine)
            .where(inArray(procurementRequestLine.procurementId, ids))
            .orderBy(asc(procurementRequestLine.orderIndex))
        : [];
      return c.json({ procurement: rows, lines });
    }
    lines = allowedIds.length
      ? await db
          .select()
          .from(procurementRequestLine)
          .where(inArray(procurementRequestLine.projectId, allowedIds))
          .orderBy(asc(procurementRequestLine.orderIndex))
      : [];
  }
  const ids = Array.from(new Set(lines.map((l) => l.procurementId)));
  rows = ids.length
    ? await db
        .select()
        .from(procurementRequest)
        .where(
          and(
            inArray(procurementRequest.id, ids),
            eq(procurementRequest.organizationId, a.organizationId),
          ),
        )
        .orderBy(desc(procurementRequest.updatedAt))
    : [];
  return c.json({ procurement: rows, lines });
});

const MAX_DBF_BYTES = 30 * 1024 * 1024;

const importDbfForm = z.object({
  projectId: z.string().uuid(),
});

/** Shared by `POST /api/procurement/import-dbf` and root `POST /api/bom-dbf-import` (avoids some proxy/router quirks). */
export async function handleProcurementImportDbf(c: Context) {
  const a = c.get("auth") as AuthUser;
  const body = await c.req.parseBody();
  const projectIdRaw = body["projectId"];
  const file = body["file"];
  const parsed = importDbfForm.safeParse({
    projectId: typeof projectIdRaw === "string" ? projectIdRaw : "",
  });
  if (!parsed.success) {
    return c.json({ error: parsed.error.flatten() }, 400);
  }
  const { projectId } = parsed.data;
  if (!(file instanceof File)) {
    return c.json({ error: "Expected multipart field \"file\" (DBF)" }, 400);
  }
  const buf = Buffer.from(await file.arrayBuffer());
  if (buf.length === 0) {
    return c.json({ error: "Empty file" }, 400);
  }
  if (buf.length > MAX_DBF_BYTES) {
    return c.json({ error: "DBF file too large (max 30MB)" }, 400);
  }

  const pr = await requireProject(a, projectId);
  if ("error" in pr) {
    return c.json({ error: pr.error }, pr.status);
  }

  let records: Record<string, unknown>[] = [];
  let fieldNames: string[] = [];
  try {
    const r = await readDbfRecordsFromBuffer(buf);
    records = r.records;
    fieldNames = r.fieldNames;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return c.json({ error: `Could not read DBF: ${msg}` }, 400);
  }

  if (records.length === 0) {
    return c.json({ error: "No data rows in DBF" }, 400);
  }

  const byMfg = groupBomRowsByManufacturer(records, fieldNames);
  const created: { id: string; title: string; lineCount: number }[] = [];

  await db.transaction(async (tx) => {
    for (const [mfg, lines] of byMfg) {
      const title = procurementTitleForManufacturer(mfg);
      const [row] = await tx
        .insert(procurementRequest)
        .values({
          organizationId: a.organizationId,
          supplierId: null,
          title,
          status: "draft",
          createdById: a.id,
        })
        .returning();
      if (!row) {
        throw new Error("Failed to insert procurement");
      }
      for (let i = 0; i < lines.length; i++) {
        const ln = lines[i]!;
        await tx.insert(procurementRequestLine).values({
          procurementId: row.id,
          projectId,
          partNumber: ln.partNumber ?? null,
          description: ln.description,
          quantity: ln.quantity,
          unit: ln.unit,
          orderIndex: i,
        });
      }
      created.push({ id: row.id, title: row.title, lineCount: lines.length });
    }
  });

  await writeAudit(a, "procurement.import_dbf", "project", projectId, {
    fileName: file.name,
    manufacturers: created.length,
    lines: created.reduce((s, x) => s + x.lineCount, 0),
  });

  return c.json({ created, rowCount: records.length });
}

app.post("/procurement/import-dbf", handleProcurementImportDbf);

app.post("/procurement/merge", async (c) => {
  const a = c.get("auth") as AuthUser;
  const p = procurementMerge.safeParse(await c.req.json());
  if (!p.success) {
    return c.json({ error: p.error.flatten() }, 400);
  }
  const ids = p.data.ids;
  if (new Set(ids).size !== ids.length) {
    return c.json({ error: "Duplicate ids" }, 400);
  }
  const primaryId = ids[0]!;
  const mergeIds = ids.slice(1);

  const rows = await db
    .select()
    .from(procurementRequest)
    .where(
      and(
        inArray(procurementRequest.id, ids),
        eq(procurementRequest.organizationId, a.organizationId),
      ),
    );
  if (rows.length !== ids.length) {
    return c.json({ error: "Not found" }, 404);
  }
  if (!(await canAccessProcurement(a, primaryId))) {
    return c.json({ error: "Not found" }, 404);
  }
  for (const id of mergeIds) {
    if (!(await canAccessProcurement(a, id))) {
      return c.json({ error: "Not found" }, 404);
    }
  }

  const primaryRow = rows.find((r) => r.id === primaryId);
  if (!primaryRow) {
    return c.json({ error: "Not found" }, 404);
  }

  let movedLineCount = 0;
  await db.transaction(async (tx) => {
    const [agg] = await tx
      .select({ mx: max(procurementRequestLine.orderIndex) })
      .from(procurementRequestLine)
      .where(eq(procurementRequestLine.procurementId, primaryId));
    let nextOrder =
      agg?.mx == null ? 0 : Number(agg.mx) + 1;

    for (const mid of mergeIds) {
      const lines = await tx
        .select()
        .from(procurementRequestLine)
        .where(eq(procurementRequestLine.procurementId, mid))
        .orderBy(asc(procurementRequestLine.orderIndex));
      for (const line of lines) {
        await tx
          .update(procurementRequestLine)
          .set({
            procurementId: primaryId,
            orderIndex: nextOrder,
            version: (line.version ?? 0) + 1,
          })
          .where(eq(procurementRequestLine.id, line.id));
        nextOrder += 1;
        movedLineCount += 1;
      }
    }

    if (mergeIds.length > 0) {
      await tx
        .delete(comment)
        .where(
          and(
            eq(comment.parentType, "procurement"),
            inArray(comment.parentId, mergeIds),
          ),
        );
    }
    await tx
      .delete(procurementRequest)
      .where(inArray(procurementRequest.id, mergeIds));
    await tx
      .update(procurementRequest)
      .set({
        version: (primaryRow.version ?? 0) + 1,
        updatedAt: new Date(),
      })
      .where(eq(procurementRequest.id, primaryId));
  });

  await syncProcurementStatusFromLineReceipts(primaryId);
  const [primaryOut] = await db
    .select()
    .from(procurementRequest)
    .where(eq(procurementRequest.id, primaryId));
  await writeAudit(a, "procurement.merge", "procurement", primaryId, {
    mergedIds: mergeIds,
    movedLines: movedLineCount,
  });
  return c.json({
    procurement: primaryOut,
    movedLineCount,
  });
});

app.post("/procurement", async (c) => {
  const a = c.get("auth") as AuthUser;
  const p = procurementCreate.safeParse(await c.req.json());
  if (!p.success) {
    return c.json({ error: p.error.flatten() }, 400);
  }
  const sid = await supplierIdForOrg(a, p.data.supplierId);
  if (!sid.ok) {
    return c.json({ error: sid.message }, 400);
  }
  const [row] = await db
    .insert(procurementRequest)
    .values({
      organizationId: a.organizationId,
      supplierId: sid.supplierId,
      title: p.data.title,
      status: p.data.status,
      fullyReceivedOverride: p.data.fullyReceivedOverride ?? false,
      needBy: p.data.needBy ?? null,
      sapPoNumber: p.data.sapPoNumber ?? null,
      createdById: a.id,
    })
    .returning();
  await writeAudit(
    a,
    "procurement.create",
    "procurement",
    row?.id ?? "",
    { title: p.data.title },
  );
  return c.json({ procurement: row });
});

app.patch("/procurement/:id", async (c) => {
  const a = c.get("auth") as AuthUser;
  const id = c.req.param("id");
  const p = procurementPatch.safeParse(await c.req.json());
  if (!p.success) {
    return c.json({ error: p.error.flatten() }, 400);
  }
  const cur = await db
    .select()
    .from(procurementRequest)
    .where(
      and(
        eq(procurementRequest.id, id),
        eq(procurementRequest.organizationId, a.organizationId),
      ),
    );
  if (cur.length === 0) {
    return c.json({ error: "Not found" }, 404);
  }
  if (!(await canAccessProcurement(a, id))) {
    return c.json({ error: "Not found" }, 404);
  }
  if (p.data.version !== undefined && p.data.version !== cur[0]!.version) {
    return c.json({ error: "Version conflict" }, 409);
  }
  let nextSupplierId = cur[0]!.supplierId;
  if (p.data.supplierId !== undefined) {
    const sid = await supplierIdForOrg(a, p.data.supplierId);
    if (!sid.ok) {
      return c.json({ error: sid.message }, 400);
    }
    nextSupplierId = sid.supplierId;
  }
  const nextOverride =
    p.data.fullyReceivedOverride === undefined
      ? cur[0]!.fullyReceivedOverride
      : p.data.fullyReceivedOverride;
  const overrideChanged =
    p.data.fullyReceivedOverride !== undefined &&
    p.data.fullyReceivedOverride !== cur[0]!.fullyReceivedOverride;
  const [row] = await db
    .update(procurementRequest)
    .set({
      supplierId: nextSupplierId,
      title: p.data.title ?? cur[0]!.title,
      status: p.data.status ?? cur[0]!.status,
      fullyReceivedOverride: nextOverride,
      needBy: p.data.needBy === undefined ? cur[0]!.needBy : p.data.needBy,
      sapPoNumber:
        p.data.sapPoNumber === undefined
          ? cur[0]!.sapPoNumber
          : p.data.sapPoNumber,
      version: (cur[0]!.version ?? 0) + 1,
      updatedAt: new Date(),
    })
    .where(eq(procurementRequest.id, id))
    .returning();
  if (overrideChanged) {
    await syncProcurementStatusFromLineReceipts(id);
    const [afterSync] = await db
      .select()
      .from(procurementRequest)
      .where(eq(procurementRequest.id, id));
    return c.json({ procurement: afterSync ?? row });
  }
  return c.json({ procurement: row });
});

app.post("/procurement-lines", async (c) => {
  const a = c.get("auth") as AuthUser;
  const p = procurementLineCreate.safeParse(await c.req.json());
  if (!p.success) {
    return c.json({ error: p.error.flatten() }, 400);
  }
  const prq = await db
    .select()
    .from(procurementRequest)
    .where(
      and(
        eq(procurementRequest.id, p.data.procurementId),
        eq(procurementRequest.organizationId, a.organizationId),
      ),
    );
  if (prq.length === 0) {
    return c.json({ error: "Not found" }, 404);
  }
  const itemRes = await resolveProjectItemIdForLine(a, {
    projectId: p.data.projectId,
    projectItemId: p.data.projectItemId,
    partNumber: p.data.partNumber,
    description: p.data.description,
    quantity: p.data.quantity,
    unit: p.data.unit,
    createProjectItem: p.data.createProjectItem,
  });
  if (!itemRes.ok) {
    return c.json({ error: itemRes.error }, 400);
  }
  const qty = p.data.quantity;
  const ordQty = p.data.orderedQty?.trim() ? p.data.orderedQty : null;
  const [line] = await db
    .insert(procurementRequestLine)
    .values({
      procurementId: p.data.procurementId,
      projectId: p.data.projectId,
      projectItemId: itemRes.projectItemId,
      partNumber: p.data.partNumber ?? null,
      description: p.data.description,
      quantity: qty,
      orderedQty: ordQty,
      unit: p.data.unit ?? null,
      estUnitPrice:
        p.data.estUnitPrice === undefined
          ? null
          : Number(p.data.estUnitPrice),
      orderIndex: p.data.orderIndex,
      receivedQty: p.data.receivedQty ?? 0,
    })
    .returning();
  if (itemRes.projectItemId) {
    await syncProjectItemStatus(itemRes.projectItemId);
  }
  await syncProcurementStatusFromLineReceipts(p.data.procurementId);
  return c.json({ line });
});

app.patch("/procurement-lines/:id", async (c) => {
  const a = c.get("auth") as AuthUser;
  const id = c.req.param("id");
  const p = procurementLinePatch.safeParse(await c.req.json());
  if (!p.success) {
    return c.json({ error: p.error.flatten() }, 400);
  }
  const cur = await db
    .select()
    .from(procurementRequestLine)
    .where(eq(procurementRequestLine.id, id));
  if (cur.length === 0) {
    return c.json({ error: "Not found" }, 404);
  }
  const prq = await db
    .select()
    .from(procurementRequest)
    .where(
      and(
        eq(procurementRequest.id, cur[0]!.procurementId),
        eq(procurementRequest.organizationId, a.organizationId),
      ),
    );
  if (prq.length === 0) {
    return c.json({ error: "Not found" }, 404);
  }
  const nextProjectId = p.data.projectId ?? cur[0]!.projectId;
  const pr = await requireProject(a, nextProjectId);
  if ("error" in pr) {
    return c.json({ error: pr.error }, pr.status);
  }
  if (p.data.version !== undefined && p.data.version !== cur[0]!.version) {
    return c.json({ error: "Version conflict" }, 409);
  }
  const nextDescription = p.data.description ?? cur[0]!.description;
  const nextQty = p.data.quantity ?? cur[0]!.quantity;
  let nextItemId =
    p.data.projectItemId !== undefined ? p.data.projectItemId : cur[0]!.projectItemId;

  if (p.data.projectItemId !== undefined && p.data.projectItemId !== null) {
    const itemRes = await resolveProjectItemIdForLine(a, {
      projectId: nextProjectId,
      projectItemId: p.data.projectItemId,
      description: nextDescription,
      quantity: nextQty,
      createProjectItem: false,
    });
    if (!itemRes.ok) {
      return c.json({ error: itemRes.error }, 400);
    }
    nextItemId = itemRes.projectItemId;
  } else if (p.data.projectId && p.data.projectId !== cur[0]!.projectId && nextItemId) {
    const itemRes = await resolveProjectItemIdForLine(a, {
      projectId: nextProjectId,
      projectItemId: nextItemId,
      description: nextDescription,
      quantity: nextQty,
      createProjectItem: false,
    });
    if (!itemRes.ok) {
      return c.json({ error: itemRes.error }, 400);
    }
  }

  const prevItemId = cur[0]!.projectItemId;
  const qty = nextQty;
  const orderedQty =
    p.data.orderedQty === undefined
      ? cur[0]!.orderedQty
      : p.data.orderedQty?.trim()
        ? p.data.orderedQty
        : null;
  const [line] = await db
    .update(procurementRequestLine)
    .set({
      projectId: nextProjectId,
      projectItemId: nextItemId,
      partNumber:
        p.data.partNumber === undefined ? cur[0]!.partNumber : p.data.partNumber,
      description: nextDescription,
      quantity: qty,
      orderedQty,
      unit: p.data.unit === undefined ? cur[0]!.unit : p.data.unit,
      estUnitPrice:
        p.data.estUnitPrice === undefined
          ? cur[0]!.estUnitPrice
          : p.data.estUnitPrice === null
            ? null
            : Number(p.data.estUnitPrice),
      orderIndex: p.data.orderIndex ?? cur[0]!.orderIndex,
      receivedQty:
        p.data.receivedQty === undefined
          ? cur[0]!.receivedQty
          : p.data.receivedQty,
      version: (cur[0]!.version ?? 0) + 1,
    })
    .where(eq(procurementRequestLine.id, id))
    .returning();
  if (prevItemId) await syncProjectItemStatus(prevItemId);
  if (nextItemId && nextItemId !== prevItemId) {
    await syncProjectItemStatus(nextItemId);
  } else if (nextItemId) {
    await syncProjectItemStatus(nextItemId);
  }
  await syncProcurementStatusFromLineReceipts(cur[0]!.procurementId);
  return c.json({ line });
});

app.post("/procurement/:id/sap-refresh", async (c) => {
  const a = c.get("auth") as AuthUser;
  const id = c.req.param("id");
  const cur = await db
    .select()
    .from(procurementRequest)
    .where(
      and(
        eq(procurementRequest.id, id),
        eq(procurementRequest.organizationId, a.organizationId),
      ),
    );
  if (cur.length === 0) {
    return c.json({ error: "Not found" }, 404);
  }
  if (!cur[0]!.sapPoNumber) {
    return c.json({ error: "Set sapPoNumber first" }, 400);
  }
  if (!(await canAccessProcurement(a, id))) {
    return c.json({ error: "Not found" }, 404);
  }
  const result = await fetchSapPoLines(cur[0]!.sapPoNumber);
  await db
    .update(procurementRequest)
    .set({
      sapLineCache: JSON.stringify({
        lines: result.lines,
        fetchedAt: result.fetchedAt,
      }),
      lastSapSyncAt: new Date(result.fetchedAt),
      version: (cur[0]!.version ?? 0) + 1,
      updatedAt: new Date(),
    })
    .where(eq(procurementRequest.id, id));
  return c.json({ lines: result.lines, fetchedAt: result.fetchedAt });
});

app.get("/procurement/:id/delete-preview", async (c) => {
  const a = c.get("auth") as AuthUser;
  const id = c.req.param("id");
  const p = await previewDeleteProcurement(a, id);
  if ("status" in p) {
    return c.json({ error: "Not found" }, 404);
  }
  return c.json({ preview: p });
});

app.delete("/procurement/:id", async (c) => {
  const a = c.get("auth") as AuthUser;
  const id = c.req.param("id");
  const ok = await executeDeleteProcurement(a, id);
  if (!ok) {
    return c.json({ error: "Not found" }, 404);
  }
  return c.json({ ok: true });
});

app.get("/procurement-lines/:id/delete-preview", async (c) => {
  const a = c.get("auth") as AuthUser;
  const id = c.req.param("id");
  const p = await previewDeleteProcurementLine(a, id);
  if ("status" in p) {
    return c.json({ error: "Not found" }, 404);
  }
  return c.json({ preview: p });
});

app.delete("/procurement-lines/:id", async (c) => {
  const a = c.get("auth") as AuthUser;
  const id = c.req.param("id");
  const before = await db
    .select({ projectItemId: procurementRequestLine.projectItemId })
    .from(procurementRequestLine)
    .where(eq(procurementRequestLine.id, id));
  const itemId = before[0]?.projectItemId;
  const ok = await executeDeleteProcurementLine(a, id);
  if (!ok) {
    return c.json({ error: "Not found" }, 404);
  }
  if (itemId) await syncProjectItemStatus(itemId);
  return c.json({ ok: true });
});

export const procurementApp = app;
