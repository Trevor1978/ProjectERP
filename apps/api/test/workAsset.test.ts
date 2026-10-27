import assert from "node:assert/strict";
import { effectiveTodoAssetId } from "../src/lib/workAsset.ts";
import { serviceTokenAllowsWorkRoute } from "../src/lib/serviceTokenScopes.ts";

assert.equal(effectiveTodoAssetId(null, "task-asset"), "task-asset");
assert.equal(effectiveTodoAssetId("todo-asset", "task-asset"), "todo-asset");
assert.equal(effectiveTodoAssetId(null, null), null);

const outstanding = serviceTokenAllowsWorkRoute(
  "GET",
  "/api/assets/abc/outstanding-work",
);
assert.equal(outstanding.allowed, true);
assert.equal(outstanding.requiredScope, "work:read");

const machines = serviceTokenAllowsWorkRoute("GET", "/api/machines");
assert.equal(machines.allowed, true);

const blockAssetAdmin = serviceTokenAllowsWorkRoute("POST", "/api/assets");
assert.equal(blockAssetAdmin.allowed, false);

console.log("workAsset.test.ts: ok");
