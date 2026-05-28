import assert from "node:assert/strict";
import { columnFilterOptions, filterColumnSuggestions } from "./columnFilterSuggestions";

const rows = [
  { sort: ["Alpha", "done", "P1"] },
  { sort: ["Beta", "backlog", "P2"] },
  { sort: ["Alpha", "in_progress", "P1"] },
];

assert.deepEqual(columnFilterOptions(rows, 0), ["Alpha", "Beta"]);
assert.deepEqual(
  filterColumnSuggestions(["Alpha", "Beta", "Gamma"], "a"),
  ["Alpha", "Beta", "Gamma"],
);
assert.deepEqual(filterColumnSuggestions(["Alpha", "Beta"], "al"), ["Alpha"]);
assert.deepEqual(filterColumnSuggestions(["done", "backlog"], "done"), ["done"]);

console.log("columnFilterSuggestions.test.ts: ok");
