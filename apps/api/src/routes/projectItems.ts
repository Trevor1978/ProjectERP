import { Hono } from "hono";
import { and, asc, eq } from "drizzle-orm";
import { db, projectItem, procurementRequestLine } from "@project-erp/db";
import { projectItemCreate, projectItemPatch } from "@project-erp/validators";
import { requireAuth, type AuthUser } from "../lib/session.js";
import { requireProject } from "../lib/projectAccess.js";
import { syncProjectItemStatus } from "../lib/syncProjectItemStatus.js";
import { effectiveOrderedQty } from "../lib/procurementReceipt.js";

const app = new Hono();
app.use("/*", requireAuth);

function itemSummary(
  item: typeof projectItem.$inferSelect,
  lines: (typeof procurementRequestLine.$inferSelect)[],
) {
  let orderedTotal = 0;
  let receivedTotal = 0;
  for (const line of lines) {
    orderedTotal += Number(effectiveOrderedQty(line.quantity, line.orderedQty)) || 0;
    receivedTotal += line.receivedQty;
  }
  return {
    ...item,
    linkedLineCount: lines.length,
    orderedTotal,
    receivedTotal,
  };
}

app.get("/projects/:projectId/items", async (c) => {
  const a = c.get("auth") as AuthUser;
  const projectId = c.req.param("projectId");
  const pr = await requireProject(a, projectId);
  if ("error" in pr) {
    return c.json({ error: pr.error }, pr.status);
  }
  const items = await db
    .select()
    .from(projectItem)
    .where(eq(projectItem.projectId, projectId))
    .orderBy(asc(projectItem.orderIndex), asc(projectItem.createdAt));

  const lines = await db
    .select()
    .from(procurementRequestLine)
    .where(eq(procurementRequestLine.projectId, projectId));

  const byItem = new Map<string, (typeof procurementRequestLine.$inferSelect)[]>();
  for (const line of lines) {
    if (!line.projectItemId) continue;
    const list = byItem.get(line.projectItemId) ?? [];
    list.push(line);
    byItem.set(line.projectItemId, list);
  }

  return c.json({
    items: items.map((item) => itemSummary(item, byItem.get(item.id) ?? [])),
  });
});

app.post("/project-items", async (c) => {
  const a = c.get("auth") as AuthUser;
  const p = projectItemCreate.safeParse(await c.req.json());
  if (!p.success) {
    return c.json({ error: p.error.flatten() }, 400);
  }
  const pr = await requireProject(a, p.data.projectId);
  if ("error" in pr) {
    return c.json({ error: pr.error }, pr.status);
  }
  const [row] = await db
    .insert(projectItem)
    .values({
      projectId: p.data.projectId,
      kind: p.data.kind,
      partNumber: p.data.partNumber ?? null,
      description: p.data.description,
      quantity: p.data.quantity,
      unit: p.data.unit ?? null,
      status: p.data.status,
      notes: p.data.notes ?? "",
      orderIndex: p.data.orderIndex,
    })
    .returning();
  return c.json({ item: row });
});

app.patch("/project-items/:id", async (c) => {
  const a = c.get("auth") as AuthUser;
  const id = c.req.param("id");
  const body = projectItemPatch.safeParse(await c.req.json());
  if (!body.success) {
    return c.json({ error: body.error.flatten() }, 400);
  }
  const cur = await db.select().from(projectItem).where(eq(projectItem.id, id));
  if (cur.length === 0) {
    return c.json({ error: "Not found" }, 404);
  }
  const pr = await requireProject(a, cur[0]!.projectId);
  if ("error" in pr) {
    return c.json({ error: pr.error }, pr.status);
  }
  const patch = body.data;
  if (patch.version !== cur[0]!.version) {
    return c.json({ error: "Version conflict" }, 409);
  }
  const [row] = await db
    .update(projectItem)
    .set({
      ...(patch.kind !== undefined ? { kind: patch.kind } : {}),
      ...(patch.partNumber !== undefined ? { partNumber: patch.partNumber } : {}),
      ...(patch.description !== undefined ? { description: patch.description } : {}),
      ...(patch.quantity !== undefined ? { quantity: patch.quantity } : {}),
      ...(patch.unit !== undefined ? { unit: patch.unit } : {}),
      ...(patch.status !== undefined ? { status: patch.status } : {}),
      ...(patch.notes !== undefined ? { notes: patch.notes } : {}),
      ...(patch.orderIndex !== undefined ? { orderIndex: patch.orderIndex } : {}),
      version: cur[0]!.version + 1,
      updatedAt: new Date(),
    })
    .where(eq(projectItem.id, id))
    .returning();
  if (patch.status === undefined) {
    await syncProjectItemStatus(id);
  }
  const refreshed = await db.select().from(projectItem).where(eq(projectItem.id, id));
  const linked = await db
    .select()
    .from(procurementRequestLine)
    .where(eq(procurementRequestLine.projectItemId, id));
  return c.json({ item: itemSummary(refreshed[0]!, linked) });
});

app.delete("/project-items/:id", async (c) => {
  const a = c.get("auth") as AuthUser;
  const id = c.req.param("id");
  const cur = await db.select().from(projectItem).where(eq(projectItem.id, id));
  if (cur.length === 0) {
    return c.json({ error: "Not found" }, 404);
  }
  const pr = await requireProject(a, cur[0]!.projectId);
  if ("error" in pr) {
    return c.json({ error: pr.error }, pr.status);
  }
  await db.delete(projectItem).where(eq(projectItem.id, id));
  return c.json({ ok: true });
});

export const projectItemsApp = app;
