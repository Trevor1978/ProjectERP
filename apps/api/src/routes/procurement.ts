import { Hono } from "hono";
import type { Context } from "hono";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import {
  db,
  procurementRequest,
  procurementRequestLine,
  task,
  project,
  projectMember,
  supplier,
} from "@project-erp/db";
import {
  procurementCreate,
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

app.get("/procurement", async (c) => {
  const a = c.get("auth") as AuthUser;
  const projectId = c.req.query("projectId");
  let rows: (typeof procurementRequest.$inferSelect)[] = [];
  if (projectId) {
    const pr = await requireProject(a, projectId);
    if ("error" in pr) {
      return c.json({ error: pr.error }, pr.status);
    }
    rows = await db
      .select()
      .from(procurementRequest)
      .where(eq(procurementRequest.projectId, projectId))
      .orderBy(desc(procurementRequest.updatedAt));
  } else if (a.globalRole === "org_admin") {
    const prows = await db
      .select({ id: project.id })
      .from(project)
      .where(eq(project.organizationId, a.organizationId));
    const pids = prows.map((p) => p.id);
    rows = pids.length
      ? await db
          .select()
          .from(procurementRequest)
          .where(inArray(procurementRequest.projectId, pids))
          .orderBy(desc(procurementRequest.updatedAt))
      : [];
  } else {
    const mem = await db
      .select({ projectId: projectMember.projectId })
      .from(projectMember)
      .where(eq(projectMember.userId, a.id));
    const pids = mem.map((m) => m.projectId);
    rows = pids.length
      ? await db
          .select()
          .from(procurementRequest)
          .where(inArray(procurementRequest.projectId, pids))
          .orderBy(desc(procurementRequest.updatedAt))
      : [];
  }
  const ids = rows.map((r) => r.id);
  const lines = ids.length
    ? await db
        .select()
        .from(procurementRequestLine)
        .where(inArray(procurementRequestLine.procurementId, ids))
        .orderBy(asc(procurementRequestLine.orderIndex))
    : [];
  return c.json({ procurement: rows, lines });
});

const MAX_DBF_BYTES = 30 * 1024 * 1024;

const importDbfForm = z.object({
  projectId: z.string().uuid(),
  taskId: z.string().uuid().optional().nullable(),
});

/** Shared by `POST /api/procurement/import-dbf` and root `POST /api/bom-dbf-import` (avoids some proxy/router quirks). */
export async function handleProcurementImportDbf(c: Context) {
  const a = c.get("auth") as AuthUser;
  const body = await c.req.parseBody();
  const projectIdRaw = body["projectId"];
  const taskIdRaw = body["taskId"];
  const file = body["file"];
  const parsed = importDbfForm.safeParse({
    projectId: typeof projectIdRaw === "string" ? projectIdRaw : "",
    taskId:
      typeof taskIdRaw === "string" && taskIdRaw.trim()
        ? taskIdRaw.trim()
        : null,
  });
  if (!parsed.success) {
    return c.json({ error: parsed.error.flatten() }, 400);
  }
  const { projectId, taskId } = parsed.data;
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

  let taskIdResolved: string | null = null;
  if (taskId) {
    const t = await db.select().from(task).where(eq(task.id, taskId));
    if (t.length === 0 || t[0]!.projectId !== projectId) {
      return c.json({ error: "taskId not in this project" }, 400);
    }
    taskIdResolved = taskId;
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
          projectId,
          taskId: taskIdResolved,
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

app.post("/procurement", async (c) => {
  const a = c.get("auth") as AuthUser;
  const p = procurementCreate.safeParse(await c.req.json());
  if (!p.success) {
    return c.json({ error: p.error.flatten() }, 400);
  }
  const pr = await requireProject(a, p.data.projectId);
  if ("error" in pr) {
    return c.json({ error: pr.error }, pr.status);
  }
  if (p.data.taskId) {
    const t = await db
      .select()
      .from(task)
      .where(eq(task.id, p.data.taskId));
    if (t.length === 0 || t[0]!.projectId !== p.data.projectId) {
      return c.json({ error: "Task not in project" }, 400);
    }
  }
  const sid = await supplierIdForOrg(a, p.data.supplierId);
  if (!sid.ok) {
    return c.json({ error: sid.message }, 400);
  }
  const [row] = await db
    .insert(procurementRequest)
    .values({
      projectId: p.data.projectId,
      taskId: p.data.taskId ?? null,
      supplierId: sid.supplierId,
      title: p.data.title,
      status: p.data.status,
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
    .where(eq(procurementRequest.id, id));
  if (cur.length === 0) {
    return c.json({ error: "Not found" }, 404);
  }
  const pr = await requireProject(a, cur[0]!.projectId);
  if ("error" in pr) {
    return c.json({ error: pr.error }, pr.status);
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
  const [row] = await db
    .update(procurementRequest)
    .set({
      taskId: p.data.taskId === undefined ? cur[0]!.taskId : p.data.taskId,
      supplierId: nextSupplierId,
      title: p.data.title ?? cur[0]!.title,
      status: p.data.status ?? cur[0]!.status,
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
    .where(eq(procurementRequest.id, p.data.procurementId));
  if (prq.length === 0) {
    return c.json({ error: "Not found" }, 404);
  }
  const pr = await requireProject(a, prq[0]!.projectId);
  if ("error" in pr) {
    return c.json({ error: pr.error }, pr.status);
  }
  const qty =
    typeof p.data.quantity === "number"
      ? String(p.data.quantity)
      : p.data.quantity;
  const [line] = await db
    .insert(procurementRequestLine)
    .values({
      procurementId: p.data.procurementId,
      description: p.data.description,
      quantity: qty,
      unit: p.data.unit ?? null,
      estUnitPrice:
        p.data.estUnitPrice === undefined
          ? null
          : Number(p.data.estUnitPrice),
      orderIndex: p.data.orderIndex,
    })
    .returning();
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
    .where(eq(procurementRequest.id, cur[0]!.procurementId));
  if (prq.length === 0) {
    return c.json({ error: "Not found" }, 404);
  }
  const pr = await requireProject(a, prq[0]!.projectId);
  if ("error" in pr) {
    return c.json({ error: pr.error }, pr.status);
  }
  if (p.data.version !== undefined && p.data.version !== cur[0]!.version) {
    return c.json({ error: "Version conflict" }, 409);
  }
  const qty = p.data.quantity
    ? typeof p.data.quantity === "number"
      ? String(p.data.quantity)
      : p.data.quantity
    : cur[0]!.quantity;
  const [line] = await db
    .update(procurementRequestLine)
    .set({
      description: p.data.description ?? cur[0]!.description,
      quantity: qty,
      unit: p.data.unit === undefined ? cur[0]!.unit : p.data.unit,
      estUnitPrice:
        p.data.estUnitPrice === undefined
          ? cur[0]!.estUnitPrice
          : p.data.estUnitPrice === null
            ? null
            : Number(p.data.estUnitPrice),
      orderIndex: p.data.orderIndex ?? cur[0]!.orderIndex,
      version: (cur[0]!.version ?? 0) + 1,
    })
    .where(eq(procurementRequestLine.id, id))
    .returning();
  return c.json({ line });
});

app.post("/procurement/:id/sap-refresh", async (c) => {
  const a = c.get("auth") as AuthUser;
  const id = c.req.param("id");
  const cur = await db
    .select()
    .from(procurementRequest)
    .where(eq(procurementRequest.id, id));
  if (cur.length === 0) {
    return c.json({ error: "Not found" }, 404);
  }
  if (!cur[0]!.sapPoNumber) {
    return c.json({ error: "Set sapPoNumber first" }, 400);
  }
  const pr = await requireProject(a, cur[0]!.projectId);
  if ("error" in pr) {
    return c.json({ error: pr.error }, pr.status);
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
  const ok = await executeDeleteProcurementLine(a, id);
  if (!ok) {
    return c.json({ error: "Not found" }, 404);
  }
  return c.json({ ok: true });
});

export const procurementApp = app;
