import assert from "node:assert/strict";
import {
  extractFieldChanges,
  formatAuditDate,
  normalizeAuditAction,
  toAuditEntryViewModel,
} from "./auditDisplay.js";

assert.equal(normalizeAuditAction("client.create"), "create");
assert.equal(normalizeAuditAction("update"), "update");
assert.equal(normalizeAuditAction("client.delete"), "delete");
assert.equal(normalizeAuditAction("user.update"), "update");

const legacy = extractFieldChanges(
  { name: { before: "A", after: "B" }, dailyDigestEmailEnabled: { before: true, after: false } },
  "update",
);
assert.equal(legacy.length, 2);
assert.deepEqual(legacy[0], { field: "name", before: "A", after: "B" });

const wrapped = extractFieldChanges(
  { fields: { title: { before: "Old", after: "New" } } },
  "update",
);
assert.equal(wrapped.length, 1);

const vm = toAuditEntryViewModel({
  id: "1",
  action: "task.create",
  createdAt: "2025-01-01T00:00:00.000Z",
  diff: { title: "Hello" },
});
assert.equal(vm.actionKind, "create");

assert.equal(formatAuditDate("not-a-date"), "Unknown time");
assert.ok(formatAuditDate("2025-06-01T12:00:00.000Z").includes("2025"));

console.log("auditDisplay.test.ts: ok");
