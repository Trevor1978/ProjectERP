import { Hono } from "hono";
import { and, desc, eq, inArray } from "drizzle-orm";
import {
  db,
  task,
  timeEntry,
  user as userTable,
  userRate,
  todo,
} from "@project-erp/db";
import { timeEntryCreate, timeEntryPatch } from "@project-erp/validators";
import { requireAuth, type AuthUser } from "../lib/session.js";
import { requireProject } from "../lib/projectAccess.js";
import { writeAudit } from "../lib/audit.js";
import {
  executeDeleteTimeEntry,
  previewDeleteTimeEntry,
} from "../lib/deleteResource.js";

const app = new Hono();
app.use("/*", requireAuth);

app.get("/time-entries", async (c) => {
  const a = c.get("auth") as AuthUser;
  const projectId = c.req.query("projectId");
  if (projectId) {
    const pr = await requireProject(a, projectId);
    if ("error" in pr) {
      return c.json({ error: pr.error }, pr.status);
    }
    const tks = await db
      .select({ id: task.id })
      .from(task)
      .where(eq(task.projectId, projectId));
    const tids = tks.map((t) => t.id);
    if (tids.length === 0) {
      return c.json({ timeEntries: [] });
    }
    const rows = await db
      .select()
      .from(timeEntry)
      .where(inArray(timeEntry.taskId, tids))
      .orderBy(desc(timeEntry.createdAt));
    if (a.globalRole !== "org_admin") {
      return c.json({
        timeEntries: rows.filter((r) => r.userId === a.id),
      });
    }
    return c.json({ timeEntries: rows });
  }
  if (a.globalRole === "org_admin") {
    const rows = await db
      .select()
      .from(timeEntry)
      .orderBy(desc(timeEntry.createdAt));
    return c.json({ timeEntries: rows });
  }
  const rows = await db
    .select()
    .from(timeEntry)
    .where(eq(timeEntry.userId, a.id))
    .orderBy(desc(timeEntry.createdAt));
  return c.json({ timeEntries: rows });
});

app.post("/time-entries", async (c) => {
  const a = c.get("auth") as AuthUser;
  const p = timeEntryCreate.safeParse(await c.req.json());
  if (!p.success) {
    return c.json({ error: p.error.flatten() }, 400);
  }
  const t = await db
    .select()
    .from(task)
    .where(eq(task.id, p.data.taskId));
  if (t.length === 0) {
    return c.json({ error: "Task not found" }, 404);
  }
  const pr = await requireProject(a, t[0]!.projectId);
  if ("error" in pr) {
    return c.json({ error: pr.error }, pr.status);
  }
  if (p.data.todoId) {
    const td = await db
      .select()
      .from(todo)
      .where(eq(todo.id, p.data.todoId));
    if (td.length === 0 || td[0]!.taskId !== p.data.taskId) {
      return c.json({ error: "Todo not for task" }, 400);
    }
  }
  const [row] = await db
    .insert(timeEntry)
    .values({
      userId: a.id,
      taskId: p.data.taskId,
      todoId: p.data.todoId ?? null,
      startedAt: p.data.startedAt ?? null,
      endedAt: p.data.endedAt ?? null,
      durationMinutes: p.data.durationMinutes ?? null,
      note: p.data.note ?? null,
    })
    .returning();
  const all = await db
    .select()
    .from(timeEntry)
    .where(eq(timeEntry.taskId, p.data.taskId));
  const totalMin = all.reduce(
    (acc, e) => acc + (e.durationMinutes ?? 0),
    0,
  );
  const hours = totalMin / 60;
  await db
    .update(task)
    .set({ actualHours: hours, updatedAt: new Date() })
    .where(eq(task.id, p.data.taskId));
  await writeAudit(
    a,
    "time.create",
    "time_entry",
    row?.id ?? "",
    { taskId: p.data.taskId },
  );
  return c.json({ timeEntry: row });
});

app.patch("/time-entries/:id", async (c) => {
  const a = c.get("auth") as AuthUser;
  const id = c.req.param("id");
  const p = timeEntryPatch.safeParse(await c.req.json());
  if (!p.success) {
    return c.json({ error: p.error.flatten() }, 400);
  }
  const cur = await db.select().from(timeEntry).where(eq(timeEntry.id, id));
  if (cur.length === 0) {
    return c.json({ error: "Not found" }, 404);
  }
  if (cur[0]!.userId !== a.id && a.globalRole !== "org_admin") {
    return c.json({ error: "Forbidden" }, 403);
  }
  if (p.data.version !== undefined && p.data.version !== cur[0]!.version) {
    return c.json({ error: "Version conflict" }, 409);
  }
  const tk = await db
    .select()
    .from(task)
    .where(eq(task.id, cur[0]!.taskId));
  if (tk.length === 0) {
    return c.json({ error: "Not found" }, 404);
  }
  const pr = await requireProject(a, tk[0]!.projectId);
  if ("error" in pr) {
    return c.json({ error: pr.error }, pr.status);
  }
  const [row] = await db
    .update(timeEntry)
    .set({
      startedAt: p.data.startedAt === undefined ? cur[0]!.startedAt : p.data.startedAt,
      endedAt: p.data.endedAt === undefined ? cur[0]!.endedAt : p.data.endedAt,
      durationMinutes:
        p.data.durationMinutes === undefined
          ? cur[0]!.durationMinutes
          : p.data.durationMinutes,
      note: p.data.note === undefined ? cur[0]!.note : p.data.note,
      version: (cur[0]!.version ?? 0) + 1,
      updatedAt: new Date(),
    })
    .where(eq(timeEntry.id, id))
    .returning();
  const all2 = await db
    .select()
    .from(timeEntry)
    .where(eq(timeEntry.taskId, cur[0]!.taskId));
  const totalMin = all2.reduce(
    (acc, e) => acc + (e.durationMinutes ?? 0),
    0,
  );
  await db
    .update(task)
    .set({ actualHours: totalMin / 60, updatedAt: new Date() })
    .where(eq(task.id, cur[0]!.taskId));
  return c.json({ timeEntry: row });
});

app.get("/time-entries/:id/delete-preview", async (c) => {
  const a = c.get("auth") as AuthUser;
  const id = c.req.param("id");
  const p = await previewDeleteTimeEntry(a, id);
  if ("status" in p) {
    return c.json(
      { error: p.status === 404 ? "Not found" : "Forbidden" },
      p.status,
    );
  }
  return c.json({ preview: p });
});

app.delete("/time-entries/:id", async (c) => {
  const a = c.get("auth") as AuthUser;
  const id = c.req.param("id");
  const ok = await executeDeleteTimeEntry(a, id);
  if (!ok) {
    const p = await previewDeleteTimeEntry(a, id);
    if ("status" in p) {
      return c.json(
        { error: p.status === 404 ? "Not found" : "Forbidden" },
        p.status,
      );
    }
    return c.json({ error: "Not found" }, 404);
  }
  return c.json({ ok: true });
});

app.get("/user-rates", async (c) => {
  const a = c.get("auth") as AuthUser;
  if (a.globalRole !== "org_admin") {
    return c.json({ error: "Forbidden" }, 403);
  }
  const rows = await db.select().from(userRate);
  return c.json({ userRates: rows });
});

app.post("/user-rates", async (c) => {
  const a = c.get("auth") as AuthUser;
  if (a.globalRole !== "org_admin") {
    return c.json({ error: "Forbidden" }, 403);
  }
  const b = (await c.req.json()) as { userId: string; hourlyRate: number };
  const u = await db
    .select()
    .from(userTable)
    .where(
      and(
        eq(userTable.id, b.userId),
        eq(userTable.organizationId, a.organizationId),
      ),
    );
  if (u.length === 0) {
    return c.json({ error: "User not found" }, 404);
  }
  const [r] = await db
    .insert(userRate)
    .values({ userId: b.userId, hourlyRate: b.hourlyRate })
    .returning();
  return c.json({ userRate: r });
});

export const timeApp = app;
