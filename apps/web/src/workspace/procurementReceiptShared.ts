export function orderedQuantity(qtyStr: string): number {
  return Number(qtyStr);
}

export function lineFullyReceived(qtyStr: string, receivedQty: number): boolean {
  const q = orderedQuantity(qtyStr);
  if (!Number.isFinite(q)) return false;
  if (q <= 0) return receivedQty <= 0;
  return Math.abs(q - receivedQty) < 1e-9;
}

export function linePartiallyReceived(qtyStr: string, receivedQty: number): boolean {
  return receivedQty > 0 && !lineFullyReceived(qtyStr, receivedQty);
}
