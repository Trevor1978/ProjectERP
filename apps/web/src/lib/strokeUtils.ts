import type { Stroke, StrokePoint } from "./projectNoteTypes";

/** Soften stylus pressure toward a usable ink range. */
export function effectivePressure(raw: number | undefined, pointerType: string): number {
  if (pointerType !== "pen") return 1;
  if (typeof raw !== "number" || Number.isNaN(raw) || raw <= 0) return 0.75;
  return Math.min(1, Math.max(0.15, raw));
}

/** Radial distance for Ramer–Douglas–Peucker. */
function perpDist(p: StrokePoint, a: StrokePoint, b: StrokePoint): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  if (len2 < 1e-6) return Math.hypot(p.x - a.x, p.y - a.y);
  const t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2;
  const px = a.x + t * dx;
  const py = a.y + t * dy;
  return Math.hypot(p.x - px, p.y - py);
}

/** Thin dense pointer samples before persist. */
export function thinStrokePoints(
  points: StrokePoint[],
  epsilon = 1.35,
): StrokePoint[] {
  if (points.length <= 3) return points;
  const keep = new Uint8Array(points.length);
  keep[0] = 1;
  keep[points.length - 1] = 1;

  const stack: Array<[number, number]> = [[0, points.length - 1]];
  while (stack.length) {
    const [start, end] = stack.pop()!;
    let maxD = 0;
    let maxI = start;
    const a = points[start]!;
    const b = points[end]!;
    for (let i = start + 1; i < end; i++) {
      const d = perpDist(points[i]!, a, b);
      if (d > maxD) {
        maxD = d;
        maxI = i;
      }
    }
    if (maxD > epsilon) {
      keep[maxI] = 1;
      stack.push([start, maxI], [maxI, end]);
    }
  }

  const out: StrokePoint[] = [];
  for (let i = 0; i < points.length; i++) {
    if (keep[i]) out.push(points[i]!);
  }
  return out.length >= 2 ? out : points;
}

export function strokeWidthAt(s: Stroke, index: number): number {
  const pt = s.points[index];
  const p = pt?.p ?? 1;
  return Math.max(0.4, s.width * (0.35 + 0.65 * p));
}

/** Draw one stroke, optionally with per-point pressure. */
export function paintStroke(
  ctx: CanvasRenderingContext2D,
  s: Stroke,
): void {
  if (s.points.length < 2) return;
  ctx.strokeStyle = s.color;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  const variable = s.points.some((pt) => typeof pt.p === "number" && pt.p !== 1);
  if (!variable) {
    ctx.lineWidth = s.width;
    ctx.beginPath();
    ctx.moveTo(s.points[0]!.x, s.points[0]!.y);
    for (let i = 1; i < s.points.length; i++) {
      ctx.lineTo(s.points[i]!.x, s.points[i]!.y);
    }
    ctx.stroke();
    return;
  }
  for (let i = 1; i < s.points.length; i++) {
    const a = s.points[i - 1]!;
    const b = s.points[i]!;
    ctx.lineWidth = (strokeWidthAt(s, i - 1) + strokeWidthAt(s, i)) / 2;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }
}

export function paintStrokes(
  ctx: CanvasRenderingContext2D,
  strokes: Stroke[],
  pageWidth: number,
  pageHeight: number,
): void {
  ctx.clearRect(0, 0, pageWidth, pageHeight);
  for (const s of strokes) paintStroke(ctx, s);
}

/** Bytes of UTF-8 JSON — used for page size warnings. */
export function pageContentByteLength(json: string): number {
  return new TextEncoder().encode(json).length;
}

export const PAGE_JSON_SOFT_LIMIT = 400_000; // ~400KB
export const PAGE_JSON_HARD_HINT = 900_000;
