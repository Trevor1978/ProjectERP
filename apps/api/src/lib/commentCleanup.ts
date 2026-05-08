import { and, eq, inArray, or } from "drizzle-orm";
import { comment, db, procurementRequest, procurementRequestLine, task, todo } from "@project-erp/db";

type Db = typeof db;

/** Comments whose parent is a procurement row (by id list). */
export async function deleteCommentsForProcurements(
  db: Db,
  procurementIds: string[],
): Promise<void> {
  if (procurementIds.length === 0) return;
  await db
    .delete(comment)
    .where(
      and(
        eq(comment.parentType, "procurement"),
        inArray(comment.parentId, procurementIds),
      ),
    );
}

/** Comments on tasks and their todos (by task id list). */
export async function deleteCommentsForTasksAndTodos(
  db: Db,
  taskIds: string[],
): Promise<void> {
  if (taskIds.length === 0) return;
  const todoRows = await db
    .select({ id: todo.id })
    .from(todo)
    .where(inArray(todo.taskId, taskIds));
  const todoIds = todoRows.map((r) => r.id);
  const taskCond = and(eq(comment.parentType, "task"), inArray(comment.parentId, taskIds));
  if (todoIds.length === 0) {
    await db.delete(comment).where(taskCond);
    return;
  }
  const todoCond = and(eq(comment.parentType, "todo"), inArray(comment.parentId, todoIds));
  await db.delete(comment).where(or(taskCond, todoCond));
}

/** Comments on a single todo. */
export async function deleteCommentsForTodo(db: Db, todoId: string): Promise<void> {
  await db
    .delete(comment)
    .where(and(eq(comment.parentType, "todo"), eq(comment.parentId, todoId)));
}

/** Project-scoped comments: project itself, all tasks/todos, all procurement touching project lines. */
export async function deleteCommentsForProjectTree(
  db: Db,
  projectId: string,
): Promise<void> {
  await db
    .delete(comment)
    .where(and(eq(comment.parentType, "project"), eq(comment.parentId, projectId)));

  const tasks = await db
    .select({ id: task.id })
    .from(task)
    .where(eq(task.projectId, projectId));
  const taskIds = tasks.map((t) => t.id);
  await deleteCommentsForTasksAndTodos(db, taskIds);

  const lineRows = await db
    .select({ procurementId: procurementRequestLine.procurementId })
    .from(procurementRequestLine)
    .where(eq(procurementRequestLine.projectId, projectId));
  const procurementIds = Array.from(new Set(lineRows.map((p) => p.procurementId)));
  const procs =
    procurementIds.length === 0
      ? []
      : await db
          .select({ id: procurementRequest.id })
          .from(procurementRequest)
          .where(inArray(procurementRequest.id, procurementIds));
  await deleteCommentsForProcurements(
    db,
    procs.map((p) => p.id),
  );
}
