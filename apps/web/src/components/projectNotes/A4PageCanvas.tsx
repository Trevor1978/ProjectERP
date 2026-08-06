import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { apiFetchUrl } from "../../lib/api";
import {
  A4_HEIGHT,
  A4_WIDTH,
  newId,
  type EditorTool,
  type NoteBackground,
  type NoteObject,
  type PageContent,
  type ProjectNoteAsset,
  type Stroke,
  type StrokePoint,
} from "../../lib/projectNoteTypes";

type DragState =
  | {
      kind: "move";
      objectId: string;
      startX: number;
      startY: number;
      origX: number;
      origY: number;
    }
  | {
      kind: "resize";
      objectId: string;
      startX: number;
      startY: number;
      origW: number;
      origH: number;
    }
  | null;

type Props = {
  content: PageContent;
  onChange: (next: PageContent) => void;
  background: NoteBackground;
  tool: EditorTool;
  penColor: string;
  penWidth: number;
  assets: ProjectNoteAsset[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  /** When true, ignore pointer edits (e.g. while printing). */
  readOnly?: boolean;
  className?: string;
};

function backgroundStyle(bg: NoteBackground): CSSProperties {
  if (bg === "ruled") {
    return {
      backgroundColor: "#fff",
      backgroundImage:
        "repeating-linear-gradient(to bottom, transparent 0, transparent calc(8mm - 1px), #b8c4d6 calc(8mm - 1px), #b8c4d6 8mm)",
      backgroundSize: "100% 8mm",
      backgroundPosition: "0 12mm",
    };
  }
  if (bg === "grid") {
    return {
      backgroundColor: "#fff",
      backgroundImage:
        "linear-gradient(to right, #c5cedd 1px, transparent 1px), linear-gradient(to bottom, #c5cedd 1px, transparent 1px)",
      backgroundSize: "10mm 10mm",
    };
  }
  return { backgroundColor: "#fff" };
}

function drawStrokes(ctx: CanvasRenderingContext2D, strokes: Stroke[]) {
  ctx.clearRect(0, 0, A4_WIDTH, A4_HEIGHT);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  for (const s of strokes) {
    if (s.points.length < 2) continue;
    ctx.strokeStyle = s.color;
    ctx.lineWidth = s.width;
    ctx.beginPath();
    ctx.moveTo(s.points[0]!.x, s.points[0]!.y);
    for (let i = 1; i < s.points.length; i++) {
      ctx.lineTo(s.points[i]!.x, s.points[i]!.y);
    }
    ctx.stroke();
  }
}

function dist(a: StrokePoint, b: StrokePoint) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.hypot(dx, dy);
}

export function A4PageCanvas({
  content,
  onChange,
  background,
  tool,
  penColor,
  penWidth,
  assets,
  selectedId,
  onSelect,
  readOnly,
  className,
}: Props) {
  const inkRef = useRef<HTMLCanvasElement>(null);
  const pageRef = useRef<HTMLDivElement>(null);
  const drawingRef = useRef<Stroke | null>(null);
  const [drag, setDrag] = useState<DragState>(null);
  const assetUrl = useCallback((assetId: string) => {
    const a = assets.find((x) => x.id === assetId);
    return a ? apiFetchUrl(a.url) : "";
  }, [assets]);

  useEffect(() => {
    const canvas = inkRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    drawStrokes(ctx, content.strokes);
  }, [content.strokes]);

  const toPagePoint = useCallback((clientX: number, clientY: number): StrokePoint | null => {
    const el = pageRef.current;
    if (!el) return null;
    const r = el.getBoundingClientRect();
    const x = ((clientX - r.left) / r.width) * A4_WIDTH;
    const y = ((clientY - r.top) / r.height) * A4_HEIGHT;
    return {
      x: Math.max(0, Math.min(A4_WIDTH, x)),
      y: Math.max(0, Math.min(A4_HEIGHT, y)),
    };
  }, []);

  const onInkPointerDown = (e: ReactPointerEvent) => {
    if (readOnly) return;
    if (tool !== "pen" && tool !== "eraser") return;
    e.preventDefault();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    const pt = toPagePoint(e.clientX, e.clientY);
    if (!pt) return;
    if (tool === "eraser") {
      const hit = content.strokes.find((s) =>
        s.points.some((p) => dist(p, pt) < Math.max(12, s.width * 2)),
      );
      if (hit) {
        onChange({
          ...content,
          strokes: content.strokes.filter((s) => s.id !== hit.id),
        });
      }
      return;
    }
    const stroke: Stroke = {
      id: newId(),
      color: penColor,
      width: penWidth,
      points: [pt],
    };
    drawingRef.current = stroke;
    const canvas = inkRef.current;
    const ctx = canvas?.getContext("2d");
    if (ctx) {
      ctx.strokeStyle = penColor;
      ctx.lineWidth = penWidth;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.beginPath();
      ctx.moveTo(pt.x, pt.y);
    }
  };

  const onInkPointerMove = (e: ReactPointerEvent) => {
    if (readOnly) return;
    if (tool === "eraser" && e.buttons === 1) {
      const pt = toPagePoint(e.clientX, e.clientY);
      if (!pt) return;
      const hit = content.strokes.find((s) =>
        s.points.some((p) => dist(p, pt) < Math.max(12, s.width * 2)),
      );
      if (hit) {
        onChange({
          ...content,
          strokes: content.strokes.filter((s) => s.id !== hit.id),
        });
      }
      return;
    }
    const stroke = drawingRef.current;
    if (!stroke) return;
    const pt = toPagePoint(e.clientX, e.clientY);
    if (!pt) return;
    const last = stroke.points[stroke.points.length - 1]!;
    if (dist(last, pt) < 1.5) return;
    stroke.points.push(pt);
    const canvas = inkRef.current;
    const ctx = canvas?.getContext("2d");
    if (ctx) {
      ctx.lineTo(pt.x, pt.y);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(pt.x, pt.y);
    }
  };

  const onInkPointerUp = () => {
    const stroke = drawingRef.current;
    drawingRef.current = null;
    if (!stroke || stroke.points.length < 2) return;
    onChange({
      ...content,
      strokes: [...content.strokes, stroke],
    });
  };

  const onObjectPointerDown = (
    e: ReactPointerEvent,
    obj: NoteObject,
    kind: "move" | "resize",
  ) => {
    if (readOnly || tool !== "select") return;
    e.stopPropagation();
    e.preventDefault();
    onSelect(obj.id);
    const pt = toPagePoint(e.clientX, e.clientY);
    if (!pt) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    if (kind === "move") {
      setDrag({
        kind: "move",
        objectId: obj.id,
        startX: pt.x,
        startY: pt.y,
        origX: obj.x,
        origY: obj.y,
      });
    } else {
      setDrag({
        kind: "resize",
        objectId: obj.id,
        startX: pt.x,
        startY: pt.y,
        origW: obj.w,
        origH: obj.h,
      });
    }
  };

  const onPagePointerMove = (e: ReactPointerEvent) => {
    if (!drag) return;
    const pt = toPagePoint(e.clientX, e.clientY);
    if (!pt) return;
    onChange({
      ...content,
      objects: content.objects.map((o) => {
        if (o.id !== drag.objectId) return o;
        if (drag.kind === "move") {
          const nx = Math.max(0, Math.min(A4_WIDTH - o.w, drag.origX + (pt.x - drag.startX)));
          const ny = Math.max(0, Math.min(A4_HEIGHT - o.h, drag.origY + (pt.y - drag.startY)));
          return { ...o, x: nx, y: ny };
        }
        const nw = Math.max(40, Math.min(A4_WIDTH - o.x, drag.origW + (pt.x - drag.startX)));
        const nh = Math.max(24, Math.min(A4_HEIGHT - o.y, drag.origH + (pt.y - drag.startY)));
        return { ...o, w: nw, h: nh };
      }),
    });
  };

  const onPagePointerUp = () => setDrag(null);

  const onPageClick = () => {
    if (tool === "select") onSelect(null);
  };

  const inkActive = !readOnly && (tool === "pen" || tool === "eraser");

  return (
    <div
      ref={pageRef}
      className={`a4-page relative shadow-md ${className ?? ""}`}
      style={{
        width: A4_WIDTH,
        height: A4_HEIGHT,
        ...backgroundStyle(background),
      }}
      onPointerMove={onPagePointerMove}
      onPointerUp={onPagePointerUp}
      onPointerLeave={onPagePointerUp}
      onClick={onPageClick}
    >
      {content.objects.map((obj) => {
        const selected = selectedId === obj.id && tool === "select";
        if (obj.type === "image") {
          return (
            <div
              key={obj.id}
              className={`absolute touch-none ${selected ? "ring-2 ring-blue-500" : ""}`}
              style={{
                left: obj.x,
                top: obj.y,
                width: obj.w,
                height: obj.h,
                zIndex: 2,
                cursor: tool === "select" ? "move" : "default",
                pointerEvents: inkActive ? "none" : "auto",
              }}
              onPointerDown={(e) => onObjectPointerDown(e, obj, "move")}
            >
              <img
                src={assetUrl(obj.assetId)}
                alt=""
                className="h-full w-full object-contain pointer-events-none select-none"
                draggable={false}
              />
              {selected ? (
                <div
                  className="absolute bottom-0 right-0 h-4 w-4 cursor-se-resize bg-blue-500"
                  onPointerDown={(e) => onObjectPointerDown(e, obj, "resize")}
                />
              ) : null}
            </div>
          );
        }
        return (
          <div
            key={obj.id}
            className={`absolute touch-none ${selected ? "ring-2 ring-blue-500" : ""}`}
            style={{
              left: obj.x,
              top: obj.y,
              width: obj.w,
              minHeight: obj.h,
              zIndex: 2,
              cursor: tool === "select" ? "move" : "default",
              pointerEvents: inkActive ? "none" : "auto",
            }}
            onPointerDown={(e) => {
              if (tool === "select") onObjectPointerDown(e, obj, "move");
            }}
          >
            {tool === "select" && selected ? (
              <textarea
                className="h-full w-full resize-none bg-transparent p-1 text-slate-900 outline-none"
                style={{ fontSize: obj.fontSize, color: obj.color ?? "#0f172a" }}
                value={obj.text}
                onChange={(e) => {
                  onChange({
                    ...content,
                    objects: content.objects.map((o) =>
                      o.id === obj.id && o.type === "text"
                        ? { ...o, text: e.target.value }
                        : o,
                    ),
                  });
                }}
                onPointerDown={(e) => e.stopPropagation()}
              />
            ) : (
              <div
                className="whitespace-pre-wrap break-words p-1"
                style={{ fontSize: obj.fontSize, color: obj.color ?? "#0f172a" }}
              >
                {obj.text || (tool === "select" ? "Text" : "")}
              </div>
            )}
            {selected ? (
              <div
                className="absolute bottom-0 right-0 h-4 w-4 cursor-se-resize bg-blue-500"
                onPointerDown={(e) => onObjectPointerDown(e, obj, "resize")}
              />
            ) : null}
          </div>
        );
      })}

      <canvas
        ref={inkRef}
        width={A4_WIDTH}
        height={A4_HEIGHT}
        className="absolute inset-0"
        style={{
          zIndex: 3,
          touchAction: "none",
          pointerEvents: inkActive ? "auto" : "none",
          cursor: tool === "pen" ? "crosshair" : tool === "eraser" ? "cell" : "default",
        }}
        onPointerDown={onInkPointerDown}
        onPointerMove={onInkPointerMove}
        onPointerUp={onInkPointerUp}
        onPointerCancel={onInkPointerUp}
      />
    </div>
  );
}
