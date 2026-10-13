import { eq } from "drizzle-orm";
import { db, todo, task } from "@project-erp/db";

export async function syncTaskPercentFromTodos(taskId: string) {
  const t = await db.select().from(task).where(eq(task.id, taskId));
  if (t.length === 0) return;
  if (!t[0]!.useDerivedPercent) return;

  const list = await db.select().from(todo).where(eq(todo.taskId, taskId));
  const prev = t[0]!.percentComplete ?? 0;
  let pct = 0;
  if (list.length > 0) {
    const done = list.filter(
      (r) => r.status === "done" || r.status === "cancelled",
    ).length;
    pct = Math.round((done / list.length) * 100);
  }
  await db
    .update(task)
    .set({
      percentComplete: pct,
      ...(pct >= 100 && prev < 100 ? { completed: true } : {}),
      updatedAt: new Date(),
    })
    .where(eq(task.id, taskId));
}
