import { Hono } from "hono";
import { and, desc, eq, ilike, inArray, isNull, or, sql } from "drizzle-orm";
import {
  db,
  project,
  task,
  todo,
  savedFilter,
  notification,
  pushSubscription,
  documentLink,
  handover,
  comment,
  asset,
  assetServiceLog,
  projectAsset,
  projectBudget,
  client,
} from "@project-erp/db";
import {
  savedFilterCreate,
  savedFilterPatch,
  documentLinkCreate,
  documentLinkPatch,
  handoverCreate,
  commentCreate,
  assetCreate,
  assetPatch,
  assetServiceLogCreate,
  assetServiceLogPatch,
} from "@project-erp/validators";
import { requireAuth, type AuthUser } from "../lib/session.js";
import { requireProject } from "../lib/projectAccess.js";
import {
  executeDeleteAsset,
  executeDeleteServiceLog,
  previewDeleteAsset,
  previewDeleteServiceLog,
} from "../lib/deleteResource.js";
import { writeAudit } from "../lib/audit.js";
import {
  saveServiceReportFiles,
  updateServiceReportFiles,
} from "../lib/serviceReport/buildPdf.js";
import { isWebPushConfigured } from "../lib/webPush.js";

const app = new Hono();

app.use("/*", requireAuth);

/* --- Project budget (light financials) --- */
app.get("/projects/:projectId/budget", async (c) => {
  const a = c.get("auth") as AuthUser;
  const id = c.req.param("projectId");
  const pr = await requireProject(a, id);
  if ("error" in pr) {
    return c.json({ error: pr.error }, pr.status);
  }
  const b = await db
    .select()
    .from(projectBudget)
    .where(eq(projectBudget.projectId, id));
  return c.json({ budget: b[0] ?? null });
});

app.put("/projects/:projectId/budget", async (c) => {
  const a = c.get("auth") as AuthUser;
  const id = c.req.param("projectId");
  const pr = await requireProject(a, id);
  if ("error" in pr) {
    return c.json({ error: pr.error }, pr.status);
  }
  const b = (await c.req.json()) as {
    labour: number;
    material: number;
    other: number;
    currency?: string;
  };
  const ex = await db
    .select()
    .from(projectBudget)
    .where(eq(projectBudget.projectId, id));
  if (ex.length === 0) {
    const [row] = await db
      .insert(projectBudget)
      .values({
        projectId: id,
        labour: b.labour,
        material: b.material,
        other: b.other,
        currency: b.currency ?? "USD",
      })
      .returning();
    return c.json({ budget: row });
  }
  const [row] = await db
    .update(projectBudget)
    .set({
      labour: b.labour,
      material: b.material,
      other: b.other,
      currency: b.currency ?? ex[0]!.currency,
      version: (ex[0]!.version ?? 0) + 1,
      updatedAt: new Date(),
    })
    .where(eq(projectBudget.id, ex[0]!.id))
    .returning();
  return c.json({ budget: row });
});

/* --- Search (Postgres full-text) --- */
app.get("/search", async (c) => {
  const a = c.get("auth") as AuthUser;
  const q = c.req.query("q");
  if (!q || q.length < 2) {
    return c.json({ results: { projects: [], tasks: [], todos: [] } });
  }
  const prows = await db
    .select()
    .from(project)
    .where(eq(project.organizationId, a.organizationId));
  const pids = prows.map((p) => p.id);
  if (pids.length === 0) {
    return c.json({ results: { projects: [], tasks: [], todos: [] } });
  }
  const pattern = `%${q}%`;
  const tks = await db
    .select()
    .from(task)
    .where(
      and(
        inArray(task.projectId, pids),
        or(
          ilike(task.title, pattern),
          sql`coalesce(${task.description}, '') ilike ${pattern}`,
        ),
      ),
    );
  const tds = await db
    .select()
    .from(todo)
    .innerJoin(task, eq(todo.taskId, task.id))
    .where(
      and(
        inArray(task.projectId, pids),
        ilike(todo.title, pattern),
      ),
    );
  return c.json({
    results: {
      projects: prows.filter(
        (p) => p.name.toLowerCase().includes(q.toLowerCase()),
      ),
      tasks: tks,
      todos: tds.map((d) => ({ ...d.todo, _task: d.task })),
    },
  });
});

/* --- Saved filters --- */
app.get("/saved-filters", async (c) => {
  const a = c.get("auth") as AuthUser;
  const projectId = c.req.query("projectId");
  const whereCond = projectId
    ? and(
        eq(savedFilter.userId, a.id),
        eq(savedFilter.organizationId, a.organizationId),
        eq(savedFilter.projectId, projectId),
      )
    : and(
        eq(savedFilter.userId, a.id),
        eq(savedFilter.organizationId, a.organizationId),
      );
  const rows = await db
    .select()
    .from(savedFilter)
    .where(whereCond)
    .orderBy(desc(savedFilter.updatedAt));
  return c.json({ savedFilters: rows });
});

app.post("/saved-filters", async (c) => {
  const a = c.get("auth") as AuthUser;
  const p = savedFilterCreate.safeParse(await c.req.json());
  if (!p.success) {
    return c.json({ error: p.error.flatten() }, 400);
  }
  if (p.data.projectId) {
    const pr = await requireProject(a, p.data.projectId);
    if ("error" in pr) {
      return c.json({ error: pr.error }, pr.status);
    }
  }
  const [row] = await db
    .insert(savedFilter)
    .values({
      userId: a.id,
      organizationId: a.organizationId,
      projectId: p.data.projectId ?? null,
      name: p.data.name,
      kind: p.data.kind,
      filterJson: p.data.filterJson,
      isDefault: p.data.isDefault,
    })
    .returning();
  return c.json({ savedFilter: row });
});

app.patch("/saved-filters/:id", async (c) => {
  const a = c.get("auth") as AuthUser;
  const id = c.req.param("id");
  const p = savedFilterPatch.safeParse(await c.req.json());
  if (!p.success) {
    return c.json({ error: p.error.flatten() }, 400);
  }
  const cur = await db
    .select()
    .from(savedFilter)
    .where(eq(savedFilter.id, id));
  if (cur.length === 0 || cur[0]!.userId !== a.id) {
    return c.json({ error: "Not found" }, 404);
  }
  if (p.data.version !== undefined && p.data.version !== cur[0]!.version) {
    return c.json({ error: "Version conflict" }, 409);
  }
  const [row] = await db
    .update(savedFilter)
    .set({
      name: p.data.name ?? cur[0]!.name,
      filterJson: p.data.filterJson ?? cur[0]!.filterJson,
      isDefault: p.data.isDefault ?? cur[0]!.isDefault,
      version: (cur[0]!.version ?? 0) + 1,
      updatedAt: new Date(),
    })
    .where(eq(savedFilter.id, id))
    .returning();
  return c.json({ savedFilter: row });
});

/* --- Notifications (in-app) --- */
app.get("/notifications", async (c) => {
  const a = c.get("auth") as AuthUser;
  const rows = await db
    .select()
    .from(notification)
    .where(eq(notification.userId, a.id))
    .orderBy(desc(notification.createdAt))
    .limit(200);
  return c.json({ notifications: rows });
});

app.post("/notifications/:id/read", async (c) => {
  const a = c.get("auth") as AuthUser;
  const id = c.req.param("id");
  const cur = await db
    .select()
    .from(notification)
    .where(
      and(eq(notification.id, id), eq(notification.userId, a.id)),
    );
  if (cur.length === 0) {
    return c.json({ error: "Not found" }, 404);
  }
  await db
    .update(notification)
    .set({ readAt: new Date() })
    .where(eq(notification.id, id));
  return c.json({ ok: true });
});

app.post("/notifications/read-all", async (c) => {
  const a = c.get("auth") as AuthUser;
  await db
    .update(notification)
    .set({ readAt: new Date() })
    .where(and(eq(notification.userId, a.id), isNull(notification.readAt)));
  return c.json({ ok: true });
});

/* Web Push subscriptions for PWA notifications */
app.get("/push/status", async (c) => {
  const a = c.get("auth") as AuthUser;
  const rows = await db
    .select({ id: pushSubscription.id })
    .from(pushSubscription)
    .where(eq(pushSubscription.userId, a.id));
  return c.json({
    configured: isWebPushConfigured(),
    subscriptionCount: rows.length,
  });
});

app.post("/push/subscribe", async (c) => {
  const a = c.get("auth") as AuthUser;
  if (!isWebPushConfigured()) {
    return c.json({ error: "Web Push is not configured on the server" }, 503);
  }
  const body = (await c.req.json().catch(() => null)) as {
    endpoint?: string;
    keys?: { p256dh?: string; auth?: string };
  } | null;
  const endpoint = body?.endpoint?.trim();
  const p256dh = body?.keys?.p256dh?.trim();
  const authKey = body?.keys?.auth?.trim();
  if (!endpoint || !p256dh || !authKey) {
    return c.json({ error: "Invalid push subscription payload" }, 400);
  }

  const userAgent = c.req.header("user-agent") ?? null;
  const existing = await db
    .select({ id: pushSubscription.id })
    .from(pushSubscription)
    .where(eq(pushSubscription.endpoint, endpoint))
    .limit(1);

  if (existing.length > 0) {
    await db
      .update(pushSubscription)
      .set({
        userId: a.id,
        p256dh,
        auth: authKey,
        userAgent,
        updatedAt: new Date(),
      })
      .where(eq(pushSubscription.endpoint, endpoint));
  } else {
    await db.insert(pushSubscription).values({
      userId: a.id,
      endpoint,
      p256dh,
      auth: authKey,
      userAgent,
    });
  }

  return c.json({ ok: true });
});

app.delete("/push/unsubscribe", async (c) => {
  const a = c.get("auth") as AuthUser;
  const body = (await c.req.json().catch(() => ({}))) as {
    endpoint?: string;
  };
  const endpoint = body.endpoint?.trim();
  if (endpoint) {
    await db
      .delete(pushSubscription)
      .where(
        and(
          eq(pushSubscription.userId, a.id),
          eq(pushSubscription.endpoint, endpoint),
        ),
      );
  } else {
    await db
      .delete(pushSubscription)
      .where(eq(pushSubscription.userId, a.id));
  }
  return c.json({ ok: true });
});

/* --- Document links --- */
app.get("/projects/:projectId/documents", async (c) => {
  const a = c.get("auth") as AuthUser;
  const id = c.req.param("projectId");
  const pr = await requireProject(a, id);
  if ("error" in pr) {
    return c.json({ error: pr.error }, pr.status);
  }
  const rows = await db
    .select()
    .from(documentLink)
    .where(eq(documentLink.projectId, id));
  return c.json({ documents: rows });
});

app.post("/documents", async (c) => {
  const a = c.get("auth") as AuthUser;
  const p = documentLinkCreate.safeParse(await c.req.json());
  if (!p.success) {
    return c.json({ error: p.error.flatten() }, 400);
  }
  const pr = await requireProject(a, p.data.projectId);
  if ("error" in pr) {
    return c.json({ error: pr.error }, pr.status);
  }
  const [row] = await db
    .insert(documentLink)
    .values({
      projectId: p.data.projectId,
      kind: p.data.kind,
      label: p.data.label,
      url: p.data.url,
      createdById: a.id,
    })
    .returning();
  return c.json({ document: row });
});

app.patch("/documents/:id", async (c) => {
  const a = c.get("auth") as AuthUser;
  const id = c.req.param("id");
  const p = documentLinkPatch.safeParse(await c.req.json());
  if (!p.success) {
    return c.json({ error: p.error.flatten() }, 400);
  }
  const cur = await db
    .select()
    .from(documentLink)
    .where(eq(documentLink.id, id));
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
  const [row] = await db
    .update(documentLink)
    .set({
      kind: p.data.kind ?? cur[0]!.kind,
      label: p.data.label ?? cur[0]!.label,
      url: p.data.url ?? cur[0]!.url,
      version: (cur[0]!.version ?? 0) + 1,
      updatedAt: new Date(),
    })
    .where(eq(documentLink.id, id))
    .returning();
  return c.json({ document: row });
});

app.delete("/documents/:id", async (c) => {
  const a = c.get("auth") as AuthUser;
  const id = c.req.param("id");
  const cur = await db
    .select()
    .from(documentLink)
    .where(eq(documentLink.id, id));
  if (cur.length === 0) {
    return c.json({ error: "Not found" }, 404);
  }
  const pr = await requireProject(a, cur[0]!.projectId);
  if ("error" in pr) {
    return c.json({ error: pr.error }, pr.status);
  }
  await db.delete(documentLink).where(eq(documentLink.id, id));
  await writeAudit(a, "document.delete", "document_link", id, {
    projectId: cur[0]!.projectId,
  });
  return c.json({ ok: true });
});

/* --- Handover --- */
app.get("/projects/:projectId/handover", async (c) => {
  const a = c.get("auth") as AuthUser;
  const id = c.req.param("projectId");
  const pr = await requireProject(a, id);
  if ("error" in pr) {
    return c.json({ error: pr.error }, pr.status);
  }
  const rows = await db
    .select()
    .from(handover)
    .where(eq(handover.projectId, id));
  return c.json({ handover: rows[0] ?? null });
});

app.put("/projects/:projectId/handover", async (c) => {
  const a = c.get("auth") as AuthUser;
  const id = c.req.param("projectId");
  const p = handoverCreate.safeParse({
    projectId: id,
    ...(await c.req.json()),
  });
  if (!p.success) {
    return c.json({ error: p.error.flatten() }, 400);
  }
  const prw = await requireProject(a, id);
  if ("error" in prw) {
    return c.json({ error: prw.error }, prw.status);
  }
  const ex = await db
    .select()
    .from(handover)
    .where(eq(handover.projectId, id));
  if (ex.length === 0) {
    const [row] = await db
      .insert(handover)
      .values({
        projectId: id,
        asBuilt: p.data.asBuilt ?? null,
        spares: p.data.spares ?? null,
        supportNotes: p.data.supportNotes ?? null,
      })
      .returning();
    return c.json({ handover: row });
  }
  const h = ex[0]!;
  const [row] = await db
    .update(handover)
    .set({
      asBuilt: p.data.asBuilt === undefined ? h.asBuilt : p.data.asBuilt,
      spares: p.data.spares === undefined ? h.spares : p.data.spares,
      supportNotes:
        p.data.supportNotes === undefined
          ? h.supportNotes
          : p.data.supportNotes,
      version: (h.version ?? 0) + 1,
      updatedAt: new Date(),
    })
    .where(eq(handover.id, h.id))
    .returning();
  return c.json({ handover: row });
});

/* --- Comments --- */
app.get("/comments", async (c) => {
  const a = c.get("auth") as AuthUser;
  const t = c.req.query("type");
  const id = c.req.query("id");
  if (!t || !id) {
    return c.json({ error: "type and id required" }, 400);
  }
  const rows = await db
    .select()
    .from(comment)
    .where(
      and(
        eq(comment.parentType, t as "project" | "task" | "todo" | "procurement"),
        eq(comment.parentId, id),
      ),
    )
    .orderBy(comment.createdAt);
  return c.json({ comments: rows });
});

app.post("/comments", async (c) => {
  const a = c.get("auth") as AuthUser;
  const p = commentCreate.safeParse(await c.req.json());
  if (!p.success) {
    return c.json({ error: p.error.flatten() }, 400);
  }
  const [row] = await db
    .insert(comment)
    .values({
      authorId: a.id,
      body: p.data.body,
      parentType: p.data.parentType,
      parentId: p.data.parentId,
    })
    .returning();
  return c.json({ comment: row });
});

/* --- Assets --- */
app.get("/assets", async (c) => {
  const a = c.get("auth") as AuthUser;
  const clientId = c.req.query("clientId");
  const conditions = [eq(asset.organizationId, a.organizationId)];
  if (clientId) {
    conditions.push(eq(asset.clientId, clientId));
  }
  const rows = await db
    .select()
    .from(asset)
    .where(and(...conditions));
  return c.json({ assets: rows });
});

app.post("/assets", async (c) => {
  const a = c.get("auth") as AuthUser;
  if (a.globalRole !== "org_admin") {
    return c.json({ error: "Forbidden" }, 403);
  }
  const p = assetCreate.safeParse(await c.req.json());
  if (!p.success) {
    return c.json({ error: p.error.flatten() }, 400);
  }
  if (p.data.clientId) {
    const clients = await db
      .select({ id: client.id })
      .from(client)
      .where(
        and(
          eq(client.id, p.data.clientId),
          eq(client.organizationId, a.organizationId),
        ),
      );
    if (clients.length === 0) {
      return c.json({ error: "Customer not found" }, 404);
    }
  }
  const [row] = await db
    .insert(asset)
    .values({
      organizationId: a.organizationId,
      name: p.data.name,
      site: p.data.site,
      line: p.data.line,
      serial: p.data.serial ?? null,
      clientId: p.data.clientId ?? null,
    })
    .returning();
  return c.json({ asset: row });
});

app.patch("/assets/:assetId", async (c) => {
  const a = c.get("auth") as AuthUser;
  if (a.globalRole !== "org_admin") {
    return c.json({ error: "Forbidden" }, 403);
  }
  const assetId = c.req.param("assetId");
  const p = assetPatch.safeParse(await c.req.json());
  if (!p.success) {
    return c.json({ error: p.error.flatten() }, 400);
  }
  const cur = await db
    .select()
    .from(asset)
    .where(
      and(eq(asset.id, assetId), eq(asset.organizationId, a.organizationId)),
    );
  if (cur.length === 0) {
    return c.json({ error: "Not found" }, 404);
  }
  const row0 = cur[0]!;
  if (p.data.version !== undefined && p.data.version !== row0.version) {
    return c.json({ error: "Version conflict" }, 409);
  }
  if (p.data.clientId) {
    const clients = await db
      .select({ id: client.id })
      .from(client)
      .where(
        and(
          eq(client.id, p.data.clientId),
          eq(client.organizationId, a.organizationId),
        ),
      );
    if (clients.length === 0) {
      return c.json({ error: "Customer not found" }, 404);
    }
  }
  const [row] = await db
    .update(asset)
    .set({
      name: p.data.name ?? row0.name,
      site: p.data.site ?? row0.site,
      line: p.data.line ?? row0.line,
      serial: p.data.serial === undefined ? row0.serial : p.data.serial,
      clientId: p.data.clientId === undefined ? row0.clientId : p.data.clientId,
      version: row0.version + 1,
      updatedAt: new Date(),
    })
    .where(eq(asset.id, assetId))
    .returning();
  return c.json({ asset: row });
});

app.get("/assets/:assetId/delete-preview", async (c) => {
  const a = c.get("auth") as AuthUser;
  const assetId = c.req.param("assetId");
  const p = await previewDeleteAsset(a, assetId);
  if ("status" in p) {
    return c.json({ error: p.status === 403 ? "Forbidden" : "Not found" }, p.status);
  }
  return c.json({ preview: p });
});

app.delete("/assets/:assetId", async (c) => {
  const a = c.get("auth") as AuthUser;
  const assetId = c.req.param("assetId");
  const ok = await executeDeleteAsset(a, assetId);
  if (!ok) {
    const p = await previewDeleteAsset(a, assetId);
    if ("status" in p) {
      return c.json({ error: p.status === 403 ? "Forbidden" : "Not found" }, p.status);
    }
    return c.json({ error: p.blockedReason ?? "Cannot delete" }, 400);
  }
  return c.json({ ok: true });
});

app.get("/assets/:assetId", async (c) => {
  const a = c.get("auth") as AuthUser;
  const assetId = c.req.param("assetId");
  const rows = await db
    .select()
    .from(asset)
    .where(
      and(eq(asset.id, assetId), eq(asset.organizationId, a.organizationId)),
    );
  if (rows.length === 0) {
    return c.json({ error: "Not found" }, 404);
  }
  return c.json({ asset: rows[0] });
});

app.get("/assets/:assetId/service-logs", async (c) => {
  const a = c.get("auth") as AuthUser;
  const assetId = c.req.param("assetId");
  const rows = await db
    .select()
    .from(asset)
    .where(
      and(eq(asset.id, assetId), eq(asset.organizationId, a.organizationId)),
    );
  if (rows.length === 0) {
    return c.json({ error: "Not found" }, 404);
  }
  const logs = await db
    .select()
    .from(assetServiceLog)
    .where(eq(assetServiceLog.assetId, assetId))
    .orderBy(desc(assetServiceLog.performedAt));
  return c.json({ logs });
});

app.get("/asset-service-logs", async (c) => {
  const a = c.get("auth") as AuthUser;
  const assetId = c.req.query("assetId");
  const conditions = [eq(asset.organizationId, a.organizationId)];
  if (assetId) {
    conditions.push(eq(assetServiceLog.assetId, assetId));
  }
  const rows = await db
    .select({
      log: assetServiceLog,
      assetName: asset.name,
      assetSite: asset.site,
      clientId: asset.clientId,
    })
    .from(assetServiceLog)
    .innerJoin(asset, eq(assetServiceLog.assetId, asset.id))
    .where(and(...conditions))
    .orderBy(desc(assetServiceLog.performedAt));
  return c.json({
    logs: rows.map((r) => ({
      ...r.log,
      assetName: r.assetName,
      assetSite: r.assetSite,
      clientId: r.clientId,
    })),
  });
});

app.get("/asset-service-logs/:id/delete-preview", async (c) => {
  const a = c.get("auth") as AuthUser;
  const id = c.req.param("id");
  const p = await previewDeleteServiceLog(a, id);
  if ("status" in p) {
    return c.json({ error: p.status === 403 ? "Forbidden" : "Not found" }, p.status);
  }
  return c.json({ preview: p });
});

app.get("/asset-service-logs/:id", async (c) => {
  const a = c.get("auth") as AuthUser;
  const id = c.req.param("id");
  const rows = await db
    .select({ log: assetServiceLog, asset: asset })
    .from(assetServiceLog)
    .innerJoin(asset, eq(assetServiceLog.assetId, asset.id))
    .where(eq(assetServiceLog.id, id));
  if (rows.length === 0 || rows[0]!.asset.organizationId !== a.organizationId) {
    return c.json({ error: "Not found" }, 404);
  }
  return c.json({
    log: {
      ...rows[0]!.log,
      assetName: rows[0]!.asset.name,
      assetSite: rows[0]!.asset.site,
      clientId: rows[0]!.asset.clientId,
    },
  });
});

app.post("/asset-service-logs", async (c) => {
  const a = c.get("auth") as AuthUser;
  const p = assetServiceLogCreate.safeParse(await c.req.json());
  if (!p.success) {
    return c.json({ error: p.error.flatten() }, 400);
  }
  const rows = await db
    .select()
    .from(asset)
    .where(
      and(
        eq(asset.id, p.data.assetId),
        eq(asset.organizationId, a.organizationId),
      ),
    );
  if (rows.length === 0) {
    return c.json({ error: "Not found" }, 404);
  }
  const [row] = await db
    .insert(assetServiceLog)
    .values({
      assetId: p.data.assetId,
      title: p.data.title,
      description: p.data.description ?? null,
      performedAt: p.data.performedAt ?? new Date(),
      technicianName: p.data.technicianName ?? null,
    })
    .returning();
  return c.json({ log: row });
});

app.patch("/asset-service-logs/:id", async (c) => {
  const a = c.get("auth") as AuthUser;
  const id = c.req.param("id");
  const p = assetServiceLogPatch.safeParse(await c.req.json());
  if (!p.success) {
    return c.json({ error: p.error.flatten() }, 400);
  }
  const cur = await db
    .select({ log: assetServiceLog, asset: asset })
    .from(assetServiceLog)
    .innerJoin(asset, eq(assetServiceLog.assetId, asset.id))
    .where(eq(assetServiceLog.id, id));
  if (cur.length === 0 || cur[0]!.asset.organizationId !== a.organizationId) {
    return c.json({ error: "Not found" }, 404);
  }
  const log = cur[0]!.log;
  if (p.data.version !== undefined && p.data.version !== log.version) {
    return c.json({ error: "Version conflict" }, 409);
  }

  let reportMarkdownStorage = log.reportMarkdownStorage;
  let reportPdfStorage = log.reportPdfStorage;
  let reportPdfGenerated: boolean | undefined;
  if (p.data.reportMarkdown !== undefined) {
    const saved = log.reportMarkdownStorage
      ? await updateServiceReportFiles(a.organizationId, p.data.reportMarkdown, {
          markdownStorage: log.reportMarkdownStorage,
          pdfStorage: log.reportPdfStorage,
        })
      : await saveServiceReportFiles(a.organizationId, p.data.reportMarkdown);
    reportMarkdownStorage = saved.markdownStorage;
    reportPdfStorage = saved.pdfStorage;
    reportPdfGenerated = saved.pdfGenerated;
  }

  const [row] = await db
    .update(assetServiceLog)
    .set({
      title: p.data.title ?? log.title,
      description:
        p.data.description === undefined ? log.description : p.data.description,
      performedAt: p.data.performedAt ?? log.performedAt,
      technicianName:
        p.data.technicianName === undefined
          ? log.technicianName
          : p.data.technicianName,
      reportMarkdownStorage,
      reportPdfStorage,
      version: log.version + 1,
      updatedAt: new Date(),
    })
    .where(eq(assetServiceLog.id, id))
    .returning();
  return c.json({
    log: row,
    ...(reportPdfGenerated === undefined
      ? {}
      : { reportPdfGenerated }),
  });
});

app.delete("/asset-service-logs/:id", async (c) => {
  const a = c.get("auth") as AuthUser;
  const id = c.req.param("id");
  const ok = await executeDeleteServiceLog(a, id);
  if (!ok) {
    const p = await previewDeleteServiceLog(a, id);
    if ("status" in p) {
      return c.json({ error: p.status === 403 ? "Forbidden" : "Not found" }, p.status);
    }
    return c.json({ error: p.blockedReason ?? "Cannot delete" }, 400);
  }
  return c.json({ ok: true });
});

app.get("/projects/:projectId/assets", async (c) => {
  const a = c.get("auth") as AuthUser;
  const id = c.req.param("projectId");
  const pr = await requireProject(a, id);
  if ("error" in pr) {
    return c.json({ error: pr.error }, pr.status);
  }
  const links = await db
    .select()
    .from(projectAsset)
    .where(eq(projectAsset.projectId, id));
  const aid = links.map((l) => l.assetId);
  if (aid.length === 0) {
    return c.json({ assets: [] });
  }
  const rows = await db
    .select()
    .from(asset)
    .where(
      inArray(
        asset.id,
        aid,
      ),
    );
  return c.json({ assets: rows, links });
});

app.post("/projects/:projectId/assets", async (c) => {
  const a = c.get("auth") as AuthUser;
  const id = c.req.param("projectId");
  const pr = await requireProject(a, id);
  if ("error" in pr) {
    return c.json({ error: pr.error }, pr.status);
  }
  const b = (await c.req.json()) as { assetId: string };
  const [l] = await db
    .insert(projectAsset)
    .values({ projectId: id, assetId: b.assetId })
    .onConflictDoNothing({
      target: [projectAsset.projectId, projectAsset.assetId],
    })
    .returning();
  return c.json({ link: l });
});

app.delete("/projects/:projectId/assets/:assetId", async (c) => {
  const a = c.get("auth") as AuthUser;
  const id = c.req.param("projectId");
  const assetId = c.req.param("assetId");
  const pr = await requireProject(a, id);
  if ("error" in pr) {
    return c.json({ error: pr.error }, pr.status);
  }
  const cur = await db
    .select()
    .from(projectAsset)
    .where(
      and(eq(projectAsset.projectId, id), eq(projectAsset.assetId, assetId)),
    );
  if (cur.length === 0) {
    return c.json({ error: "Not found" }, 404);
  }
  await db
    .delete(projectAsset)
    .where(
      and(eq(projectAsset.projectId, id), eq(projectAsset.assetId, assetId)),
    );
  return c.json({ ok: true });
});

export const extraApp = app;
