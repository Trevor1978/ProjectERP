import {
  useCallback,
  useEffect,
  useRef,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { apiFetchUrl } from "../../lib/api";
import {
  newId,
  type EditorTool,
  type NoteBackground,
  type NoteObject,
  type PageContent,
  type ProjectNoteAsset,
  type Stroke,
  type StrokePoint,
} from "../../lib/projectNoteTypes";

export type PageContentUpdater =
  | PageContent
  | ((prev: PageContent) => PageContent);

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
  onChange: (next: PageContentUpdater) => void;
  background: NoteBackground;
  pageWidth: number;
  pageHeight: number;
  tool: EditorTool;
  penColor: string;
  penWidth: number;
  /** Current view scale — strokes are stored in page space so width is penWidth / scale. */
  viewScale?: number;
  assets: ProjectNoteAsset[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  /** Bumped by parent when a two-finger gesture starts — cancels in-progress ink. */
  cancelInkSignal?: number;
  readOnly?: boolean;
  className?: string;
};

function backgroundStyle(bg: NoteBackground): CSSProperties {
  // Use ~2px line weight so patterns stay visible when the page is CSS-scaled down.
  if (bg === "ruled") {
    return {
      backgroundColor: "#fff",
      backgroundImage:
        "repeating-linear-gradient(to bottom, transparent 0, transparent calc(8mm - 2px), #9aabc4 calc(8mm - 2px), #9aabc4 8mm)",
      backgroundSize: "100% 8mm",
      backgroundPosition: "0 12mm",
    };
  }
  if (bg === "grid") {
    return {
      backgroundColor: "#fff",
      backgroundImage:
        "linear-gradient(to right, #9aabc4 2px, transparent 2px), linear-gradient(to bottom, #9aabc4 2px, transparent 2px)",
      backgroundSize: "10mm 10mm",
    };
  }
  return { backgroundColor: "#fff" };
}

function drawStrokes(
  ctx: CanvasRenderingContext2D,
  strokes: Stroke[],
  pageWidth: number,
  pageHeight: number,
) {
  ctx.clearRect(0, 0, pageWidth, pageHeight);
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
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function A4PageCanvas({
  content,
  onChange,
  background,
  pageWidth,
  pageHeight,
  tool,
  penColor,
  penWidth,
  viewScale = 1,
  assets,
  selectedId,
  onSelect,
  cancelInkSignal = 0,
  readOnly,
  className,
}: Props) {
  const inkRef = useRef<HTMLCanvasElement>(null);
  const pageRef = useRef<HTMLDivElement>(null);
  const drawingRef = useRef<Stroke | null>(null);
  const inkPointerIdRef = useRef<number | null>(null);
  const dragRef = useRef<DragState>(null);
  /** Set when an object handles pointerdown so page click does not clear selection. */
  const suppressDeselectRef = useRef(false);
  const pagePenWidth = Math.max(0.5, penWidth / Math.max(0.05, viewScale));
  const eraseRadius = Math.max(14, pagePenWidth * 2.5);

  const assetUrl = useCallback(
    (assetId: string) => {
      const a = assets.find((x) => x.id === assetId);
      return a ? apiFetchUrl(a.url) : "";
    },
    [assets],
  );

  const redrawInk = useCallback(() => {
    const canvas = inkRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    drawStrokes(ctx, content.strokes, pageWidth, pageHeight);
  }, [content.strokes, pageWidth, pageHeight]);

  useEffect(() => {
    // Don't wipe live stroke being drawn.
    if (drawingRef.current) return;
    redrawInk();
  }, [redrawInk]);

  // Parent signals multi-touch gesture → drop any in-progress pen stroke.
  useEffect(() => {
    if (!cancelInkSignal) return;
    if (drawingRef.current || inkPointerIdRef.current !== null) {
      drawingRef.current = null;
      inkPointerIdRef.current = null;
      redrawInk();
    }
  }, [cancelInkSignal, redrawInk]);

  const toPagePoint = useCallback((clientX: number, clientY: number): StrokePoint | null => {
    const el = pageRef.current;
    if (!el) return null;
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) return null;
    const x = ((clientX - r.left) / r.width) * pageWidth;
    const y = ((clientY - r.top) / r.height) * pageHeight;
    return {
      x: Math.max(0, Math.min(pageWidth, x)),
      y: Math.max(0, Math.min(pageHeight, y)),
    };
  }, [pageWidth, pageHeight]);

  const eraseAt = (pt: StrokePoint) => {
    onChange((prev) => {
      const hit = prev.strokes.find((s) =>
        s.points.some((p) => dist(p, pt) < Math.max(eraseRadius, s.width * 2.5)),
      );
      if (!hit) return prev;
      return { ...prev, strokes: prev.strokes.filter((s) => s.id !== hit.id) };
    });
  };

  const cancelInk = () => {
    drawingRef.current = null;
    inkPointerIdRef.current = null;
    redrawInk();
  };

  const onInkPointerDown = (e: ReactPointerEvent) => {
    if (readOnly) return;
    if (tool !== "pen" && tool !== "eraser") return;
    // Second finger / extra pointer: cancel drawing so pinch can take over.
    if (inkPointerIdRef.current !== null && e.pointerId !== inkPointerIdRef.current) {
      cancelInk();
      return;
    }
    e.preventDefault();
    e.stopPropagation();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    inkPointerIdRef.current = e.pointerId;
    const pt = toPagePoint(e.clientX, e.clientY);
    if (!pt) return;
    if (tool === "eraser") {
      eraseAt(pt);
      return;
    }
    const stroke: Stroke = {
      id: newId(),
      color: penColor,
      width: pagePenWidth,
      points: [pt],
    };
    drawingRef.current = stroke;
    const ctx = inkRef.current?.getContext("2d");
    if (ctx) {
      ctx.strokeStyle = penColor;
      ctx.lineWidth = pagePenWidth;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.beginPath();
      ctx.moveTo(pt.x, pt.y);
    }
  };

  const onInkPointerMove = (e: ReactPointerEvent) => {
    if (readOnly) return;
    if (inkPointerIdRef.current !== null && e.pointerId !== inkPointerIdRef.current) {
      return;
    }
    if (tool === "eraser" && e.buttons === 1 && e.pointerId === inkPointerIdRef.current) {
      const pt = toPagePoint(e.clientX, e.clientY);
      if (pt) eraseAt(pt);
      return;
    }
    const stroke = drawingRef.current;
    if (!stroke) return;
    const pt = toPagePoint(e.clientX, e.clientY);
    if (!pt) return;
    const last = stroke.points[stroke.points.length - 1]!;
    if (dist(last, pt) < 1.2) return;
    stroke.points.push(pt);
    const ctx = inkRef.current?.getContext("2d");
    if (ctx) {
      ctx.lineTo(pt.x, pt.y);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(pt.x, pt.y);
    }
  };

  const onInkPointerUp = (e: ReactPointerEvent) => {
    if (inkPointerIdRef.current !== null && e.pointerId !== inkPointerIdRef.current) {
      return;
    }
    const stroke = drawingRef.current;
    drawingRef.current = null;
    inkPointerIdRef.current = null;
    if (!stroke || stroke.points.length < 2) {
      redrawInk();
      return;
    }
    onChange((prev) => ({
      ...prev,
      strokes: [...prev.strokes, stroke],
    }));
  };

  const onObjectPointerDown = (
    e: ReactPointerEvent,
    obj: NoteObject,
    kind: "move" | "resize",
  ) => {
    if (readOnly || tool !== "select") return;
    e.stopPropagation();
    e.preventDefault();
    suppressDeselectRef.current = true;
    onSelect(obj.id);
    const pt = toPagePoint(e.clientX, e.clientY);
    if (!pt) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    const next: DragState =
      kind === "move"
        ? {
            kind: "move",
            objectId: obj.id,
            startX: pt.x,
            startY: pt.y,
            origX: obj.x,
            origY: obj.y,
          }
        : {
            kind: "resize",
            objectId: obj.id,
            startX: pt.x,
            startY: pt.y,
            origW: obj.w,
            origH: obj.h,
          };
    dragRef.current = next;
  };

  const onPagePointerMove = (e: ReactPointerEvent) => {
    const d = dragRef.current;
    if (!d) return;
    const pt = toPagePoint(e.clientX, e.clientY);
    if (!pt) return;
    onChange((prev) => ({
      ...prev,
      objects: prev.objects.map((o) => {
        if (o.id !== d.objectId) return o;
        if (d.kind === "move") {
          const nx = Math.max(0, Math.min(pageWidth - o.w, d.origX + (pt.x - d.startX)));
          const ny = Math.max(0, Math.min(pageHeight - o.h, d.origY + (pt.y - d.startY)));
          return { ...o, x: nx, y: ny };
        }
        const nw = Math.max(40, Math.min(pageWidth - o.x, d.origW + (pt.x - d.startX)));
        const nh = Math.max(24, Math.min(pageHeight - o.y, d.origH + (pt.y - d.startY)));
        return { ...o, w: nw, h: nh };
      }),
    }));
  };

  const endDrag = () => {
    dragRef.current = null;
  };

  const onPagePointerDown = (e: ReactPointerEvent) => {
    if (readOnly || tool !== "select") return;
    // Only deselect when pressing the page chrome itself (not a child object).
    if (e.target === pageRef.current) {
      onSelect(null);
    }
  };

  const onPageClick = (e: React.MouseEvent) => {
    if (readOnly || tool !== "select") return;
    if (suppressDeselectRef.current) {
      suppressDeselectRef.current = false;
      return;
    }
    if (e.target === pageRef.current) {
      onSelect(null);
    }
  };

  const inkActive = !readOnly && (tool === "pen" || tool === "eraser");

  return (
    <div
      ref={pageRef}
      className={`a4-page relative shadow-md ${className ?? ""}`}
      style={{
        width: pageWidth,
        height: pageHeight,
        ...backgroundStyle(background),
      }}
      onPointerDown={onPagePointerDown}
      onPointerMove={onPagePointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onClick={onPageClick}
    >
      {content.objects.map((obj) => {
        const selected = selectedId === obj.id && tool === "select";
        if (obj.type === "image") {
          return (
            <div
              key={obj.id}
              data-note-object={obj.id}
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
              onClick={(e) => e.stopPropagation()}
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
            data-note-object={obj.id}
            className={`absolute touch-none ${selected ? "ring-2 ring-blue-500 bg-white/40" : ""}`}
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
            onClick={(e) => e.stopPropagation()}
          >
            {tool === "select" && selected ? (
              <textarea
                className="h-full w-full resize-none bg-transparent p-1 text-slate-900 outline-none"
                style={{ fontSize: obj.fontSize, color: obj.color ?? "#0f172a" }}
                value={obj.text}
                onChange={(e) => {
                  const text = e.target.value;
                  onChange((prev) => ({
                    ...prev,
                    objects: prev.objects.map((o) =>
                      o.id === obj.id && o.type === "text" ? { ...o, text } : o,
                    ),
                  }));
                }}
                onPointerDown={(e) => e.stopPropagation()}
                onFocus={(e) => {
                  if (obj.text === "Type here…") {
                    e.target.select();
                  }
                }}
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
        width={pageWidth}
        height={pageHeight}
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
