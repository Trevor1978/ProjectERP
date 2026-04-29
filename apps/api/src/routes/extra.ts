import { Hono } from "hono";
import { and, desc, eq, ilike, inArray, or, sql } from "drizzle-orm";
import {
  db,
  project,
  task,
  todo,
  savedFilter,
  notification,
  documentLink,
  handover,
  comment,
  asset,
  projectAsset,
  projectBudget,
} from "@project-erp/db";
import {
  savedFilterCreate,
  savedFilterPatch,
  documentLinkCreate,
  documentLinkPatch,
  handoverCreate,
  commentCreate,
} from "@project-erp/validators";
import { requireAuth, type AuthUser } from "../lib/session.js";
import { requireProject } from "../lib/projectAccess.js";

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

/* Web Push subscription stub (store in JSON file or new table in v2) */
app.post("/push/subscribe", async (c) => {
  void (await c.req.text());
  return c.json({ ok: true, note: "Persist subscription in production" });
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
  const rows = await db
    .select()
    .from(asset)
    .where(eq(asset.organizationId, a.organizationId));
  return c.json({ assets: rows });
});

app.post("/assets", async (c) => {
  const a = c.get("auth") as AuthUser;
  if (a.globalRole !== "org_admin") {
    return c.json({ error: "Forbidden" }, 403);
  }
  const b = (await c.req.json()) as {
    name: string;
    site: string;
    line: string;
    serial?: string;
  };
  const [row] = await db
    .insert(asset)
    .values({
      organizationId: a.organizationId,
      name: b.name,
      site: b.site,
      line: b.line,
      serial: b.serial ?? null,
    })
    .returning();
  return c.json({ asset: row });
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

export const extraApp = app;
