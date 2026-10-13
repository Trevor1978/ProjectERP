import assert from "node:assert/strict";
import {
  advanceStatus,
  appendDocketNumber,
  matchOrders,
  normalizeRef,
  planDocumentApply,
  planHeaderUpdate,
  type ExistingProcLine,
  type OrderSnapshot,
} from "../src/lib/procurementDocumentMatch.ts";

const order = (patch: Partial<OrderSnapshot> = {}): OrderSnapshot => ({
  id: "order-1",
  title: "Acme bearings",
  supplierId: "sup-1",
  status: "ordered",
  sapPoNumber: "PO-100",
  quoteNumber: null,
  invoiceNumber: null,
  deliveryDocketNumbers: null,
  ...patch,
});

const line = (patch: Partial<ExistingProcLine> = {}): ExistingProcLine => ({
  id: "line-1",
  partNumber: "ABC",
  description: "Bearing",
  quantity: "5",
  orderedQty: "5",
  unit: "ea",
  estUnitPrice: 10,
  receivedQty: 0,
  projectId: "proj-1",
  ...patch,
});

assert.equal(normalizeRef("PO-100"), normalizeRef("po 100"));
assert.equal(normalizeRef("P.O. 100"), "100");

const poOnly = matchOrders(
  {
    documentType: "po",
    supplierId: "sup-1",
    sapPoNumber: "PO-100",
    quoteNumber: null,
    invoiceNumber: null,
    deliveryDocketNumber: null,
    lines: [{ partNumber: "ABC", description: "Bearing" }],
  },
  [order()],
);
assert.equal(poOnly.confidence, "suggested");
assert.equal(poOnly.procurementId, "order-1");
assert.equal(poOnly.candidates[0]?.reasons.includes("short PO number"), true);

const bearingLines = new Map([
  ["order-1", [{ partNumber: "ABC", description: "Bearing" }]],
]);

const poAndLines = matchOrders(
  {
    documentType: "proforma_invoice",
    supplierId: "sup-1",
    sapPoNumber: "100",
    quoteNumber: null,
    invoiceNumber: "PI-55",
    deliveryDocketNumber: null,
    lines: [{ partNumber: "ABC", description: "Bearing" }],
  },
  [order()],
  bearingLines,
);
assert.equal(poAndLines.confidence, "high");
assert.equal(poAndLines.candidates[0]?.reasons.includes("part numbers"), true);
assert.equal(poAndLines.candidates[0]?.reasons.includes("supplier"), true);

const longPoDifferentSupplier = matchOrders(
  {
    documentType: "tax_invoice",
    supplierId: "sup-2",
    sapPoNumber: "PO-450219",
    quoteNumber: null,
    invoiceNumber: null,
    deliveryDocketNumber: null,
    lines: [{ partNumber: "ABC", description: "Bearing" }],
  },
  [order({ sapPoNumber: "450219" })],
  bearingLines,
);
assert.equal(longPoDifferentSupplier.confidence, "suggested");
assert.equal(
  longPoDifferentSupplier.candidates[0]?.reasons.includes("different supplier"),
  true,
);

const docketMatch = matchOrders(
  {
    documentType: "delivery_docket",
    supplierId: null,
    sapPoNumber: "PO-450219",
    quoteNumber: null,
    invoiceNumber: null,
    deliveryDocketNumber: "DN-9",
    lines: [{ partNumber: "ABC-1", description: "SKF deep groove bearing" }],
  },
  [order({ sapPoNumber: "450219" })],
  new Map([
    ["order-1", [{ partNumber: "ABC1", description: "SKF bearing deep groove" }]],
  ]),
);
assert.equal(docketMatch.procurementId, "order-1");
assert.equal(docketMatch.confidence, "high");

const noMatch = matchOrders(
  {
    documentType: "po",
    supplierId: "sup-1",
    sapPoNumber: "PO-999",
    quoteNumber: null,
    invoiceNumber: null,
    deliveryDocketNumber: null,
    lines: [{ partNumber: "ABC", description: "Bearing" }],
  },
  [order()],
);
assert.equal(noMatch.confidence, "none");
assert.equal(noMatch.procurementId, null);

const partMatch = matchOrders(
  {
    documentType: "quote",
    supplierId: "sup-1",
    sapPoNumber: null,
    quoteNumber: "Q-1",
    invoiceNumber: null,
    deliveryDocketNumber: null,
    lines: [
      { partNumber: "ABC", description: "Bearing" },
      { partNumber: "ZZZ", description: "Other" },
    ],
  },
  [order({ sapPoNumber: null, status: "rfq_sent" })],
  new Map([["order-1", [{ partNumber: "ABC", description: "Bearing" }]]]),
);
assert.equal(partMatch.confidence, "suggested");

const piPlan = planDocumentApply({
  documentType: "proforma_invoice",
  existingLines: [line({ orderedQty: null, estUnitPrice: 10 })],
  incoming: [
    {
      partNumber: "ABC",
      description: "Bearing updated",
      quantity: "5",
      orderedQty: null,
      unit: "ea",
      estUnitPrice: 12.5,
      deliveredQty: null,
      projectId: "proj-1",
    },
  ],
});
assert.equal(piPlan.updates.length, 1);
assert.equal(piPlan.inserts.length, 0);
assert.equal(piPlan.updates[0]?.estUnitPrice, 12.5);
assert.equal(piPlan.updates[0]?.orderedQty, "5");
assert.equal(piPlan.updates[0]?.quantity, "5");
assert.equal(piPlan.updates[0]?.receivedQty, 0);
assert.equal(piPlan.updates[0]?.description, "Bearing updated");

const firstDelivery = planDocumentApply({
  documentType: "delivery_docket",
  existingLines: [line(), line({ id: "line-2", partNumber: "DEF", description: "Bolt" })],
  incoming: [
    {
      partNumber: "ABC",
      description: "Bearing",
      quantity: "2",
      orderedQty: null,
      unit: null,
      estUnitPrice: null,
      deliveredQty: 2,
      projectId: "proj-1",
    },
  ],
});
assert.equal(firstDelivery.updates[0]?.receivedQty, 2);
assert.equal(firstDelivery.updates[0]?.estUnitPrice, 10);

const replaced = planDocumentApply({
  documentType: "delivery_docket",
  existingLines: [
    line({ receivedQty: 2 }),
    line({ id: "line-2", partNumber: "DEF", description: "Bolt", receivedQty: 3 }),
  ],
  incoming: [
    {
      partNumber: "ABC",
      description: "Bearing",
      quantity: "4",
      orderedQty: null,
      unit: null,
      estUnitPrice: null,
      deliveredQty: 4,
      projectId: "proj-1",
    },
  ],
  previousReceiptByLineId: { "line-1": 2, "line-2": 3 },
});
const bearing = replaced.updates.find((row) => row.lineId === "line-1");
const bolt = replaced.updates.find((row) => row.lineId === "line-2");
assert.equal(bearing?.receivedQty, 4);
assert.equal(bolt?.receivedQty, 0);

const header = planHeaderUpdate({
  currentStatus: "ordered",
  currentSupplierId: "sup-1",
  currentNeedBy: null,
  currentPoNumber: "PO-100",
  currentQuoteNumber: null,
  currentInvoiceNumber: null,
  currentDocketNumbers: null,
  documentType: "proforma_invoice",
  formStatus: "ordered",
  supplierId: "sup-2",
  needBy: new Date("2026-05-01"),
  sapPoNumber: "100",
  quoteNumber: null,
  invoiceNumber: "PI-55",
  deliveryDocketNumber: null,
});
assert.equal(header.invoiceNumber, "PI-55");
assert.equal(header.sapPoNumber, "PO-100");
assert.equal(header.supplierId, "sup-1");
assert.equal(header.status, "ordered");
assert.ok(header.needBy);

assert.equal(advanceStatus("quoted", "po", "ordered"), "ordered");
assert.equal(advanceStatus("closed", "quote", "quoted"), "closed");
assert.equal(advanceStatus("cancelled", "po", "ordered"), "cancelled");
assert.equal(advanceStatus("draft", "delivery_docket", "closed"), "ordered");

assert.equal(appendDocketNumber("DN1", "DN1"), "DN1");
assert.equal(appendDocketNumber("DN1", "dn-2"), "DN1, dn-2");

const added = planDocumentApply({
  documentType: "po",
  existingLines: [line()],
  incoming: [
    {
      partNumber: "NEW",
      description: "Extra",
      quantity: "1",
      orderedQty: "1",
      unit: "ea",
      estUnitPrice: 3,
      deliveredQty: null,
      projectId: "proj-1",
    },
  ],
});
assert.equal(added.inserts.length, 1);
assert.equal(added.inserts[0]?.orderedQty, "1");
assert.equal(added.updates.length, 0);

console.log("procurementDocumentMatch tests passed");
