import { and, asc, eq, inArray, lt, ne, or, sql } from "drizzle-orm";
import {
  db,
  project,
  task,
  todo,
  user as userTable,
} from "@project-erp/db";
import { effectiveTodoAssetId } from "./workAsset.js";

export type OutstandingTaskRow = {
  id: string;
  title: string;
  projectId: string;
  projectName: string;
  assigneeId: string | null;
  assigneeName: string | null;
  percentComplete: number;
  endAt: Date | null;
  assetId: string;
  linkSource: "task";
};

export type OutstandingTodoRow = {
  id: string;
  title: string;
  taskId: string;
  taskTitle: string;
  projectId: string;
  projectName: string;
  status: string;
  dueAt: Date | null;
  assigneeId: string | null;
  assigneeName: string | null;
  effectiveAssetId: string;
  linkSource: "todo" | "task";
};

export async function listOutstandingWorkForAsset(
  organizationId: string,
  assetId: string,
  visibleProjectIds: string[],
): Promise<{ tasks: OutstandingTaskRow[]; todos: OutstandingTodoRow[] }> {
  if (visibleProjectIds.length === 0) {
    return { tasks: [], todos: [] };
  }

  const taskRows = await db
    .select({
      id: task.id,
      title: task.title,
      projectId: task.projectId,
      projectName: project.name,
      assigneeId: task.assigneeId,
      assigneeName: userTable.name,
      percentComplete: task.percentComplete,
      endAt: task.endAt,
      assetId: task.assetId,
    })
    .from(task)
    .innerJoin(project, eq(project.id, task.projectId))
    .leftJoin(userTable, eq(userTable.id, task.assigneeId))
    .where(
      and(
        eq(project.organizationId, organizationId),
        inArray(task.projectId, visibleProjectIds),
        eq(task.assetId, assetId),
        lt(task.percentComplete, 100),
      ),
    )
    .orderBy(asc(task.endAt), asc(task.title));

  const todoCandidates = await db
    .select({
      id: todo.id,
      title: todo.title,
      taskId: todo.taskId,
      taskTitle: task.title,
      projectId: task.projectId,
      projectName: project.name,
      status: todo.status,
      dueAt: todo.dueAt,
      assigneeId: todo.assigneeId,
      assigneeName: userTable.name,
      todoAssetId: todo.assetId,
      taskAssetId: task.assetId,
    })
    .from(todo)
    .innerJoin(task, eq(task.id, todo.taskId))
    .innerJoin(project, eq(project.id, task.projectId))
    .leftJoin(userTable, eq(userTable.id, todo.assigneeId))
    .where(
      and(
        eq(project.organizationId, organizationId),
        inArray(task.projectId, visibleProjectIds),
        ne(todo.status, "done"),
        ne(todo.status, "cancelled"),
        or(
          eq(todo.assetId, assetId),
          and(
            sql`${todo.assetId} IS NULL`,
            eq(task.assetId, assetId),
          ),
        ),
      ),
    )
    .orderBy(asc(todo.dueAt), asc(todo.title));

  const todos: OutstandingTodoRow[] = [];
  for (const row of todoCandidates) {
    const effective = effectiveTodoAssetId(row.todoAssetId, row.taskAssetId);
    if (effective !== assetId) continue;
    const linkSource: "todo" | "task" =
      row.todoAssetId === assetId ? "todo" : "task";
    todos.push({
      id: row.id,
      title: row.title,
      taskId: row.taskId,
      taskTitle: row.taskTitle,
      projectId: row.projectId,
      projectName: row.projectName,
      status: row.status,
      dueAt: row.dueAt,
      assigneeId: row.assigneeId,
      assigneeName: row.assigneeName,
      effectiveAssetId: effective,
      linkSource,
    });
  }

  const tasks: OutstandingTaskRow[] = taskRows
    .filter((r) => r.assetId != null)
    .map((r) => ({
      id: r.id,
      title: r.title,
      projectId: r.projectId,
      projectName: r.projectName,
      assigneeId: r.assigneeId,
      assigneeName: r.assigneeName,
      percentComplete: r.percentComplete,
      endAt: r.endAt,
      assetId: r.assetId!,
      linkSource: "task" as const,
    }));

  return { tasks, todos };
}
