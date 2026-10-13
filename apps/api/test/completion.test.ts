import assert from "node:assert/strict";
import { nextCompletedFlag } from "../src/lib/completion.ts";

assert.equal(
  nextCompletedFlag({ currentCompleted: false, currentPercent: 10, completed: true }),
  true,
);
assert.equal(
  nextCompletedFlag({ currentCompleted: true, currentPercent: 100, completed: false }),
  false,
);
assert.equal(
  nextCompletedFlag({ currentCompleted: false, currentPercent: 40, percentComplete: 100 }),
  true,
);
assert.equal(
  nextCompletedFlag({ currentCompleted: true, currentPercent: 100, percentComplete: 80 }),
  false,
);
assert.equal(
  nextCompletedFlag({ currentCompleted: true, currentPercent: 40, percentComplete: 50 }),
  true,
);
assert.equal(
  nextCompletedFlag({
    currentCompleted: false,
    currentPercent: 100,
    completed: false,
    percentComplete: 80,
  }),
  false,
);
assert.equal(
  nextCompletedFlag({ currentCompleted: true, currentPercent: 20 }),
  true,
);

console.log("completion.test.ts: ok");
