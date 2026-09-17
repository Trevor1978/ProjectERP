import assert from "node:assert/strict";
import {
  isLikelyPalmContact,
  oneFingerPanForTool,
  shouldIgnoreInkPointer,
  shouldStartOneFingerPan,
} from "./noteGestures";

assert.equal(oneFingerPanForTool("pen"), false);
assert.equal(oneFingerPanForTool("eraser"), false);
assert.equal(oneFingerPanForTool("select"), true);
assert.equal(oneFingerPanForTool("text"), true);
assert.equal(oneFingerPanForTool("photo"), true);

assert.equal(
  shouldStartOneFingerPan({
    enabled: true,
    pointerType: "touch",
    button: 0,
    pinching: false,
  }),
  true,
);
assert.equal(
  shouldStartOneFingerPan({
    enabled: true,
    pointerType: "mouse",
    button: 0,
    pinching: false,
  }),
  true,
);
assert.equal(
  shouldStartOneFingerPan({
    enabled: true,
    pointerType: "pen",
    button: 0,
    pinching: false,
  }),
  false,
  "stylus must not pan the page",
);
assert.equal(
  shouldStartOneFingerPan({
    enabled: false,
    pointerType: "touch",
    button: 0,
    pinching: false,
  }),
  false,
);
assert.equal(
  shouldStartOneFingerPan({
    enabled: true,
    pointerType: "touch",
    button: 0,
    pinching: true,
  }),
  false,
);
assert.equal(
  shouldStartOneFingerPan({
    enabled: true,
    pointerType: "touch",
    button: 0,
    pinching: false,
    contactWidth: 80,
    contactHeight: 50,
  }),
  false,
  "large palm contact must not pan",
);

assert.equal(isLikelyPalmContact(0, 0), false);
assert.equal(isLikelyPalmContact(24, 24), false);
assert.equal(isLikelyPalmContact(80, 50), true);

assert.equal(
  shouldIgnoreInkPointer({
    palmRejection: true,
    stylusSeen: true,
    pointerType: "touch",
  }),
  true,
);
assert.equal(
  shouldIgnoreInkPointer({
    palmRejection: true,
    stylusSeen: true,
    pointerType: "pen",
  }),
  false,
);
assert.equal(
  shouldIgnoreInkPointer({
    palmRejection: true,
    stylusSeen: false,
    pointerType: "touch",
  }),
  false,
);
assert.equal(
  shouldIgnoreInkPointer({
    palmRejection: false,
    stylusSeen: true,
    pointerType: "touch",
    contactWidth: 90,
    contactHeight: 60,
  }),
  true,
  "oversized contact is ignored even if the toggle is off",
);

console.log("noteGestures.test.ts: ok");
