import {
  useCallback,
  useEffect,
  useRef,
  type ReactNode,
  type RefObject,
} from "react";

export type ViewPan = { x: number; y: number };

type GestureStart = {
  startDist: number;
  startScale: number;
  startPan: ViewPan;
  startMid: { x: number; y: number };
};

type Props = {
  pageWidth: number;
  pageHeight: number;
  scale: number;
  pan: ViewPan;
  zoomMin: number;
  zoomMax: number;
  /** When true, a single finger/pointer drag pans the canvas (e.g. Select tool). */
  oneFingerPan?: boolean;
  onTransform: (next: { scale: number; pan: ViewPan }) => void;
  onGestureStart?: () => void;
  viewportRef?: RefObject<HTMLDivElement | null>;
  children: ReactNode;
  className?: string;
};

function touchDist(a: Touch, b: Touch) {
  return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
}

function touchMid(a: Touch, b: Touch) {
  return {
    x: (a.clientX + b.clientX) / 2,
    y: (a.clientY + b.clientY) / 2,
  };
}

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

/** Zoom so the content point under `client` stays under `client` after scale change. */
export function zoomAroundPoint(args: {
  viewport: DOMRect;
  clientX: number;
  clientY: number;
  pan: ViewPan;
  scale: number;
  nextScale: number;
}): ViewPan {
  const { viewport, clientX, clientY, pan, scale, nextScale } = args;
  const lx = (clientX - viewport.left - pan.x) / scale;
  const ly = (clientY - viewport.top - pan.y) / scale;
  return {
    x: clientX - viewport.left - lx * nextScale,
    y: clientY - viewport.top - ly * nextScale,
  };
}

export function centerPan(
  viewportW: number,
  viewportH: number,
  pageWidth: number,
  pageHeight: number,
  scale: number,
): ViewPan {
  return {
    x: (viewportW - pageWidth * scale) / 2,
    y: (viewportH - pageHeight * scale) / 2,
  };
}

/**
 * Canvas-only viewport: pinch zoom + two-finger pan + optional one-finger pan +
 * ctrl/trackpad wheel zoom. Blocks browser page zoom/scroll while interacting here.
 */
export function NoteCanvasViewport({
  pageWidth,
  pageHeight,
  scale,
  pan,
  zoomMin,
  zoomMax,
  oneFingerPan = false,
  onTransform,
  onGestureStart,
  viewportRef: viewportRefProp,
  children,
  className,
}: Props) {
  const localRef = useRef<HTMLDivElement>(null);
  const viewportRef = viewportRefProp ?? localRef;
  const gestureRef = useRef<GestureStart | null>(null);
  const oneFingerRef = useRef<{
    pointerId: number;
    lastX: number;
    lastY: number;
  } | null>(null);
  const scaleRef = useRef(scale);
  const panRef = useRef(pan);
  const oneFingerPanRef = useRef(oneFingerPan);
  scaleRef.current = scale;
  panRef.current = pan;
  oneFingerPanRef.current = oneFingerPan;
  const onTransformRef = useRef(onTransform);
  onTransformRef.current = onTransform;
  const onGestureStartRef = useRef(onGestureStart);
  onGestureStartRef.current = onGestureStart;

  const applyPinch = useCallback(
    (touches: TouchList) => {
      if (touches.length < 2 || !gestureRef.current || !viewportRef.current) return;
      const a = touches.item(0);
      const b = touches.item(1);
      if (!a || !b) return;
      const g = gestureRef.current;
      const dist = touchDist(a, b);
      if (g.startDist < 1) return;
      const mid = touchMid(a, b);
      const nextScale = clamp(
        g.startScale * (dist / g.startDist),
        zoomMin,
        zoomMax,
      );
      const rect = viewportRef.current.getBoundingClientRect();
      const startLx = (g.startMid.x - rect.left - g.startPan.x) / g.startScale;
      const startLy = (g.startMid.y - rect.top - g.startPan.y) / g.startScale;
      const nextPan = {
        x: mid.x - rect.left - startLx * nextScale,
        y: mid.y - rect.top - startLy * nextScale,
      };
      onTransformRef.current({ scale: nextScale, pan: nextPan });
    },
    [zoomMin, zoomMax, viewportRef],
  );

  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;

    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length >= 2) {
        e.preventDefault();
        oneFingerRef.current = null;
        onGestureStartRef.current?.();
        const a = e.touches.item(0);
        const b = e.touches.item(1);
        if (!a || !b) return;
        gestureRef.current = {
          startDist: Math.max(1, touchDist(a, b)),
          startScale: scaleRef.current,
          startPan: { ...panRef.current },
          startMid: touchMid(a, b),
        };
      }
    };

    const onTouchMove = (e: TouchEvent) => {
      if (e.touches.length >= 2) {
        e.preventDefault();
        if (!gestureRef.current) {
          onGestureStartRef.current?.();
          const a = e.touches.item(0);
          const b = e.touches.item(1);
          if (a && b) {
            gestureRef.current = {
              startDist: Math.max(1, touchDist(a, b)),
              startScale: scaleRef.current,
              startPan: { ...panRef.current },
              startMid: touchMid(a, b),
            };
          }
        }
        applyPinch(e.touches);
      }
    };

    const onTouchEnd = (e: TouchEvent) => {
      if (e.touches.length < 2) {
        gestureRef.current = null;
      }
    };

    const onWheelNative = (e: WheelEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      e.preventDefault();
      e.stopPropagation();
      const rect = el.getBoundingClientRect();
      const factor = Math.exp(-e.deltaY * 0.01);
      const nextScale = clamp(scaleRef.current * factor, zoomMin, zoomMax);
      const nextPan = zoomAroundPoint({
        viewport: rect,
        clientX: e.clientX,
        clientY: e.clientY,
        pan: panRef.current,
        scale: scaleRef.current,
        nextScale,
      });
      onTransformRef.current({ scale: nextScale, pan: nextPan });
    };

    const targetIsObject = (t: EventTarget | null) =>
      t instanceof Element && !!t.closest("[data-note-object]");

    const onPointerDown = (e: PointerEvent) => {
      if (!oneFingerPanRef.current) return;
      if (e.button !== 0) return;
      if (gestureRef.current) return;
      if (targetIsObject(e.target)) return;
      oneFingerRef.current = {
        pointerId: e.pointerId,
        lastX: e.clientX,
        lastY: e.clientY,
      };
      try {
        el.setPointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
    };

    const onPointerMove = (e: PointerEvent) => {
      const panState = oneFingerRef.current;
      if (!panState || panState.pointerId !== e.pointerId) return;
      if (gestureRef.current) {
        oneFingerRef.current = null;
        return;
      }
      e.preventDefault();
      const dx = e.clientX - panState.lastX;
      const dy = e.clientY - panState.lastY;
      panState.lastX = e.clientX;
      panState.lastY = e.clientY;
      onTransformRef.current({
        scale: scaleRef.current,
        pan: {
          x: panRef.current.x + dx,
          y: panRef.current.y + dy,
        },
      });
    };

    const onPointerUp = (e: PointerEvent) => {
      if (oneFingerRef.current?.pointerId === e.pointerId) {
        oneFingerRef.current = null;
      }
    };

    el.addEventListener("touchstart", onTouchStart, { passive: false });
    el.addEventListener("touchmove", onTouchMove, { passive: false });
    el.addEventListener("touchend", onTouchEnd);
    el.addEventListener("touchcancel", onTouchEnd);
    el.addEventListener("wheel", onWheelNative, { passive: false });
    el.addEventListener("pointerdown", onPointerDown);
    el.addEventListener("pointermove", onPointerMove, { passive: false });
    el.addEventListener("pointerup", onPointerUp);
    el.addEventListener("pointercancel", onPointerUp);
    return () => {
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchmove", onTouchMove);
      el.removeEventListener("touchend", onTouchEnd);
      el.removeEventListener("touchcancel", onTouchEnd);
      el.removeEventListener("wheel", onWheelNative);
      el.removeEventListener("pointerdown", onPointerDown);
      el.removeEventListener("pointermove", onPointerMove);
      el.removeEventListener("pointerup", onPointerUp);
      el.removeEventListener("pointercancel", onPointerUp);
    };
  }, [applyPinch, viewportRef, zoomMin, zoomMax]);

  return (
    <div
      ref={(node) => {
        if (viewportRefProp) {
          (viewportRefProp as React.MutableRefObject<HTMLDivElement | null>).current =
            node;
        } else {
          (localRef as React.MutableRefObject<HTMLDivElement | null>).current = node;
        }
      }}
      className={
        "note-canvas-viewport relative min-h-0 flex-1 overflow-hidden bg-slate-100 " +
        (className ?? "")
      }
      style={{ touchAction: "none", overscrollBehavior: "none" }}
    >
      <div
        className="absolute left-0 top-0 will-change-transform"
        style={{
          width: pageWidth,
          height: pageHeight,
          transform: `translate(${pan.x}px, ${pan.y}px) scale(${scale})`,
          transformOrigin: "0 0",
        }}
      >
        {children}
      </div>
    </div>
  );
}
