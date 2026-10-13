import assert from "node:assert/strict";
import { rowIsCompleted } from "./workspaceTableUtils";

assert.equal(rowIsCompleted("projects", { status: "closed" }), true);
assert.equal(rowIsCompleted("projects", { status: "active" }), false);
assert.equal(rowIsCompleted("milestones", { completed: true }), true);
assert.equal(rowIsCompleted("milestones", { completed: false }), false);
assert.equal(rowIsCompleted("tasks", { completed: true }), true);
assert.equal(rowIsCompleted("tasks", { completed: false, status: "done" }), false);
assert.equal(rowIsCompleted("todos", { status: "done" }), true);
assert.equal(rowIsCompleted("todos", { status: "cancelled" }), true);
assert.equal(rowIsCompleted("todos", { status: "backlog" }), false);
assert.equal(rowIsCompleted("procurement", { status: "closed" }), true);
assert.equal(rowIsCompleted("procurement", { status: "ordered" }), false);

console.log("workspaceTableUtils.test.ts: ok");
