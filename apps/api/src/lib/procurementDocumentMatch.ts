/** Document types the purchasing importer can read and apply. */
export const PROCUREMENT_DOCUMENT_TYPES = [
  "rfq",
  "quote",
  "po",
  "proforma_invoice",
  "tax_invoice",
  "delivery_docket",
  "other",
] as const;

export type ProcurementDocumentType = (typeof PROCUREMENT_DOCUMENT_TYPES)[number];

const STATUS_RANK: Record<string, number> = {
  draft: 0,
  rfq_sent: 1,
  quoted: 2,
  ordered: 3,
  partially_received: 4,
  closed: 5,
};

export type OrderSnapshot = {
  id: string;
  title: string;
  supplierId: string | null;
  status: string;
  sapPoNumber: string | null;
  quoteNumber: string | null;
  invoiceNumber: string | null;
  deliveryDocketNumbers: string | null;
};

export type DocumentIdentity = {
  documentType: ProcurementDocumentType;
  supplierId: string | null;
  sapPoNumber: string | null;
  quoteNumber: string | null;
  invoiceNumber: string | null;
  deliveryDocketNumber: string | null;
  lines: { partNumber: string | null; description: string }[];
};

export type MatchConfidence = "high" | "suggested" | "none";

export type OrderMatch = {
  procurementId: string | null;
  confidence: MatchConfidence;
  candidates: {
    order: OrderSnapshot;
    score: number;
    reasons: string[];
  }[];
};

export type ExistingProcLine = {
  id: string;
  partNumber: string | null;
  description: string;
  quantity: string;
  orderedQty: string | null;
  unit: string | null;
  estUnitPrice: number | null;
  receivedQty: number;
  projectId: string;
};

export type IncomingProcLine = {
  partNumber: string | null;
  description: string;
  quantity: string;
  orderedQty: string | null;
  unit: string | null;
  estUnitPrice: number | null;
  deliveredQty: number | null;
  projectId: string;
  /** When set and still on the order, this line is updated instead of rematching. */
  matchedLineId?: string | null;
};

export type PlannedLineUpdate = {
  lineId: string;
  partNumber: string | null;
  description: string;
  quantity: string;
  orderedQty: string | null;
  unit: string | null;
  estUnitPrice: number | null;
  receivedQty: number;
  /** Units this delivery docket contributes. Null when the document is not a receipt. */
  receiptContribution: number | null;
};

export type PlannedLineInsert = {
  partNumber: string | null;
  description: string;
  quantity: string;
  orderedQty: string | null;
  unit: string | null;
  estUnitPrice: number | null;
  projectId: string;
  receivedQty: number;
  receiptContribution: number | null;
};

export function isProcurementDocumentType(
  value: string,
): value is ProcurementDocumentType {
  return (PROCUREMENT_DOCUMENT_TYPES as readonly string[]).includes(value);
}

/** Compare document numbers ignoring case, spaces, and punctuation. A leading "PO" is ignored so "PO-100" matches "100". */
export function normalizeRef(value: string | null | undefined): string {
  if (!value) return "";
  const compact = value.toUpperCase().replace(/[^A-Z0-9]/g, "");
  const withoutPo = compact.replace(/^PO/, "");
  return withoutPo || compact;
}

export function normalizeText(value: string | null | undefined): string {
  return (value ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

export function parseWholeQty(value: string | number | null | undefined): number | null {
  if (value == null || value === "") return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.trunc(n);
}

function splitDocketNumbers(value: string | null | undefined): string[] {
  if (!value?.trim()) return [];
  return value
    .split(/[,;\n]+/)
    .map((part) => part.trim())
    .filter(Boolean);
}

export function appendDocketNumber(
  existing: string | null | undefined,
  next: string | null | undefined,
): string | null {
  const trimmed = next?.trim() ?? "";
  if (!trimmed) return existing?.trim() || null;
  const parts = splitDocketNumbers(existing);
  if (parts.some((part) => normalizeRef(part) === normalizeRef(trimmed))) {
    return parts.join(", ");
  }
  return [...parts, trimmed].join(", ");
}

function descriptionTokens(value: string): Set<string> {
  return new Set(value.split(" ").filter((token) => token.length >= 3));
}

function descriptionsAgree(incoming: string, existing: string): boolean {
  if (!incoming || !existing) return false;
  if (incoming === existing) return true;
  if (
    incoming.length >= 8 &&
    existing.length >= 8 &&
    (incoming.includes(existing) || existing.includes(incoming))
  ) {
    return true;
  }
  const left = descriptionTokens(incoming);
  const right = descriptionTokens(existing);
  if (left.size === 0 || right.size === 0) return false;
  let shared = 0;
  for (const token of left) {
    if (right.has(token)) shared += 1;
  }
  const smaller = Math.min(left.size, right.size);
  return shared >= 2 && shared / smaller >= 0.5;
}

function lineOverlap(
  doc: DocumentIdentity,
  orderParts: { partNumber: string | null; description: string }[] | undefined,
): { partHits: number; descriptionHits: number; ratio: number; orderLineCount: number } {
  const orderLineCount = orderParts?.length ?? 0;
  if (!orderParts?.length || doc.lines.length === 0) {
    return { partHits: 0, descriptionHits: 0, ratio: 0, orderLineCount };
  }
  const parts = new Set(
    orderParts.map((line) => normalizeRef(line.partNumber)).filter(Boolean),
  );
  const descriptions = orderParts
    .map((line) => normalizeText(line.description))
    .filter(Boolean);
  let partHits = 0;
  let descriptionHits = 0;
  for (const line of doc.lines) {
    const part = normalizeRef(line.partNumber);
    if (part && parts.has(part)) {
      partHits += 1;
      continue;
    }
    const description = normalizeText(line.description);
    if (description && descriptions.some((existing) => descriptionsAgree(description, existing))) {
      descriptionHits += 1;
    }
  }
  const matched = partHits + descriptionHits;
  return {
    partHits,
    descriptionHits,
    ratio: matched / doc.lines.length,
    orderLineCount,
  };
}

function confidentMatch(reasons: string[], orderLineCount: number): boolean {
  const hasStrongRef = reasons.some((reason) =>
    reason === "PO number" ||
    reason === "invoice number" ||
    reason === "quote number" ||
    reason === "delivery docket",
  );
  const hasLines =
    reasons.includes("part numbers") || reasons.includes("line descriptions");
  const hasSupplier = reasons.includes("supplier");
  if (reasons.includes("different PO number") || reasons.includes("different supplier")) {
    return false;
  }
  if (orderLineCount > 0) {
    return (
      hasLines &&
      (hasStrongRef || hasSupplier || reasons.includes("short PO number"))
    );
  }
  return hasStrongRef && hasSupplier;
}

export function scoreOrder(
  doc: DocumentIdentity,
  order: OrderSnapshot,
  orderLines?: { partNumber: string | null; description: string }[],
): { score: number; reasons: string[]; orderLineCount: number } {
  if (order.status === "cancelled") return { score: 0, reasons: [], orderLineCount: 0 };

  let score = 0;
  const reasons: string[] = [];
  const po = normalizeRef(doc.sapPoNumber);
  const invoice = normalizeRef(doc.invoiceNumber);
  const quote = normalizeRef(doc.quoteNumber);
  const docket = normalizeRef(doc.deliveryDocketNumber);
  const orderPo = normalizeRef(order.sapPoNumber);

  if (po && orderPo && po !== orderPo) {
    score -= 30;
    reasons.push("different PO number");
  } else if (po && po === orderPo) {
    if (po.length >= 5) {
      score += 35;
      reasons.push("PO number");
    } else {
      score += 12;
      reasons.push("short PO number");
    }
  }
  if (invoice && invoice === normalizeRef(order.invoiceNumber)) {
    score += invoice.length >= 4 ? 30 : 10;
    reasons.push("invoice number");
  }
  if (quote && quote === normalizeRef(order.quoteNumber)) {
    score += quote.length >= 4 ? 25 : 10;
    reasons.push("quote number");
  }
  if (
    docket &&
    splitDocketNumbers(order.deliveryDocketNumbers).some(
      (part) => normalizeRef(part) === docket,
    )
  ) {
    score += docket.length >= 4 ? 25 : 10;
    reasons.push("delivery docket");
  }

  if (doc.supplierId && order.supplierId) {
    if (doc.supplierId === order.supplierId) {
      score += 15;
      reasons.push("supplier");
    } else {
      score -= 20;
      reasons.push("different supplier");
    }
  }

  const overlap = lineOverlap(doc, orderLines);
  const matched = overlap.partHits + overlap.descriptionHits;
  const strongLines =
    overlap.partHits >= 2 || (matched > 0 && overlap.ratio >= 0.6);
  if (strongLines) {
    score += Math.round(40 * Math.max(overlap.ratio, 0.6));
    reasons.push(overlap.partHits >= 1 ? "part numbers" : "line descriptions");
  } else if (matched > 0) {
    score += Math.round(15 * overlap.ratio);
    reasons.push("some line items");
  }

  if (score <= 0) return { score: 0, reasons: [], orderLineCount: overlap.orderLineCount };
  return { score, reasons, orderLineCount: overlap.orderLineCount };
}

export function matchOrders(
  doc: DocumentIdentity,
  orders: OrderSnapshot[],
  linesByOrderId?: Map<string, { partNumber: string | null; description: string }[]>,
): OrderMatch {
  const ranked = orders
    .map((order) => {
      const scored = scoreOrder(doc, order, linesByOrderId?.get(order.id));
      return { order, ...scored };
    })
    .filter((row) => row.score > 0)
    .sort(
      (a, b) => b.score - a.score || a.order.id.localeCompare(b.order.id),
    );

  const top = ranked[0];
  const second = ranked[1];
  let procurementId: string | null = null;
  let confidence: MatchConfidence = "none";
  const topIsConfident = Boolean(
    top && confidentMatch(top.reasons, top.orderLineCount),
  );
  const secondIsConfident = Boolean(
    second && confidentMatch(second.reasons, second.orderLineCount),
  );
  if (top && topIsConfident && !secondIsConfident) {
    procurementId = top.order.id;
    confidence = "high";
  } else if (top && top.score >= 12) {
    procurementId = top.order.id;
    confidence = "suggested";
  }

  return {
    procurementId,
    confidence,
    candidates: ranked.slice(0, 5),
  };
}

/** Pair incoming lines to existing lines. Each existing line is used at most once. */
export function matchIncomingLines(
  existing: ExistingProcLine[],
  incoming: IncomingProcLine[],
): (string | null)[] {
  const used = new Set<string>();
  const byId = new Map(existing.map((line) => [line.id, line]));
  const result: (string | null)[] = incoming.map(() => null);

  for (let i = 0; i < incoming.length; i += 1) {
    const wanted = incoming[i]?.matchedLineId;
    if (wanted && byId.has(wanted) && !used.has(wanted)) {
      used.add(wanted);
      result[i] = wanted;
    }
  }

  const unused = () => existing.filter((line) => !used.has(line.id));

  for (let i = 0; i < incoming.length; i += 1) {
    if (result[i]) continue;
    const part = normalizeRef(incoming[i]?.partNumber);
    if (!part) continue;
    const found = unused().find((line) => normalizeRef(line.partNumber) === part);
    if (found) {
      used.add(found.id);
      result[i] = found.id;
    }
  }

  for (let i = 0; i < incoming.length; i += 1) {
    if (result[i]) continue;
    const description = normalizeText(incoming[i]?.description);
    if (!description) continue;
    const found = unused().find(
      (line) => normalizeText(line.description) === description,
    );
    if (found) {
      used.add(found.id);
      result[i] = found.id;
    }
  }

  return result;
}

function targetStatus(documentType: ProcurementDocumentType): string | null {
  switch (documentType) {
    case "rfq":
      return "rfq_sent";
    case "quote":
      return "quoted";
    case "po":
    case "proforma_invoice":
    case "tax_invoice":
    case "delivery_docket":
      return "ordered";
    default:
      return null;
  }
}

/** Move an order forward for the imported document. Never reopens a cancelled order. */
export function advanceStatus(
  current: string,
  documentType: ProcurementDocumentType,
  formStatus: string | null | undefined,
): string {
  if (current === "cancelled") return "cancelled";
  if (formStatus === "cancelled") return "cancelled";
  let next = current;
  const target = targetStatus(documentType);
  if (target && (STATUS_RANK[target] ?? 0) > (STATUS_RANK[next] ?? 0)) {
    next = target;
  }
  if (
    formStatus &&
    formStatus !== "partially_received" &&
    formStatus !== "closed" &&
    (STATUS_RANK[formStatus] ?? -1) > (STATUS_RANK[next] ?? -1)
  ) {
    next = formStatus;
  }
  return next;
}

function blank(value: string | null | undefined): boolean {
  return value == null || value.trim() === "";
}

function pickText(
  current: string | null,
  incoming: string | null,
  overwrite: boolean,
): string | null {
  if (overwrite && !blank(incoming)) return incoming;
  if (blank(current)) return blank(incoming) ? null : incoming;
  return current;
}

function pickPrice(
  current: number | null,
  incoming: number | null,
  overwrite: boolean,
): number | null {
  if (overwrite && incoming != null) return incoming;
  if (current == null) return incoming;
  return current;
}

function deliveredUnits(
  documentType: ProcurementDocumentType,
  line: IncomingProcLine,
): number | null {
  if (documentType !== "delivery_docket") return null;
  return parseWholeQty(line.deliveredQty) ?? parseWholeQty(line.quantity) ?? 0;
}

function mergeLine(
  existing: ExistingProcLine,
  incoming: IncomingProcLine,
  documentType: ProcurementDocumentType,
  previousContribution: number,
): PlannedLineUpdate {
  const commercial =
    documentType === "quote" ||
    documentType === "po" ||
    documentType === "proforma_invoice" ||
    documentType === "tax_invoice";
  const invoice =
    documentType === "proforma_invoice" || documentType === "tax_invoice";
  const overwriteQty = documentType === "rfq" || documentType === "quote";
  const overwriteOrdered = documentType === "po" || invoice;
  const incomingOrdered = !blank(incoming.orderedQty)
    ? incoming.orderedQty
    : !blank(incoming.quantity)
      ? incoming.quantity
      : null;

  const delivered = deliveredUnits(documentType, incoming);
  const receivedQty =
    delivered == null
      ? existing.receivedQty
      : Math.max(0, existing.receivedQty - previousContribution + delivered);

  return {
    lineId: existing.id,
    partNumber: pickText(existing.partNumber, incoming.partNumber, commercial),
    description:
      documentType === "delivery_docket"
        ? existing.description
        : pickText(existing.description, incoming.description, true) ??
          existing.description,
    quantity: pickText(existing.quantity, incoming.quantity, overwriteQty) ?? existing.quantity,
    orderedQty: pickText(existing.orderedQty, incomingOrdered, overwriteOrdered),
    unit: pickText(existing.unit, incoming.unit, commercial),
    estUnitPrice: pickPrice(
      existing.estUnitPrice,
      incoming.estUnitPrice,
      commercial || documentType === "other",
    ),
    receivedQty,
    receiptContribution: delivered,
  };
}

export function planDocumentApply(opts: {
  documentType: ProcurementDocumentType;
  existingLines: ExistingProcLine[];
  incoming: IncomingProcLine[];
  previousReceiptByLineId?: Record<string, number>;
}): {
  updates: PlannedLineUpdate[];
  inserts: PlannedLineInsert[];
} {
  const previous = opts.previousReceiptByLineId ?? {};
  const byId = new Map(opts.existingLines.map((line) => [line.id, line]));
  const matchedIds = matchIncomingLines(opts.existingLines, opts.incoming);
  const mentioned = new Set<string>();
  const updates: PlannedLineUpdate[] = [];
  const inserts: PlannedLineInsert[] = [];

  for (let i = 0; i < opts.incoming.length; i += 1) {
    const incoming = opts.incoming[i]!;
    const lineId = matchedIds[i];
    const existing = lineId ? byId.get(lineId) : undefined;
    if (existing && lineId) {
      mentioned.add(lineId);
      updates.push(
        mergeLine(existing, incoming, opts.documentType, previous[lineId] ?? 0),
      );
      continue;
    }
    const delivered = deliveredUnits(opts.documentType, incoming);
    const ordered =
      opts.documentType === "po" ||
      opts.documentType === "proforma_invoice" ||
      opts.documentType === "tax_invoice"
        ? !blank(incoming.orderedQty)
          ? incoming.orderedQty
          : incoming.quantity
        : incoming.orderedQty;
    inserts.push({
      partNumber: incoming.partNumber,
      description: incoming.description,
      quantity: incoming.quantity || "1",
      orderedQty: ordered,
      unit: incoming.unit,
      estUnitPrice: incoming.estUnitPrice,
      projectId: incoming.projectId,
      receivedQty: delivered ?? 0,
      receiptContribution: delivered,
    });
  }

  if (opts.documentType === "delivery_docket") {
    for (const [lineId, prevQty] of Object.entries(previous)) {
      if (mentioned.has(lineId) || prevQty <= 0) continue;
      const existing = byId.get(lineId);
      if (!existing) continue;
      updates.push({
        lineId,
        partNumber: existing.partNumber,
        description: existing.description,
        quantity: existing.quantity,
        orderedQty: existing.orderedQty,
        unit: existing.unit,
        estUnitPrice: existing.estUnitPrice,
        receivedQty: Math.max(0, existing.receivedQty - prevQty),
        receiptContribution: null,
      });
    }
  }

  return { updates, inserts };
}

export function planHeaderUpdate(opts: {
  currentStatus: string;
  currentSupplierId: string | null;
  currentNeedBy: Date | null;
  currentPoNumber: string | null;
  currentQuoteNumber: string | null;
  currentInvoiceNumber: string | null;
  currentDocketNumbers: string | null;
  documentType: ProcurementDocumentType;
  formStatus: string | null;
  supplierId: string | null;
  needBy: Date | null;
  sapPoNumber: string | null;
  quoteNumber: string | null;
  invoiceNumber: string | null;
  deliveryDocketNumber: string | null;
}): {
  status: string;
  supplierId: string | null;
  needBy: Date | null;
  sapPoNumber: string | null;
  quoteNumber: string | null;
  invoiceNumber: string | null;
  deliveryDocketNumbers: string | null;
} {
  const invoiceDoc =
    opts.documentType === "proforma_invoice" ||
    opts.documentType === "tax_invoice";
  return {
    status: advanceStatus(opts.currentStatus, opts.documentType, opts.formStatus),
    supplierId: opts.currentSupplierId ?? opts.supplierId,
    needBy: opts.currentNeedBy ?? opts.needBy,
    sapPoNumber:
      opts.documentType === "po"
        ? pickText(opts.currentPoNumber, opts.sapPoNumber, true)
        : pickText(opts.currentPoNumber, opts.sapPoNumber, false),
    quoteNumber:
      opts.documentType === "quote"
        ? pickText(opts.currentQuoteNumber, opts.quoteNumber, true)
        : pickText(opts.currentQuoteNumber, opts.quoteNumber, false),
    invoiceNumber: invoiceDoc
      ? pickText(opts.currentInvoiceNumber, opts.invoiceNumber, true)
      : pickText(opts.currentInvoiceNumber, opts.invoiceNumber, false),
    deliveryDocketNumbers:
      opts.documentType === "delivery_docket"
        ? appendDocketNumber(opts.currentDocketNumbers, opts.deliveryDocketNumber)
        : opts.currentDocketNumbers,
  };
}

export function primaryDocumentReference(opts: {
  documentType: ProcurementDocumentType;
  sapPoNumber: string | null;
  quoteNumber: string | null;
  invoiceNumber: string | null;
  deliveryDocketNumber: string | null;
}): string | null {
  switch (opts.documentType) {
    case "po":
      return opts.sapPoNumber;
    case "quote":
      return opts.quoteNumber;
    case "proforma_invoice":
    case "tax_invoice":
      return opts.invoiceNumber;
    case "delivery_docket":
      return opts.deliveryDocketNumber;
    case "rfq":
      return opts.quoteNumber ?? opts.sapPoNumber;
    default:
      return (
        opts.sapPoNumber ??
        opts.invoiceNumber ??
        opts.quoteNumber ??
        opts.deliveryDocketNumber
      );
  }
}
