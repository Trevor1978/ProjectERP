import { eq } from "drizzle-orm";
import { db, procurementRequestLine, projectItem } from "@project-erp/db";
import { effectiveOrderedQty, lineFullyReceived } from "./procurementReceipt.js";

function qtyNum(s: string): number {
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

/** Recompute project item status from linked procurement lines. */
export async function syncProjectItemStatus(projectItemId: string): Promise<void> {
  const items = await db
    .select()
    .from(projectItem)
    .where(eq(projectItem.id, projectItemId));
  const item = items[0];
  if (!item || item.status === "cancelled") return;

  const lines = await db
    .select()
    .from(procurementRequestLine)
    .where(eq(procurementRequestLine.projectItemId, projectItemId));

  if (lines.length === 0) {
    if (item.status !== "specified") {
      await db
        .update(projectItem)
        .set({ status: "specified", updatedAt: new Date() })
        .where(eq(projectItem.id, projectItemId));
    }
    return;
  }

  const required = qtyNum(item.quantity);
  let orderedSum = 0;
  let receivedSum = 0;
  let allLinesComplete = true;

  for (const line of lines) {
    const ord = effectiveOrderedQty(line.quantity, line.orderedQty);
    orderedSum += qtyNum(ord);
    receivedSum += line.receivedQty;
    if (!lineFullyReceived(line.quantity, line.receivedQty, line.orderedQty)) {
      allLinesComplete = false;
    }
  }

  let next: "on_order" | "partial" | "received" = "on_order";
  if (allLinesComplete && required > 0 && receivedSum >= required - 1e-9) {
    next = "received";
  } else if (receivedSum > 0 || orderedSum > 0) {
    next = receivedSum > 0 && !allLinesComplete ? "partial" : "on_order";
    if (receivedSum > 0 && receivedSum < required) next = "partial";
    if (allLinesComplete && receivedSum > 0 && receivedSum < required - 1e-9) {
      next = "partial";
    }
  }

  if (item.status !== next) {
    await db
      .update(projectItem)
      .set({ status: next, updatedAt: new Date() })
      .where(eq(projectItem.id, projectItemId));
  }
}

export async function syncProjectItemsForLine(lineId: string): Promise<void> {
  const rows = await db
    .select({ projectItemId: procurementRequestLine.projectItemId })
    .from(procurementRequestLine)
    .where(eq(procurementRequestLine.id, lineId));
  const pid = rows[0]?.projectItemId;
  if (pid) await syncProjectItemStatus(pid);
}
