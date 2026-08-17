import { Hono } from "hono";
import { and, asc, eq, inArray } from "drizzle-orm";
import {
  db,
  client,
  project,
  projectMember,
  milestone,
  task,
  asset,
  assetServiceLog,
  timeEntry,
  user as userTable,
} from "@project-erp/db";
import {
  workCompleteParse,
  workCompleteConfirm,
} from "@project-erp/validators";
import { requireAuth, type AuthUser } from "../lib/session.js";
import { requireProject } from "../lib/projectAccess.js";
import { writeAudit } from "../lib/audit.js";
import {
  parseWorkNotesWithGemini,
  type CatalogItem,
} from "../lib/gemini.js";
import {
  readServiceReportFile,
  regenerateServiceReportPdf,
  saveServiceReportFiles,
  SERVICE_REPORT_DOWNLOAD_HEADERS,
} from "../lib/serviceReport/buildPdf.js";

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

function catalogIdIn(list: CatalogItem[], id: string | null | undefined): string | null {
  if (!id) return null;
  return list.some((i) => i.id === id) ? id : null;
}

app.post("/work-complete/parse", async (c) => {
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
  const p = workCompleteParse.safeParse(await c.req.json());
  if (!p.success) {
    return c.json({ error: p.error.flatten() }, 400);
  }

  const clients = await db
    .select({ id: client.id, name: client.name })
    .from(client)
    .where(eq(client.organizationId, a.organizationId))
    .orderBy(asc(client.name));

  let assetRows = await db
    .select()
    .from(asset)
    .where(eq(asset.organizationId, a.organizationId))
    .orderBy(asc(asset.name));

  if (p.data.workType === "customer_service" && p.data.clientId) {
    // Keep unassigned machines in the AI catalog (legacy rows often have null clientId).
    assetRows = assetRows.filter(
      (r) => r.clientId === p.data.clientId || r.clientId == null,
    );
  }

  const pids = await visibleProjectIds(a);
  const projects =
    pids.length === 0
      ? []
      : await db
          .select({
            id: project.id,
            name: project.name,
            clientId: project.clientId,
            code: project.code,
          })
          .from(project)
          .where(inArray(project.id, pids))
          .orderBy(asc(project.name));

  const tasks =
    pids.length === 0
      ? []
      : await db
          .select({
            id: task.id,
            title: task.title,
            projectId: task.projectId,
          })
          .from(task)
          .where(inArray(task.projectId, pids))
          .orderBy(asc(task.title));

  const me = await db
    .select({ name: userTable.name })
    .from(userTable)
    .where(eq(userTable.id, a.id));

  const clientCatalog: CatalogItem[] = clients.map((cl) => ({
    id: cl.id,
    label: cl.name,
  }));
  const assetCatalog: CatalogItem[] = assetRows.map((as) => ({
    id: as.id,
    label: `${as.name} (${as.site} / ${as.line})${as.clientId ? ` [customer:${as.clientId}]` : ""}`,
  }));
  const projectCatalog: CatalogItem[] = projects.map((pr) => ({
    id: pr.id,
    label: `${pr.name}${pr.code ? ` (${pr.code})` : ""} [client:${pr.clientId}]`,
  }));
  const taskCatalog: CatalogItem[] = tasks.map((t) => ({
    id: t.id,
    label: `${t.title} [project:${t.projectId}]`,
  }));

  let draft;
  try {
    draft = await parseWorkNotesWithGemini({
      workType: p.data.workType,
      notes: p.data.notes,
      clientId: p.data.clientId,
      assetId: p.data.assetId,
      catalogs: {
        clients: clientCatalog,
        assets: assetCatalog,
        projects: projectCatalog,
        tasks: taskCatalog,
        technicianName: me[0]?.name,
      },
    });
  } catch (e) {
    console.error("[work-complete] parse failed:", e);
    // Use 400 (not 502): Cloudflare/nginx replace origin 502 bodies with HTML.
    return c.json(
      {
        error: e instanceof Error ? e.message : "AI parse failed",
      },
      400,
    );
  }

  const suggestedClientId =
    catalogIdIn(clientCatalog, p.data.clientId) ??
    catalogIdIn(clientCatalog, draft.suggestedClientId ?? null);
  const suggestedAssetId =
    catalogIdIn(assetCatalog, p.data.assetId) ??
    catalogIdIn(assetCatalog, draft.suggestedAssetId ?? null);

  let suggestedProjectId = catalogIdIn(
    projectCatalog,
    draft.suggestedProjectId ?? null,
  );
  const suggestedTaskId = catalogIdIn(
    taskCatalog,
    draft.suggestedTaskId ?? null,
  );
  if (!suggestedProjectId && suggestedTaskId) {
    const t = tasks.find((x) => x.id === suggestedTaskId);
    if (t) suggestedProjectId = t.projectId;
  }
  if (!suggestedProjectId && suggestedClientId) {
    const match = projects.find((pr) => pr.clientId === suggestedClientId);
    if (match) suggestedProjectId = match.id;
  }

  return c.json({
    draft: {
      workType: p.data.workType,
      rawNotes: p.data.notes,
      clientId: suggestedClientId,
      assetId: suggestedAssetId,
      projectId: suggestedProjectId,
      taskId: draft.createNewTask ? null : suggestedTaskId,
      createNewTask: Boolean(draft.createNewTask) || !suggestedTaskId,
      newTaskTitle: draft.newTaskTitle ?? draft.serviceLog.title,
      timeEntry: {
        startedAt: draft.timeEntry.startedAt ?? null,
        endedAt: draft.timeEntry.endedAt ?? null,
        durationMinutes: draft.timeEntry.durationMinutes ?? null,
        note: draft.timeEntry.note ?? null,
      },
      serviceLog: {
        title: draft.serviceLog.title,
        description: draft.serviceLog.description ?? null,
        performedAt: draft.serviceLog.performedAt ?? null,
        technicianName:
          draft.serviceLog.technicianName ?? me[0]?.name ?? null,
      },
      reportMarkdown: draft.reportMarkdown,
    },
  });
});

app.post("/work-complete/confirm", async (c) => {
  const a = c.get("auth") as AuthUser;
  const p = workCompleteConfirm.safeParse(await c.req.json());
  if (!p.success) {
    return c.json({ error: p.error.flatten() }, 400);
  }
  const data = p.data;

  if (data.workType === "customer_service" && !data.clientId) {
    return c.json({ error: "Customer is required for service calls" }, 400);
  }
  if (!data.taskId && !data.newTask?.title) {
    return c.json({ error: "Select a task or provide a new task title" }, 400);
  }

  const assets = await db
    .select()
    .from(asset)
    .where(
      and(
        eq(asset.id, data.assetId),
        eq(asset.organizationId, a.organizationId),
      ),
    );
  if (assets.length === 0) {
    return c.json({ error: "Machine not found" }, 404);
  }
  let assetRow = assets[0]!;

  if (data.workType === "customer_service") {
    if (assetRow.clientId && assetRow.clientId !== data.clientId) {
      return c.json({ error: "Machine does not belong to selected customer" }, 400);
    }
    const clients = await db
      .select({ id: client.id })
      .from(client)
      .where(
        and(
          eq(client.id, data.clientId!),
          eq(client.organizationId, a.organizationId),
        ),
      );
    if (clients.length === 0) {
      return c.json({ error: "Customer not found" }, 404);
    }
    // Link unassigned machines to the customer on first service-call save.
    if (!assetRow.clientId) {
      await db
        .update(asset)
        .set({ clientId: data.clientId!, updatedAt: new Date() })
        .where(eq(asset.id, assetRow.id));
      assetRow = { ...assetRow, clientId: data.clientId! };
    }
  }

  const pr = await requireProject(a, data.projectId);
  if ("error" in pr) {
    return c.json({ error: pr.error }, pr.status);
  }

  const saved = await saveServiceReportFiles(
    a.organizationId,
    data.reportMarkdown,
  );
  const markdownStorage = saved.markdownStorage;
  const pdfStorage = saved.pdfStorage;
  if (!saved.pdfGenerated) {
    console.warn(
      `[work-complete] PDF not generated for service log on asset ${data.assetId}`,
    );
  }

  let taskId = data.taskId ?? null;
  if (!taskId && data.newTask?.title) {
    let milestoneId = data.newTask.milestoneId ?? null;
    if (milestoneId) {
      const ms = await db
        .select()
        .from(milestone)
        .where(eq(milestone.id, milestoneId));
      if (ms.length === 0 || ms[0]!.projectId !== data.projectId) {
        return c.json({ error: "Milestone not in project" }, 400);
      }
    } else {
      const existing = await db
        .select()
        .from(milestone)
        .where(eq(milestone.projectId, data.projectId))
        .orderBy(asc(milestone.orderIndex), asc(milestone.createdAt))
        .limit(1);
      if (existing.length > 0) {
        milestoneId = existing[0]!.id;
      } else {
        const [createdMs] = await db
          .insert(milestone)
          .values({
            projectId: data.projectId,
            name: "Field service",
            orderIndex: 0,
          })
          .returning();
        milestoneId = createdMs!.id;
      }
    }
    const [createdTask] = await db
      .insert(task)
      .values({
        projectId: data.projectId,
        milestoneId: milestoneId!,
        title: data.newTask.title,
        description: data.serviceLog.description ?? null,
        assigneeId: a.id,
      })
      .returning();
    taskId = createdTask!.id;
    await writeAudit(a, "task.create", "task", taskId, {
      title: createdTask!.title,
      via: "work_complete",
    });
  } else if (taskId) {
    const trows = await db.select().from(task).where(eq(task.id, taskId));
    if (trows.length === 0 || trows[0]!.projectId !== data.projectId) {
      return c.json({ error: "Task not found in project" }, 400);
    }
  }

  const [te] = await db
    .insert(timeEntry)
    .values({
      userId: a.id,
      taskId: taskId!,
      startedAt: data.timeEntry.startedAt ?? null,
      endedAt: data.timeEntry.endedAt ?? null,
      durationMinutes: data.timeEntry.durationMinutes ?? null,
      note: data.timeEntry.note ?? null,
    })
    .returning();

  const all = await db
    .select()
    .from(timeEntry)
    .where(eq(timeEntry.taskId, taskId!));
  const totalMin = all.reduce((acc, e) => acc + (e.durationMinutes ?? 0), 0);
  await db
    .update(task)
    .set({ actualHours: totalMin / 60, updatedAt: new Date() })
    .where(eq(task.id, taskId!));

  await writeAudit(a, "time.create", "time_entry", te!.id, {
    via: "work_complete",
  });

  const [log] = await db
    .insert(assetServiceLog)
    .values({
      assetId: data.assetId,
      title: data.serviceLog.title,
      description: data.serviceLog.description ?? null,
      performedAt: data.serviceLog.performedAt ?? new Date(),
      technicianName: data.serviceLog.technicianName ?? null,
      workType: data.workType,
      rawNotes: data.rawNotes ?? null,
      timeEntryId: te!.id,
      reportMarkdownStorage: markdownStorage,
      reportPdfStorage: pdfStorage,
    })
    .returning();

  await writeAudit(a, "asset_service_log.create", "asset_service_log", log!.id, {
    via: "work_complete",
  });

  return c.json({
    log,
    timeEntry: te,
    taskId,
    assetId: data.assetId,
  });
});

async function loadLogForOrg(a: AuthUser, logId: string) {
  const rows = await db
    .select({ log: assetServiceLog, asset })
    .from(assetServiceLog)
    .innerJoin(asset, eq(assetServiceLog.assetId, asset.id))
    .where(eq(assetServiceLog.id, logId));
  if (rows.length === 0 || rows[0]!.asset.organizationId !== a.organizationId) {
    return null;
  }
  return rows[0]!;
}

app.get("/asset-service-logs/:id/report-markdown", async (c) => {
  const a = c.get("auth") as AuthUser;
  const id = c.req.param("id");
  const row = await loadLogForOrg(a, id);
  if (!row) return c.json({ error: "Not found" }, 404);
  const storage = row.log.reportMarkdownStorage;
  if (!storage) return c.json({ markdown: null });
  try {
    const buf = await readServiceReportFile(a.organizationId, storage);
    return c.json({ markdown: buf.toString("utf8") });
  } catch {
    return c.json({ markdown: null });
  }
});

app.get("/asset-service-logs/:id/report.md", async (c) => {
  const a = c.get("auth") as AuthUser;
  const id = c.req.param("id");
  const row = await loadLogForOrg(a, id);
  if (!row) return c.json({ error: "Not found" }, 404);
  const storage = row.log.reportMarkdownStorage;
  if (!storage) return c.json({ error: "No markdown report" }, 404);
  try {
    const buf = await readServiceReportFile(a.organizationId, storage);
    return new Response(new Uint8Array(buf), {
      headers: {
        ...SERVICE_REPORT_DOWNLOAD_HEADERS,
        "Content-Type": "text/markdown; charset=utf-8",
        "Content-Disposition": `attachment; filename="${storage}"`,
      },
    });
  } catch {
    return c.json({ error: "File missing" }, 404);
  }
});

app.get("/asset-service-logs/:id/report.pdf", async (c) => {
  const a = c.get("auth") as AuthUser;
  const id = c.req.param("id");
  const row = await loadLogForOrg(a, id);
  if (!row) return c.json({ error: "Not found" }, 404);
  const markdownStorage = row.log.reportMarkdownStorage;
  if (!markdownStorage) {
    return c.json({ error: "No markdown report" }, 404);
  }
  try {
    const regenerated = await regenerateServiceReportPdf(
      a.organizationId,
      markdownStorage,
      row.log.reportPdfStorage,
    );
    if (!regenerated) {
      return c.json({ error: "PDF generation failed" }, 503);
    }
    if (regenerated.pdfStorage !== row.log.reportPdfStorage) {
      await db
        .update(assetServiceLog)
        .set({
          reportPdfStorage: regenerated.pdfStorage,
          updatedAt: new Date(),
        })
        .where(eq(assetServiceLog.id, id));
    }
    return new Response(new Uint8Array(regenerated.buffer), {
      headers: {
        ...SERVICE_REPORT_DOWNLOAD_HEADERS,
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${regenerated.pdfStorage}"`,
      },
    });
  } catch {
    return c.json({ error: "File missing" }, 404);
  }
});

export { app as workCompleteApp };
