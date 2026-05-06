import { eq } from "drizzle-orm";
import { db, procurementRequest, procurementRequestLine } from "@project-erp/db";

/**
 * When every line on a procurement is marked received, set procurement to `closed`.
 * When not all lines are received and status is `closed`, set back to `ordered` (e.g. new line or unchecked).
 */
export async function syncProcurementStatusFromLineReceipts(
  procurementId: string,
): Promise<void> {
  const lines = await db
    .select()
    .from(procurementRequestLine)
    .where(eq(procurementRequestLine.procurementId, procurementId));
  if (lines.length === 0) {
    return;
  }
  const allReceived = lines.every((l) => l.received);
  const prRows = await db
    .select()
    .from(procurementRequest)
    .where(eq(procurementRequest.id, procurementId));
  if (prRows.length === 0) {
    return;
  }
  const pr = prRows[0]!;
  if (allReceived && pr.status !== "closed") {
    await db
      .update(procurementRequest)
      .set({
        status: "closed",
        version: (pr.version ?? 0) + 1,
        updatedAt: new Date(),
      })
      .where(eq(procurementRequest.id, procurementId));
    return;
  }
  if (!allReceived && pr.status === "closed") {
    await db
      .update(procurementRequest)
      .set({
        status: "ordered",
        version: (pr.version ?? 0) + 1,
        updatedAt: new Date(),
      })
      .where(eq(procurementRequest.id, procurementId));
  }
}
