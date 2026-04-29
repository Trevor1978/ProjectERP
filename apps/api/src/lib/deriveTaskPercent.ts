import { eq } from "drizzle-orm";
import { db, todo, task } from "@project-erp/db";

export async function syncTaskPercentFromTodos(taskId: string) {
  const t = await db.select().from(task).where(eq(task.id, taskId));
  if (t.length === 0) return;
  if (!t[0]!.useDerivedPercent) return;

  const list = await db.select().from(todo).where(eq(todo.taskId, taskId));
  if (list.length === 0) {
    await db
      .update(task)
      .set({ percentComplete: 0, updatedAt: new Date() })
      .where(eq(task.id, taskId));
    return;
  }
  const done = list.filter((r) => r.status === "done").length;
  const pct = Math.round((done / list.length) * 100);
  await db
    .update(task)
    .set({ percentComplete: pct, updatedAt: new Date() })
    .where(eq(task.id, taskId));
}
