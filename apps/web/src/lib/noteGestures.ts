import type { EditorTool } from "./projectNoteTypes";

/**
 * One-finger pan is for navigating (Select / photos), never for ink.
 * While writing, move the page with two fingers (pinch-pan) so the stylus
 * and a resting palm cannot drag the canvas.
 */
export function oneFingerPanForTool(tool: EditorTool): boolean {
  return tool !== "pen" && tool !== "eraser";
}

/** Coarse contact ellipse in CSS px — fingertips are ~20–35px; palms are much larger. */
export function isLikelyPalmContact(width?: number, height?: number): boolean {
  const w = width ?? 0;
  const h = height ?? 0;
  if (w < 1 || h < 1) return false;
  return w >= 50 && h >= 40 && w * h >= 2800;
}

export function shouldStartOneFingerPan(opts: {
  enabled: boolean;
  pointerType: string;
  button: number;
  pinching: boolean;
  contactWidth?: number;
  contactHeight?: number;
}): boolean {
  if (!opts.enabled) return false;
  if (opts.button !== 0) return false;
  if (opts.pinching) return false;
  // Stylus must never pan — it inks (or does nothing in Select).
  if (opts.pointerType === "pen") return false;
  if (
    opts.pointerType === "touch" &&
    isLikelyPalmContact(opts.contactWidth, opts.contactHeight)
  ) {
    return false;
  }
  return true;
}

/** Skip palm / extra finger so it neither inks nor cancels the in-progress stroke. */
export function shouldIgnoreInkPointer(opts: {
  palmRejection: boolean;
  stylusSeen: boolean;
  pointerType: string;
  contactWidth?: number;
  contactHeight?: number;
}): boolean {
  if (opts.pointerType === "pen" || opts.pointerType === "mouse") return false;
  if (opts.palmRejection && opts.stylusSeen && opts.pointerType === "touch") {
    return true;
  }
  return (
    opts.pointerType === "touch" &&
    isLikelyPalmContact(opts.contactWidth, opts.contactHeight)
  );
}

type TouchLike = { radiusX: number; radiusY: number; touchType?: string };

/** Drops palm / stylus-as-touch contacts so a resting hand cannot pinch-zoom. */
export function isLikelyPalmTouch(t: TouchLike): boolean {
  if (t.touchType === "stylus") return false;
  return isLikelyPalmContact(t.radiusX * 2, t.radiusY * 2);
}

export function nonPalmTouches(touches: TouchList): Touch[] {
  const out: Touch[] = [];
  for (let i = 0; i < touches.length; i++) {
    const t = touches.item(i);
    if (!t) continue;
    const typed = t as Touch & { touchType?: string };
    if (isLikelyPalmTouch(typed)) continue;
    out.push(t);
  }
  return out;
}
