import type { Procurement } from "./purchasingTypes";
import { effectiveOrderedQty, lineFullyReceived, linePartiallyReceived } from "./procurementReceiptShared";

export type LineReceiptInput = {
  quantity: string;
  orderedQty: string | null;
  receivedQty: number;
};

export function procurementLineRowClass(
  line: LineReceiptInput,
  opts: {
    needBy: string | null;
    fullyReceivedOverride: boolean;
    procStatus: Procurement["status"];
  },
): string {
  if (opts.fullyReceivedOverride || lineFullyReceived(line.quantity, line.receivedQty, line.orderedQty)) {
    return "bg-emerald-50/90";
  }
  if (linePartiallyReceived(line.quantity, line.receivedQty, line.orderedQty)) {
    return "bg-amber-50/90";
  }
  if (isProcurementOverdue(opts.needBy, opts.procStatus)) {
    return "bg-red-50/90";
  }
  return "";
}

export function isProcurementOverdue(
  needBy: string | null,
  status: Procurement["status"],
): boolean {
  if (!needBy || status === "closed" || status === "cancelled") return false;
  return new Date(needBy).getTime() < Date.now();
}

export function formatOrderedQty(orderedQty: string | null): string {
  const t = orderedQty?.trim();
  return t ? t : "—";
}

export function calcProcurementTotals(
  lines: { quantity: string; orderedQty: string | null; estUnitPrice: number | null }[],
  gstRate = 0.1,
): { subtotal: number; gst: number; total: number } {
  let subtotal = 0;
  for (const l of lines) {
    const q = Number(effectiveOrderedQty(l.quantity, l.orderedQty));
    if (!Number.isFinite(q) || q <= 0 || l.estUnitPrice == null) continue;
    subtotal += q * l.estUnitPrice;
  }
  const gst = subtotal * gstRate;
  return { subtotal, gst, total: subtotal + gst };
}
