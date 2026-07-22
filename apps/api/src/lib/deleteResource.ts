import { and, count, eq, inArray } from "drizzle-orm";
import {
  asset,
  assetServiceLog,
  client,
  db,
  milestone,
  procurementRequest,
  procurementRequestLine,
  project,
  projectAsset,
  projectBudget,
  projectMember,
  supplier,
  task,
  taskDependency,
  timeEntry,
  todo,
} from "@project-erp/db";
import type { AuthUser } from "./session.js";
import { canEditProjectDestructive, requireProject } from "./projectAccess.js";
import {
  deleteCommentsForProcurements,
  deleteCommentsForProjectTree,
  deleteCommentsForTasksAndTodos,
  deleteCommentsForTodo,
} from "./commentCleanup.js";
import { syncTaskPercentFromTodos } from "./deriveTaskPercent.js";
import { writeAudit } from "./audit.js";
import { syncProcurementStatusFromLineReceipts } from "./syncProcurementReceiveStatus.js";

export type DeletePreviewResponse = {
  canDelete: boolean;
  blockedReason: string | null;
  bullets: string[];
  recordLabel: string;
};

export async function previewDeleteClient(
  a: AuthUser,
  clientId: string,
): Promise<DeletePreviewResponse | { status: 403 | 404 }> {
  if (a.globalRole !== "org_admin") {
    return { status: 403 };
  }
  const rows = await db
    .select()
    .from(client)
    .where(and(eq(client.id, clientId), eq(client.organizationId, a.organizationId)));
  if (rows.length === 0) {
    return { status: 404 };
  }
  const c = rows[0]!;
  const nProjects = await db
    .select({ n: count() })
    .from(project)
    .where(eq(project.clientId, clientId));
  const pc = Number(nProjects[0]?.n ?? 0);
  if (pc > 0) {
    return {
      canDelete: false,
      blockedReason: `This customer still has ${pc} linked project(s). Reassign those projects to another customer or delete the projects first.`,
      bullets: [
        "The database prevents deleting a customer while projects reference it.",
      ],
      recordLabel: c.name,
    };
  }
  return {
    canDelete: true,
    blockedReason: null,
    bullets: ["Permanently removes this customer from your organization."],
    recordLabel: c.name,
  };
}

export async function executeDeleteClient(a: AuthUser, clientId: string): Promise<boolean> {
  const p = await previewDeleteClient(a, clientId);
  if ("status" in p || !p.canDelete) {
    return false;
  }
  await db.delete(client).where(and(eq(client.id, clientId), eq(client.organizationId, a.organizationId)));
  await writeAudit(a, "client.delete", "client", clientId, {});
  return true;
}

export async function previewDeleteSupplier(
  a: AuthUser,
  supplierId: string,
): Promise<DeletePreviewResponse | { status: 403 | 404 }> {
  if (a.globalRole !== "org_admin") {
    return { status: 403 };
  }
  const rows = await db
    .select()
    .from(supplier)
    .where(and(eq(supplier.id, supplierId), eq(supplier.organizationId, a.organizationId)));
  if (rows.length === 0) {
    return { status: 404 };
  }
  const s = rows[0]!;
  const nPr = await db
    .select({ n: count() })
    .from(procurementRequest)
    .where(eq(procurementRequest.supplierId, supplierId));
  const n = Number(nPr[0]?.n ?? 0);
  const bullets: string[] = ["Permanently removes this supplier from your organization."];
  if (n > 0) {
    bullets.unshift(
      `${n} purchasing record(s) will keep their RFQ data but will no longer show this supplier (link cleared).`,
    );
  }
  return { canDelete: true, blockedReason: null, bullets, recordLabel: s.name };
}

export async function executeDeleteSupplier(a: AuthUser, supplierId: string): Promise<boolean> {
  const p = await previewDeleteSupplier(a, supplierId);
  if ("status" in p || !p.canDelete) {
    return false;
  }
  await db.delete(supplier).where(and(eq(supplier.id, supplierId), eq(supplier.organizationId, a.organizationId)));
  await writeAudit(a, "supplier.delete", "supplier", supplierId, {});
  return true;
}

export async function previewDeleteProject(
  a: AuthUser,
  projectId: string,
): Promise<DeletePreviewResponse | { status: 404 }> {
  const pr = await requireProject(a, projectId);
  if ("error" in pr) {
    return { status: 404 };
  }
  const nm = await db.select({ n: count() }).from(milestone).where(eq(milestone.projectId, projectId));
  const nt = await db.select({ n: count() }).from(task).where(eq(task.projectId, projectId));
  const tids = await db.select({ id: task.id }).from(task).where(eq(task.projectId, projectId));
  const ids = tids.map((x) => x.id);
  let nTodo = 0;
  let nTe = 0;
  if (ids.length > 0) {
    const [td] = await db.select({ n: count() }).from(todo).where(inArray(todo.taskId, ids));
    nTodo = Number(td?.n ?? 0);
    const [te] = await db.select({ n: count() }).from(timeEntry).where(inArray(timeEntry.taskId, ids));
    nTe = Number(te?.n ?? 0);
  }
  const nPr = await db
    .select({ n: count() })
    .from(procurementRequestLine)
    .where(eq(procurementRequestLine.projectId, projectId));
  const lineRows = await db
    .select({ procurementId: procurementRequestLine.procurementId })
    .from(procurementRequestLine)
    .where(eq(procurementRequestLine.projectId, projectId));
  const procurementIds = Array.from(new Set(lineRows.map((x) => x.procurementId)));
  const nMem = await db
    .select({ n: count() })
    .from(projectMember)
    .where(eq(projectMember.projectId, projectId));
  const nBudget = await db
    .select({ n: count() })
    .from(projectBudget)
    .where(eq(projectBudget.projectId, projectId));
  const canDel = await canEditProjectDestructive(a, projectId);
  const bullets: string[] = [
    `${Number(nm[0]?.n ?? 0)} milestone(s)`,
    `${Number(nt[0]?.n ?? 0)} task(s)`,
    `${nTodo} todo(s)`,
    `${nTe} time entr${nTe === 1 ? "y" : "ies"}`,
    `${procurementIds.length} purchasing record(s) (RFQ/PO) with ${Number(nPr[0]?.n ?? 0)} line item(s) linked to this project`,
    `${Number(nMem[0]?.n ?? 0)} project member row(s)`,
    `${Number(nBudget[0]?.n ?? 0)} budget row(s)`,
    "Task dependencies, saved filters, document links, handover, and project–asset links tied to this project (cascaded by the database).",
    "Comments on this project, its tasks, todos, and purchasing records will be removed so nothing is left orphaned.",
  ];
  if (!canDel) {
    return {
      canDelete: false,
      blockedReason:
        "Only an org admin or a project PM/admin on this project may delete the project.",
      bullets,
      recordLabel: pr.name,
    };
  }
  return {
    canDelete: true,
    blockedReason: null,
    bullets: [
      "This permanently deletes the project and all of the following counts:",
      ...bullets.map((b) => `• ${b}`),
    ],
    recordLabel: pr.name,
  };
}

export async function executeDeleteProject(a: AuthUser, projectId: string): Promise<boolean> {
  const pr = await requireProject(a, projectId);
  if ("error" in pr) {
    return false;
  }
  if (!(await canEditProjectDestructive(a, projectId))) {
    return false;
  }
  await deleteCommentsForProjectTree(db, projectId);
  await db.delete(project).where(eq(project.id, projectId));
  await writeAudit(a, "project.delete", "project", projectId, { name: pr.name });
  return true;
}

export async function previewDeleteMilestone(
  a: AuthUser,
  milestoneId: string,
): Promise<DeletePreviewResponse | { status: 404 }> {
  const cur = await db.select().from(milestone).where(eq(milestone.id, milestoneId));
  if (cur.length === 0) {
    return { status: 404 };
  }
  const pr = await requireProject(a, cur[0]!.projectId);
  if ("error" in pr) {
    return { status: 404 };
  }
  const tids = await db.select({ id: task.id }).from(task).where(eq(task.milestoneId, milestoneId));
  const ids = tids.map((x) => x.id);
  let nTodo = 0;
  let nTe = 0;
  let nDep = 0;
  if (ids.length > 0) {
    const [td] = await db.select({ n: count() }).from(todo).where(inArray(todo.taskId, ids));
    nTodo = Number(td?.n ?? 0);
    const [te] = await db.select({ n: count() }).from(timeEntry).where(inArray(timeEntry.taskId, ids));
    nTe = Number(te?.n ?? 0);
    const [d1] = await db
      .select({ n: count() })
      .from(taskDependency)
      .where(inArray(taskDependency.taskId, ids));
    const [d2] = await db
      .select({ n: count() })
      .from(taskDependency)
      .where(inArray(taskDependency.predecessorTaskId, ids));
    nDep = Number(d1?.n ?? 0) + Number(d2?.n ?? 0);
  }
  const bullets = [
    `${ids.length} task(s) in this milestone (and their todos, time entries, and dependencies) will be permanently deleted.`,
    `${nTodo} todo(s), ${nTe} time entr${nTe === 1 ? "y" : "ies"}, ${nDep} task dependency row(s).`,
    "Comments on those tasks and todos will be removed.",
  ];
  return {
    canDelete: true,
    blockedReason: null,
    bullets: bullets.map((b) => `• ${b}`),
    recordLabel: cur[0]!.name,
  };
}

export async function executeDeleteMilestone(a: AuthUser, milestoneId: string): Promise<boolean> {
  const cur = await db.select().from(milestone).where(eq(milestone.id, milestoneId));
  if (cur.length === 0) {
    return false;
  }
  const pr = await requireProject(a, cur[0]!.projectId);
  if ("error" in pr) {
    return false;
  }
  const tids = await db.select({ id: task.id }).from(task).where(eq(task.milestoneId, milestoneId));
  await deleteCommentsForTasksAndTodos(
    db,
    tids.map((x) => x.id),
  );
  await db.delete(milestone).where(eq(milestone.id, milestoneId));
  await writeAudit(a, "milestone.delete", "milestone", milestoneId, { name: cur[0]!.name });
  return true;
}

export async function previewDeleteTask(
  a: AuthUser,
  taskId: string,
): Promise<DeletePreviewResponse | { status: 404 }> {
  const cur = await db.select().from(task).where(eq(task.id, taskId));
  if (cur.length === 0) {
    return { status: 404 };
  }
  const pr = await requireProject(a, cur[0]!.projectId);
  if ("error" in pr) {
    return { status: 404 };
  }
  const [nTodo] = await db.select({ n: count() }).from(todo).where(eq(todo.taskId, taskId));
  const [nTe] = await db.select({ n: count() }).from(timeEntry).where(eq(timeEntry.taskId, taskId));
  const [d1] = await db.select({ n: count() }).from(taskDependency).where(eq(taskDependency.taskId, taskId));
  const [d2] = await db
    .select({ n: count() })
    .from(taskDependency)
    .where(eq(taskDependency.predecessorTaskId, taskId));
  const nDep = Number(d1?.n ?? 0) + Number(d2?.n ?? 0);
  return {
    canDelete: true,
    blockedReason: null,
    bullets: [
      `• ${Number(nTodo?.n ?? 0)} todo(s) on this task will be deleted.`,
      `• ${Number(nTe?.n ?? 0)} time entr${Number(nTe?.n ?? 0) === 1 ? "y" : "ies"} on this task will be deleted.`,
      `• ${nDep} task dependency row(s) involving this task will be deleted.`,
      "• Comments on this task and its todos will be removed.",
    ],
    recordLabel: cur[0]!.title,
  };
}

export async function executeDeleteTask(a: AuthUser, taskId: string): Promise<boolean> {
  const cur = await db.select().from(task).where(eq(task.id, taskId));
  if (cur.length === 0) {
    return false;
  }
  const pr = await requireProject(a, cur[0]!.projectId);
  if ("error" in pr) {
    return false;
  }
  await deleteCommentsForTasksAndTodos(db, [taskId]);
  await db.delete(task).where(eq(task.id, taskId));
  await writeAudit(a, "task.delete", "task", taskId, { title: cur[0]!.title });
  return true;
}

export async function previewDeleteTodo(
  a: AuthUser,
  todoId: string,
): Promise<DeletePreviewResponse | { status: 404 }> {
  const cur = await db.select().from(todo).where(eq(todo.id, todoId));
  if (cur.length === 0) {
    return { status: 404 };
  }
  const t = await db.select().from(task).where(eq(task.id, cur[0]!.taskId));
  if (t.length === 0) {
    return { status: 404 };
  }
  const pr = await requireProject(a, t[0]!.projectId);
  if ("error" in pr) {
    return { status: 404 };
  }
  const [nTe] = await db.select({ n: count() }).from(timeEntry).where(eq(timeEntry.todoId, todoId));
  const n = Number(nTe?.n ?? 0);
  return {
    canDelete: true,
    blockedReason: null,
    bullets: [
      "• Comments on this todo will be removed.",
      n > 0
        ? `• ${n} time entr${n === 1 ? "y" : "ies"} reference this todo: the link will be cleared but minutes and notes on those entries are kept.`
        : "• No time entries are linked only to this todo.",
    ],
    recordLabel: cur[0]!.title,
  };
}

export async function executeDeleteTodo(a: AuthUser, todoId: string): Promise<boolean> {
  const cur = await db.select().from(todo).where(eq(todo.id, todoId));
  if (cur.length === 0) {
    return false;
  }
  const t = await db.select().from(task).where(eq(task.id, cur[0]!.taskId));
  if (t.length === 0) {
    return false;
  }
  const pr = await requireProject(a, t[0]!.projectId);
  if ("error" in pr) {
    return false;
  }
  const taskId = t[0]!.id;
  await deleteCommentsForTodo(db, todoId);
  await db.delete(todo).where(eq(todo.id, todoId));
  await syncTaskPercentFromTodos(taskId);
  await writeAudit(a, "todo.delete", "todo", todoId, {});
  return true;
}

export async function previewDeleteProcurement(
  a: AuthUser,
  procurementId: string,
): Promise<DeletePreviewResponse | { status: 404 }> {
  const cur = await db.select().from(procurementRequest).where(eq(procurementRequest.id, procurementId));
  if (cur.length === 0) {
    return { status: 404 };
  }
  if (cur[0]!.organizationId !== a.organizationId) {
    return { status: 404 };
  }
  if (a.globalRole !== "org_admin") {
    const memberProjects = await db
      .select({ projectId: projectMember.projectId })
      .from(projectMember)
      .where(eq(projectMember.userId, a.id));
    const pids = memberProjects.map((x) => x.projectId);
    const allowed = pids.length
      ? await db
          .select({ id: procurementRequestLine.id })
          .from(procurementRequestLine)
          .where(
            and(
              eq(procurementRequestLine.procurementId, procurementId),
              inArray(procurementRequestLine.projectId, pids),
            ),
          )
          .limit(1)
      : [];
    if (allowed.length === 0) {
      return { status: 404 };
    }
  }
  const [nLines] = await db
    .select({ n: count() })
    .from(procurementRequestLine)
    .where(eq(procurementRequestLine.procurementId, procurementId));
  return {
    canDelete: true,
    blockedReason: null,
    bullets: [
      `• ${Number(nLines?.n ?? 0)} purchasing line item(s) will be deleted with this record.`,
      "• Comments on this purchasing record will be removed.",
    ].filter(Boolean),
    recordLabel: cur[0]!.title,
  };
}

export async function executeDeleteProcurement(a: AuthUser, procurementId: string): Promise<boolean> {
  const cur = await db.select().from(procurementRequest).where(eq(procurementRequest.id, procurementId));
  if (cur.length === 0) {
    return false;
  }
  if (cur[0]!.organizationId !== a.organizationId) {
    return false;
  }
  if (a.globalRole !== "org_admin") {
    const memberProjects = await db
      .select({ projectId: projectMember.projectId })
      .from(projectMember)
      .where(eq(projectMember.userId, a.id));
    const pids = memberProjects.map((x) => x.projectId);
    const allowed = pids.length
      ? await db
          .select({ id: procurementRequestLine.id })
          .from(procurementRequestLine)
          .where(
            and(
              eq(procurementRequestLine.procurementId, procurementId),
              inArray(procurementRequestLine.projectId, pids),
            ),
          )
          .limit(1)
      : [];
    if (allowed.length === 0) {
      return false;
    }
  }
  await deleteCommentsForProcurements(db, [procurementId]);
  await db.delete(procurementRequest).where(eq(procurementRequest.id, procurementId));
  await writeAudit(a, "procurement.delete", "procurement", procurementId, { title: cur[0]!.title });
  return true;
}

export async function previewDeleteProcurementLine(
  a: AuthUser,
  lineId: string,
): Promise<DeletePreviewResponse | { status: 404 }> {
  const cur = await db.select().from(procurementRequestLine).where(eq(procurementRequestLine.id, lineId));
  if (cur.length === 0) {
    return { status: 404 };
  }
  const prq = await db
    .select()
    .from(procurementRequest)
    .where(eq(procurementRequest.id, cur[0]!.procurementId));
  if (prq.length === 0) {
    return { status: 404 };
  }
  if (prq[0]!.organizationId !== a.organizationId) {
    return { status: 404 };
  }
  const pr = await requireProject(a, cur[0]!.projectId);
  if ("error" in pr) {
    return { status: 404 };
  }
  return {
    canDelete: true,
    blockedReason: null,
    bullets: ["• Only this line row is removed; the parent purchasing record and other lines stay."],
    recordLabel: cur[0]!.description.slice(0, 80) + (cur[0]!.description.length > 80 ? "…" : ""),
  };
}

export async function executeDeleteProcurementLine(a: AuthUser, lineId: string): Promise<boolean> {
  const cur = await db.select().from(procurementRequestLine).where(eq(procurementRequestLine.id, lineId));
  if (cur.length === 0) {
    return false;
  }
  const prq = await db
    .select()
    .from(procurementRequest)
    .where(eq(procurementRequest.id, cur[0]!.procurementId));
  if (prq.length === 0) {
    return false;
  }
  if (prq[0]!.organizationId !== a.organizationId) {
    return false;
  }
  const pr = await requireProject(a, cur[0]!.projectId);
  if ("error" in pr) {
    return false;
  }
  const procurementId = cur[0]!.procurementId;
  await db.delete(procurementRequestLine).where(eq(procurementRequestLine.id, lineId));
  await writeAudit(a, "procurement_line.delete", "procurement_request_line", lineId, {});
  await syncProcurementStatusFromLineReceipts(procurementId);
  return true;
}

async function recalcTaskHours(taskId: string): Promise<void> {
  const all = await db.select().from(timeEntry).where(eq(timeEntry.taskId, taskId));
  const totalMin = all.reduce((acc, e) => acc + (e.durationMinutes ?? 0), 0);
  await db
    .update(task)
    .set({ actualHours: totalMin / 60, updatedAt: new Date() })
    .where(eq(task.id, taskId));
}

export async function previewDeleteTimeEntry(
  a: AuthUser,
  entryId: string,
): Promise<DeletePreviewResponse | { status: 403 | 404 }> {
  const cur = await db.select().from(timeEntry).where(eq(timeEntry.id, entryId));
  if (cur.length === 0) {
    return { status: 404 };
  }
  if (cur[0]!.userId !== a.id && a.globalRole !== "org_admin") {
    return { status: 403 };
  }
  const tk = await db.select().from(task).where(eq(task.id, cur[0]!.taskId));
  if (tk.length === 0) {
    return { status: 404 };
  }
  const pr = await requireProject(a, tk[0]!.projectId);
  if ("error" in pr) {
    return { status: 404 };
  }
  return {
    canDelete: true,
    blockedReason: null,
    bullets: [
      "• This time entry will be removed.",
      "• The parent task's rolled-up actual hours will be recalculated from remaining entries.",
    ],
    recordLabel: (cur[0]!.note ?? "").slice(0, 60) || `Time entry ${entryId.slice(0, 8)}…`,
  };
}

export async function executeDeleteTimeEntry(a: AuthUser, entryId: string): Promise<boolean> {
  const cur = await db.select().from(timeEntry).where(eq(timeEntry.id, entryId));
  if (cur.length === 0) {
    return false;
  }
  if (cur[0]!.userId !== a.id && a.globalRole !== "org_admin") {
    return false;
  }
  const tk = await db.select().from(task).where(eq(task.id, cur[0]!.taskId));
  if (tk.length === 0) {
    return false;
  }
  const pr = await requireProject(a, tk[0]!.projectId);
  if ("error" in pr) {
    return false;
  }
  const taskId = cur[0]!.taskId;
  await db.delete(timeEntry).where(eq(timeEntry.id, entryId));
  await recalcTaskHours(taskId);
  await writeAudit(a, "time.delete", "time_entry", entryId, {});
  return true;
}

export async function previewDeleteAsset(
  a: AuthUser,
  assetId: string,
): Promise<DeletePreviewResponse | { status: 403 | 404 }> {
  if (a.globalRole !== "org_admin") {
    return { status: 403 };
  }
  const rows = await db
    .select()
    .from(asset)
    .where(and(eq(asset.id, assetId), eq(asset.organizationId, a.organizationId)));
  if (rows.length === 0) {
    return { status: 404 };
  }
  const [logCount] = await db
    .select({ n: count() })
    .from(assetServiceLog)
    .where(eq(assetServiceLog.assetId, assetId));
  const [linkCount] = await db
    .select({ n: count() })
    .from(projectAsset)
    .where(eq(projectAsset.assetId, assetId));
  const nLogs = Number(logCount?.n ?? 0);
  const nLinks = Number(linkCount?.n ?? 0);
  return {
    canDelete: true,
    blockedReason: null,
    bullets: [
      "• This machine will be removed.",
      nLogs > 0
        ? `• ${nLogs} service history entr${nLogs === 1 ? "y" : "ies"} will be deleted.`
        : "• No service history entries.",
      nLinks > 0
        ? `• ${nLinks} project link${nLinks === 1 ? "" : "s"} will be removed.`
        : "• No project links.",
    ],
    recordLabel: rows[0]!.name,
  };
}

export async function executeDeleteAsset(
  a: AuthUser,
  assetId: string,
): Promise<boolean> {
  const p = await previewDeleteAsset(a, assetId);
  if ("status" in p || !p.canDelete) {
    return false;
  }
  await db
    .delete(asset)
    .where(and(eq(asset.id, assetId), eq(asset.organizationId, a.organizationId)));
  await writeAudit(a, "asset.delete", "asset", assetId, {});
  return true;
}

export async function previewDeleteServiceLog(
  a: AuthUser,
  logId: string,
): Promise<DeletePreviewResponse | { status: 403 | 404 }> {
  const cur = await db
    .select({ log: assetServiceLog, asset: asset })
    .from(assetServiceLog)
    .innerJoin(asset, eq(assetServiceLog.assetId, asset.id))
    .where(eq(assetServiceLog.id, logId));
  if (cur.length === 0 || cur[0]!.asset.organizationId !== a.organizationId) {
    return { status: 404 };
  }
  return {
    canDelete: true,
    blockedReason: null,
    bullets: [
      "• This service history entry will be removed.",
      "• Linked markdown/PDF report files (if any) will no longer be available.",
    ],
    recordLabel: cur[0]!.log.title,
  };
}

export async function executeDeleteServiceLog(
  a: AuthUser,
  logId: string,
): Promise<boolean> {
  const p = await previewDeleteServiceLog(a, logId);
  if ("status" in p || !p.canDelete) {
    return false;
  }
  await db.delete(assetServiceLog).where(eq(assetServiceLog.id, logId));
  await writeAudit(a, "asset_service_log.delete", "asset_service_log", logId, {});
  return true;
}
