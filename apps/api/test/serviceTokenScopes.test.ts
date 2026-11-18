import assert from "node:assert/strict";
import {
  inferAccessLogEntity,
  scopesInclude,
  serviceTokenAllowsWorkRoute,
} from "../src/lib/serviceTokenScopes.ts";
import {
  hashServiceToken,
  verifyTokenHash,
} from "../src/lib/serviceToken.ts";

assert.equal(scopesInclude(["work:write"], "work:read"), true);
assert.equal(scopesInclude(["work:read"], "work:write"), false);

const readProjects = serviceTokenAllowsWorkRoute("GET", "/api/projects");
assert.equal(readProjects.allowed, true);
assert.equal(readProjects.requiredScope, "work:read");

const blockClients = serviceTokenAllowsWorkRoute("GET", "/api/clients");
assert.equal(blockClients.allowed, false);

const writeTodo = serviceTokenAllowsWorkRoute("PATCH", "/api/todos/abc-123");
assert.equal(writeTodo.allowed, true);
assert.equal(writeTodo.requiredScope, "work:write");

const blockOrg = serviceTokenAllowsWorkRoute("GET", "/api/org/users");
assert.equal(blockOrg.allowed, false);

const outstandingWork = serviceTokenAllowsWorkRoute(
  "GET",
  "/api/assets/machine-1/outstanding-work",
);
assert.equal(outstandingWork.allowed, true);
assert.equal(outstandingWork.requiredScope, "work:read");

const blockAssetCreate = serviceTokenAllowsWorkRoute("POST", "/api/assets");
assert.equal(blockAssetCreate.allowed, false);

const entity = inferAccessLogEntity("/api/tasks/task-uuid");
assert.equal(entity.entityType, "task");
assert.equal(entity.entityId, "task-uuid");

const raw = "pe_at_testtokenvalue";
const hash = hashServiceToken(raw);
assert.equal(verifyTokenHash(raw, hash), true);
assert.equal(verifyTokenHash("pe_at_wrong", hash), false);

console.log("serviceTokenScopes.test.ts: ok");
