import assert from "node:assert/strict";
import { needsPlaceholderOption } from "./quickCreate/selectHelpers";
import { QUICK_CREATE_VALUE } from "./quickCreate/types";

// Empty value always needs a placeholder so the browser does not auto-select
// "+ Create new…" (which then cannot fire onChange again).
assert.equal(needsPlaceholderOption("", false), true);
assert.equal(needsPlaceholderOption("", true), true);
assert.equal(needsPlaceholderOption("", undefined), true);

// Real selection: only show empty option when allowEmpty.
assert.equal(needsPlaceholderOption("abc", false), false);
assert.equal(needsPlaceholderOption("abc", true), true);

/** Mirrors QuickCreateSelect option ordering for empty / create cases. */
function optionValues(args: {
  value: string;
  allowEmpty?: boolean;
  catalog: string[];
  canCreate: boolean;
}): string[] {
  const out: string[] = [];
  if (needsPlaceholderOption(args.value, args.allowEmpty)) out.push("");
  out.push(...args.catalog);
  if (args.canCreate) out.push(QUICK_CREATE_VALUE);
  return out;
}

const emptyNoCatalog = optionValues({
  value: "",
  allowEmpty: false,
  catalog: [],
  canCreate: true,
});
assert.deepEqual(emptyNoCatalog, ["", QUICK_CREATE_VALUE]);
assert.notEqual(emptyNoCatalog[0], QUICK_CREATE_VALUE);

const emptyWithCatalog = optionValues({
  value: "",
  allowEmpty: false,
  catalog: ["m1"],
  canCreate: true,
});
assert.deepEqual(emptyWithCatalog, ["", "m1", QUICK_CREATE_VALUE]);

console.log("quickCreateSelect.test.ts: ok");
