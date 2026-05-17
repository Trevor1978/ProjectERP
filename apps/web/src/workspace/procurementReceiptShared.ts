export function orderedQuantity(qtyStr: string): number {
  return Number(qtyStr);
}

export function effectiveOrderedQty(
  quantity: string,
  orderedQty: string | null | undefined,
): string {
  const t = orderedQty?.trim();
  return t ? t : quantity;
}

export function lineFullyReceived(
  quantity: string,
  receivedQty: number,
  orderedQty?: string | null,
): boolean {
  const q = orderedQuantity(effectiveOrderedQty(quantity, orderedQty));
  if (!Number.isFinite(q)) return false;
  if (q <= 0) return receivedQty <= 0;
  return Math.abs(q - receivedQty) < 1e-9;
}

export function linePartiallyReceived(
  quantity: string,
  receivedQty: number,
  orderedQty?: string | null,
): boolean {
  return receivedQty > 0 && !lineFullyReceived(quantity, receivedQty, orderedQty);
}
