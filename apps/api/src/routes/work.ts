import { Hono } from "hono";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import {
  db,
  user as userTable,
  client,
  project,
  projectMember,
  milestone,
  task,
  taskDependency,
  todo,
} from "@project-erp/db";
import {
  clientCreate,
  clientPatch,
  projectCreate,
  projectPatch,
  milestoneCreate,
  milestonePatch,
  taskCreate,
  taskPatch,
  todoCreate,
  todoPatch,
  projectMemberAdd,
  taskDependencyCreate,
} from "@project-erp/validators";
import { requireAuth, type AuthUser } from "../lib/session.js";
import { requireProject } from "../lib/projectAccess.js";
import { writeAudit } from "../lib/audit.js";
import { syncTaskPercentFromTodos } from "../lib/deriveTaskPercent.js";

const app = new Hono();

app.use("/*", requireAuth);

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

app.get("/projects", async (c) => {
  const a = c.get("auth") as AuthUser;
  if (a.globalRole === "org_admin") {
    const prows = await db
      .select()
      .from(project)
      .where(eq(project.organizationId, a.organizationId));
    return c.json({ projects: prows });
  }
  const mem = await db
    .select({ projectId: projectMember.projectId })
    .from(projectMember)
    .where(eq(projectMember.userId, a.id));
  if (mem.length === 0) return c.json({ projects: [] });
  const ids = mem.map((m) => m.projectId);
  const prows = await db
    .select()
    .from(project)
    .where(
      and(
        eq(project.organizationId, a.organizationId),
        inArray(project.id, ids),
      ),
    );
  return c.json({ projects: prows });
});

app.get("/clients", async (c) => {
  const a = c.get("auth") as AuthUser;
  // All org members need the client list to create projects
  const rows = await db
    .select()
    .from(client)
    .where(eq(client.organizationId, a.organizationId))
    .orderBy(desc(client.updatedAt));
  return c.json({ clients: rows });
});

app.get("/milestones", async (c) => {
  const a = c.get("auth") as AuthUser;
  const projectId = c.req.query("projectId");
  if (projectId) {
    const pr = await requireProject(a, projectId);
    if ("error" in pr) {
      return c.json({ error: pr.error }, pr.status);
    }
    const rows = await db
      .select()
      .from(milestone)
      .where(eq(milestone.projectId, projectId))
      .orderBy(asc(milestone.orderIndex), asc(milestone.createdAt));
    return c.json({ milestones: rows });
  }
  const pids = await visibleProjectIds(a);
  if (pids.length === 0) {
    return c.json({ milestones: [] });
  }
  const rows = await db
    .select()
    .from(milestone)
    .where(inArray(milestone.projectId, pids))
    .orderBy(asc(milestone.projectId), asc(milestone.orderIndex), asc(milestone.createdAt));
  return c.json({ milestones: rows });
});

app.get("/tasks", async (c) => {
  const a = c.get("auth") as AuthUser;
  const projectId = c.req.query("projectId");
  if (projectId) {
    const pr = await requireProject(a, projectId);
    if ("error" in pr) {
      return c.json({ error: pr.error }, pr.status);
    }
    const rows = await db
      .select()
      .from(task)
      .where(eq(task.projectId, projectId))
      .orderBy(asc(task.orderIndex), asc(task.createdAt));
    return c.json({ tasks: rows });
  }
  const pids = await visibleProjectIds(a);
  if (pids.length === 0) {
    return c.json({ tasks: [] });
  }
  const rows = await db
    .select()
    .from(task)
    .where(inArray(task.projectId, pids))
    .orderBy(asc(task.projectId), asc(task.orderIndex), asc(task.createdAt));
  return c.json({ tasks: rows });
});

app.get("/todos", async (c) => {
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
      return c.json({ todos: [] });
    }
    const rows = await db
      .select()
      .from(todo)
      .where(inArray(todo.taskId, tids))
      .orderBy(asc(todo.orderIndex), asc(todo.createdAt));
    return c.json({ todos: rows });
  }
  const pids = await visibleProjectIds(a);
  if (pids.length === 0) {
    return c.json({ todos: [] });
  }
  const tks = await db
    .select({ id: task.id })
    .from(task)
    .where(inArray(task.projectId, pids));
  const tids = tks.map((t) => t.id);
  if (tids.length === 0) {
    return c.json({ todos: [] });
  }
  const rows = await db
    .select()
    .from(todo)
    .where(inArray(todo.taskId, tids))
    .orderBy(asc(todo.orderIndex), asc(todo.createdAt));
  return c.json({ todos: rows });
});

app.post("/clients", async (c) => {
  const a = c.get("auth") as AuthUser;
  const p = clientCreate.safeParse(await c.req.json());
  if (!p.success) {
    return c.json({ error: p.error.flatten() }, 400);
  }
  if (p.data.organizationId !== a.organizationId) {
    return c.json({ error: "Forbidden" }, 403);
  }
  if (a.globalRole !== "org_admin") {
    return c.json({ error: "Forbidden" }, 403);
  }
  const [row] = await db
    .insert(client)
    .values({ name: p.data.name, code: p.data.code, organizationId: a.organizationId })
    .returning();
  if (!row) {
    return c.json({ error: "Failed" }, 500);
  }
  await writeAudit(a, "client.create", "client", row.id, { name: row.name });
  return c.json({ client: row });
});

app.patch("/clients/:id", async (c) => {
  const a = c.get("auth") as AuthUser;
  if (a.globalRole !== "org_admin") {
    return c.json({ error: "Forbidden" }, 403);
  }
  const id = c.req.param("id");
  const p = clientPatch.safeParse({ ...(await c.req.json()), id });
  if (!p.success) {
    return c.json({ error: p.error.flatten() }, 400);
  }
  const cur = await db
    .select()
    .from(client)
    .where(and(eq(client.id, id), eq(client.organizationId, a.organizationId)));
  if (cur.length === 0) {
    return c.json({ error: "Not found" }, 404);
  }
  if (p.data.version !== undefined && p.data.version !== cur[0]!.version) {
    return c.json({ error: "Version conflict" }, 409);
  }
  const [u] = await db
    .update(client)
    .set({
      name: p.data.name ?? cur[0]!.name,
      code: p.data.code ?? cur[0]!.code,
      version: (cur[0]!.version ?? 0) + 1,
      updatedAt: new Date(),
    })
    .where(eq(client.id, id))
    .returning();
  await writeAudit(a, "client.update", "client", id, p.data);
  return c.json({ client: u });
});

app.post("/projects", async (c) => {
  const a = c.get("auth") as AuthUser;
  const p = projectCreate.safeParse(await c.req.json());
  if (!p.success) {
    return c.json({ error: p.error.flatten() }, 400);
  }
  if (p.data.organizationId !== a.organizationId) {
    return c.json({ error: "Forbidden" }, 403);
  }
  const cl = await db
    .select()
    .from(client)
    .where(
      and(
        eq(client.id, p.data.clientId),
        eq(client.organizationId, a.organizationId),
      ),
    );
  if (cl.length === 0) {
    return c.json({ error: "Client not found" }, 404);
  }
  const [prow] = await db
    .insert(project)
    .values({
      organizationId: a.organizationId,
      clientId: p.data.clientId,
      name: p.data.name,
      code: p.data.code,
      status: p.data.status,
      startAt: p.data.startAt,
      endAt: p.data.endAt,
      createdById: a.id,
    })
    .returning();
  if (!prow) {
    return c.json({ error: "Failed" }, 500);
  }
  await db.insert(projectMember).values({
    projectId: prow.id,
    userId: a.id,
    role: "admin",
  });
  await writeAudit(a, "project.create", "project", prow.id, { name: prow.name });
  return c.json({ project: prow });
});

app.get("/projects/:projectId", async (c) => {
  const a = c.get("auth") as AuthUser;
  const id = c.req.param("projectId");
  const pr = await requireProject(a, id);
  if ("error" in pr) {
    return c.json({ error: pr.error }, pr.status);
  }
  return c.json({ project: pr });
});

app.patch("/projects/:projectId", async (c) => {
  const a = c.get("auth") as AuthUser;
  const id = c.req.param("projectId");
  const pr = await requireProject(a, id);
  if ("error" in pr) {
    return c.json({ error: pr.error }, pr.status);
  }
  const p = projectPatch.safeParse(await c.req.json());
  if (!p.success) {
    return c.json({ error: p.error.flatten() }, 400);
  }
  if (p.data.version !== undefined && p.data.version !== pr.version) {
    return c.json({ error: "Version conflict" }, 409);
  }
  const m = await db
    .select()
    .from(projectMember)
    .where(
      and(eq(projectMember.projectId, id), eq(projectMember.userId, a.id)),
    );
  const canEdit =
    a.globalRole === "org_admin" ||
    m[0]?.role === "pm" ||
    m[0]?.role === "admin";
  if (!canEdit) {
    return c.json({ error: "Forbidden" }, 403);
  }
  const [u] = await db
    .update(project)
    .set({
      name: p.data.name ?? pr.name,
      code: p.data.code === undefined ? pr.code : p.data.code,
      clientId: p.data.clientId ?? pr.clientId,
      status: p.data.status ?? pr.status,
      startAt: p.data.startAt === undefined ? pr.startAt : p.data.startAt,
      endAt: p.data.endAt === undefined ? pr.endAt : p.data.endAt,
      version: (pr.version ?? 0) + 1,
      updatedAt: new Date(),
    })
    .where(eq(project.id, id))
    .returning();
  await writeAudit(a, "project.update", "project", id, p.data);
  return c.json({ project: u });
});

app.get("/projects/:projectId/schedule", async (c) => {
  const a = c.get("auth") as AuthUser;
  const id = c.req.param("projectId");
  const pr = await requireProject(a, id);
  if ("error" in pr) {
    return c.json({ error: pr.error }, pr.status);
  }
  const m = await db
    .select()
    .from(milestone)
    .where(eq(milestone.projectId, id))
    .orderBy(asc(milestone.orderIndex), asc(milestone.createdAt));
  const tks = await db
    .select()
    .from(task)
    .where(eq(task.projectId, id))
    .orderBy(asc(task.orderIndex), asc(task.createdAt));
  const tids = tks.map((t) => t.id);
  const deps = tids.length
    ? await db
        .select()
        .from(taskDependency)
        .where(inArray(taskDependency.taskId, tids))
    : [];
  const tds = tids.length
    ? await db.select().from(todo).where(inArray(todo.taskId, tids))
    : [];
  const mship = await db
    .select()
    .from(projectMember)
    .where(
      and(eq(projectMember.projectId, id), eq(projectMember.userId, a.id)),
    );
  const canEditProject =
    a.globalRole === "org_admin" ||
    mship[0]?.role === "pm" ||
    mship[0]?.role === "admin";
  return c.json({
    project: pr,
    milestones: m,
    tasks: tks,
    taskDependencies: deps,
    todos: tds,
    canEditProject,
  });
});

app.get("/projects/:projectId/members", async (c) => {
  const a = c.get("auth") as AuthUser;
  const id = c.req.param("projectId");
  const pr = await requireProject(a, id);
  if ("error" in pr) {
    return c.json({ error: pr.error }, pr.status);
  }
  const m = await db
    .select()
    .from(projectMember)
    .where(eq(projectMember.projectId, id));
  return c.json({ members: m });
});

app.post("/projects/:projectId/members", async (c) => {
  const a = c.get("auth") as AuthUser;
  const id = c.req.param("projectId");
  const pr = await requireProject(a, id);
  if ("error" in pr) {
    return c.json({ error: pr.error }, pr.status);
  }
  if (a.globalRole !== "org_admin") {
    const m = await db
      .select()
      .from(projectMember)
      .where(
        and(eq(projectMember.projectId, id), eq(projectMember.userId, a.id)),
      );
    if (m[0]?.role !== "pm" && m[0]?.role !== "admin") {
      return c.json({ error: "Forbidden" }, 403);
    }
  }
  const p = projectMemberAdd.safeParse(await c.req.json());
  if (!p.success) {
    return c.json({ error: p.error.flatten() }, 400);
  }
  const u2 = await db
    .select()
    .from(userTable)
    .where(
      and(
        eq(userTable.id, p.data.userId),
        eq(userTable.organizationId, a.organizationId),
      ),
    );
  if (u2.length === 0) {
    return c.json({ error: "User not in org" }, 400);
  }
  const [row] = await db
    .insert(projectMember)
    .values({ projectId: id, userId: p.data.userId, role: p.data.role })
    .onConflictDoNothing({
      target: [projectMember.projectId, projectMember.userId],
    })
    .returning();
  if (!row) {
    return c.json({ error: "Member already on project" }, 409);
  }
  return c.json({ member: row });
});

app.post("/milestones", async (c) => {
  const a = c.get("auth") as AuthUser;
  const p = milestoneCreate.safeParse(await c.req.json());
  if (!p.success) {
    return c.json({ error: p.error.flatten() }, 400);
  }
  const pr = await requireProject(a, p.data.projectId);
  if ("error" in pr) {
    return c.json({ error: pr.error }, pr.status);
  }
  const [m] = await db
    .insert(milestone)
    .values({
      projectId: p.data.projectId,
      name: p.data.name,
      startAt: p.data.startAt,
      endAt: p.data.endAt,
      orderIndex: p.data.orderIndex,
    })
    .returning();
  await writeAudit(
    a,
    "milestone.create",
    "milestone",
    m?.id ?? "",
    { name: p.data.name },
  );
  return c.json({ milestone: m });
});

app.patch("/milestones/:id", async (c) => {
  const a = c.get("auth") as AuthUser;
  const id = c.req.param("id");
  const p = milestonePatch.safeParse(await c.req.json());
  if (!p.success) {
    return c.json({ error: p.error.flatten() }, 400);
  }
  const cur = await db.select().from(milestone).where(eq(milestone.id, id));
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
  const [m] = await db
    .update(milestone)
    .set({
      name: p.data.name ?? cur[0]!.name,
      startAt:
        p.data.startAt === undefined ? cur[0]!.startAt : p.data.startAt,
      endAt: p.data.endAt === undefined ? cur[0]!.endAt : p.data.endAt,
      orderIndex: p.data.orderIndex ?? cur[0]!.orderIndex,
      version: (cur[0]!.version ?? 0) + 1,
      updatedAt: new Date(),
    })
    .where(eq(milestone.id, id))
    .returning();
  return c.json({ milestone: m });
});

app.post("/tasks", async (c) => {
  const a = c.get("auth") as AuthUser;
  const p = taskCreate.safeParse(await c.req.json());
  if (!p.success) {
    return c.json({ error: p.error.flatten() }, 400);
  }
  const m = await db
    .select()
    .from(milestone)
    .where(eq(milestone.id, p.data.milestoneId));
  if (m.length === 0) {
    return c.json({ error: "Milestone not found" }, 404);
  }
  const pr = await requireProject(a, m[0]!.projectId);
  if ("error" in pr) {
    return c.json({ error: pr.error }, pr.status);
  }
  if (m[0]!.projectId !== p.data.projectId) {
    return c.json({ error: "Milestone not in project" }, 400);
  }
  const [t] = await db
    .insert(task)
    .values({
      projectId: p.data.projectId,
      milestoneId: p.data.milestoneId,
      title: p.data.title,
      description: p.data.description,
      startAt: p.data.startAt,
      endAt: p.data.endAt,
      estHours: p.data.estHours ?? null,
      percentComplete: p.data.percentComplete,
      useDerivedPercent: p.data.useDerivedPercent,
      orderIndex: p.data.orderIndex,
      assigneeId: p.data.assigneeId ?? null,
    })
    .returning();
  if (p.data.useDerivedPercent) {
    await syncTaskPercentFromTodos(t!.id);
  }
  await writeAudit(
    a,
    "task.create",
    "task",
    t?.id ?? "",
    { title: t?.title },
  );
  return c.json({ task: t });
});

app.patch("/tasks/:id", async (c) => {
  const a = c.get("auth") as AuthUser;
  const id = c.req.param("id");
  const p = taskPatch.safeParse(await c.req.json());
  if (!p.success) {
    return c.json({ error: p.error.flatten() }, 400);
  }
  const cur = await db.select().from(task).where(eq(task.id, id));
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
  const mId = p.data.milestoneId ?? cur[0]!.milestoneId;
  if (p.data.milestoneId) {
    const ms = await db
      .select()
      .from(milestone)
      .where(eq(milestone.id, mId));
    if (ms.length === 0 || ms[0]!.projectId !== cur[0]!.projectId) {
      return c.json({ error: "Milestone not in project" }, 400);
    }
  }
  const [t] = await db
    .update(task)
    .set({
      milestoneId: mId,
      title: p.data.title ?? cur[0]!.title,
      description:
        p.data.description === undefined
          ? cur[0]!.description
          : p.data.description,
      startAt: p.data.startAt === undefined ? cur[0]!.startAt : p.data.startAt,
      endAt: p.data.endAt === undefined ? cur[0]!.endAt : p.data.endAt,
      estHours:
        p.data.estHours === undefined ? cur[0]!.estHours : p.data.estHours,
      actualHours:
        p.data.actualHours === undefined
          ? cur[0]!.actualHours
          : p.data.actualHours,
      percentComplete:
        p.data.percentComplete ?? cur[0]!.percentComplete,
      useDerivedPercent:
        p.data.useDerivedPercent ?? cur[0]!.useDerivedPercent,
      orderIndex: p.data.orderIndex ?? cur[0]!.orderIndex,
      assigneeId:
        p.data.assigneeId === undefined
          ? cur[0]!.assigneeId
          : p.data.assigneeId,
      version: (cur[0]!.version ?? 0) + 1,
      updatedAt: new Date(),
    })
    .where(eq(task.id, id))
    .returning();
  if (t?.useDerivedPercent) {
    await syncTaskPercentFromTodos(id);
  }
  return c.json({ task: t });
});

app.post("/task-dependencies", async (c) => {
  const a = c.get("auth") as AuthUser;
  const p = taskDependencyCreate.safeParse(await c.req.json());
  if (!p.success) {
    return c.json({ error: p.error.flatten() }, 400);
  }
  if (p.data.predecessorTaskId === p.data.taskId) {
    return c.json({ error: "Invalid dependency" }, 400);
  }
  const t = await db
    .select()
    .from(task)
    .where(eq(task.id, p.data.taskId));
  const pred = await db
    .select()
    .from(task)
    .where(eq(task.id, p.data.predecessorTaskId));
  if (t.length === 0 || pred.length === 0) {
    return c.json({ error: "Task not found" }, 404);
  }
  if (t[0]!.projectId !== pred[0]!.projectId) {
    return c.json({ error: "Tasks in different projects" }, 400);
  }
  const pr = await requireProject(a, t[0]!.projectId);
  if ("error" in pr) {
    return c.json({ error: pr.error }, pr.status);
  }
  const [d] = await db
    .insert(taskDependency)
    .values({
      taskId: p.data.taskId,
      predecessorTaskId: p.data.predecessorTaskId,
      type: p.data.type,
    })
    .onConflictDoNothing()
    .returning();
  return c.json({ taskDependency: d });
});

app.delete("/task-dependencies/:id", async (c) => {
  const a = c.get("auth") as AuthUser;
  const id = c.req.param("id");
  const row = await db
    .select()
    .from(taskDependency)
    .where(eq(taskDependency.id, id));
  if (row.length === 0) {
    return c.json({ error: "Not found" }, 404);
  }
  const t = await db
    .select()
    .from(task)
    .where(eq(task.id, row[0]!.taskId));
  if (t.length === 0) {
    return c.json({ error: "Not found" }, 404);
  }
  const pr = await requireProject(a, t[0]!.projectId);
  if ("error" in pr) {
    return c.json({ error: pr.error }, pr.status);
  }
  await db.delete(taskDependency).where(eq(taskDependency.id, id));
  return c.json({ ok: true });
});

app.post("/todos", async (c) => {
  const a = c.get("auth") as AuthUser;
  const p = todoCreate.safeParse(await c.req.json());
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
  const [row] = await db
    .insert(todo)
    .values({
      taskId: p.data.taskId,
      title: p.data.title,
      status: p.data.status,
      dueAt: p.data.dueAt,
      priority: p.data.priority,
      orderIndex: p.data.orderIndex,
      assigneeId: p.data.assigneeId ?? null,
    })
    .returning();
  await syncTaskPercentFromTodos(t[0]!.id);
  await writeAudit(a, "todo.create", "todo", row?.id ?? "", { title: row?.title });
  return c.json({ todo: row });
});

app.patch("/todos/:id", async (c) => {
  const a = c.get("auth") as AuthUser;
  const id = c.req.param("id");
  const p = todoPatch.safeParse(await c.req.json());
  if (!p.success) {
    return c.json({ error: p.error.flatten() }, 400);
  }
  const cur = await db.select().from(todo).where(eq(todo.id, id));
  if (cur.length === 0) {
    return c.json({ error: "Not found" }, 404);
  }
  const t = await db
    .select()
    .from(task)
    .where(eq(task.id, cur[0]!.taskId));
  if (t.length === 0) {
    return c.json({ error: "Not found" }, 404);
  }
  const pr = await requireProject(a, t[0]!.projectId);
  if ("error" in pr) {
    return c.json({ error: pr.error }, pr.status);
  }
  if (p.data.version !== undefined && p.data.version !== cur[0]!.version) {
    return c.json({ error: "Version conflict" }, 409);
  }
  const [row] = await db
    .update(todo)
    .set({
      title: p.data.title ?? cur[0]!.title,
      status: p.data.status ?? cur[0]!.status,
      dueAt: p.data.dueAt === undefined ? cur[0]!.dueAt : p.data.dueAt,
      priority: p.data.priority ?? cur[0]!.priority,
      orderIndex: p.data.orderIndex ?? cur[0]!.orderIndex,
      assigneeId:
        p.data.assigneeId === undefined
          ? cur[0]!.assigneeId
          : p.data.assigneeId,
      version: (cur[0]!.version ?? 0) + 1,
      updatedAt: new Date(),
    })
    .where(eq(todo.id, id))
    .returning();
  await syncTaskPercentFromTodos(t[0]!.id);
  return c.json({ todo: row });
});

export const workApp = app;
export { app as workRoutes };
