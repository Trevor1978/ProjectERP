import { inArray, or } from "drizzle-orm";
import { db, task, taskDependency } from "@project-erp/db";

/** Drop dependencies whose ends no longer share a project after a move. */
export async function dropCrossProjectDependencies(movedTaskIds: string[]) {
  if (movedTaskIds.length === 0) return;
  const deps = await db
    .select()
    .from(taskDependency)
    .where(
      or(
        inArray(taskDependency.taskId, movedTaskIds),
        inArray(taskDependency.predecessorTaskId, movedTaskIds),
      ),
    );
  if (deps.length === 0) return;
  const ids = [...new Set(deps.flatMap((d) => [d.taskId, d.predecessorTaskId]))];
  const rows = await db
    .select({ id: task.id, projectId: task.projectId })
    .from(task)
    .where(inArray(task.id, ids));
  const projectByTask = new Map(rows.map((row) => [row.id, row.projectId]));
  const dropIds = deps
    .filter((d) => projectByTask.get(d.taskId) !== projectByTask.get(d.predecessorTaskId))
    .map((d) => d.id);
  if (dropIds.length === 0) return;
  await db.delete(taskDependency).where(inArray(taskDependency.id, dropIds));
}
