import { eq } from "drizzle-orm";
import { db, procurementRequest, procurementRequestLine } from "@project-erp/db";
import {
  lineFullyReceived,
  linePartiallyReceived,
} from "./procurementReceipt.js";

const RECEIVING_STATUSES = new Set([
  "ordered",
  "partially_received",
  "closed",
]);

/**
 * Derives procurement status from line receipts and optional fully-received override.
 * Override forces `closed`. Otherwise all lines fully received → `closed`;
 * some receipt but not all complete → `partially_received` (when in receiving flow);
 * no receipts after partial/closed → `ordered`.
 */
export async function syncProcurementStatusFromLineReceipts(
  procurementId: string,
): Promise<void> {
  const prRows = await db
    .select()
    .from(procurementRequest)
    .where(eq(procurementRequest.id, procurementId));
  if (prRows.length === 0) {
    return;
  }
  const pr = prRows[0]!;
  if (pr.status === "cancelled") {
    return;
  }

  if (pr.fullyReceivedOverride) {
    if (pr.status !== "closed") {
      await db
        .update(procurementRequest)
        .set({
          status: "closed",
          version: (pr.version ?? 0) + 1,
          updatedAt: new Date(),
        })
        .where(eq(procurementRequest.id, procurementId));
    }
    return;
  }

  const lines = await db
    .select()
    .from(procurementRequestLine)
    .where(eq(procurementRequestLine.procurementId, procurementId));
  if (lines.length === 0) {
    return;
  }

  const allFull = lines.every((l) =>
    lineFullyReceived(l.quantity, l.receivedQty),
  );
  const anyPartial = lines.some((l) =>
    linePartiallyReceived(l.quantity, l.receivedQty),
  );
  const anyReceive = lines.some((l) => l.receivedQty > 0);

  let nextStatus = pr.status;

  if (allFull) {
    nextStatus = "closed";
  } else if (anyPartial && RECEIVING_STATUSES.has(pr.status)) {
    nextStatus = "partially_received";
  } else if (
    !anyReceive &&
    (pr.status === "partially_received" || pr.status === "closed")
  ) {
    nextStatus = "ordered";
  } else {
    return;
  }

  if (nextStatus !== pr.status) {
    await db
      .update(procurementRequest)
      .set({
        status: nextStatus,
        version: (pr.version ?? 0) + 1,
        updatedAt: new Date(),
      })
      .where(eq(procurementRequest.id, procurementId));
  }
}
