import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft,
  Ellipsis,
  Eraser,
  ImagePlus,
  MousePointer2,
  PenLine,
  Plus,
  Printer,
  Redo2,
  Trash2,
  Type,
  Undo2,
  ZoomIn,
  ZoomOut,
  X,
} from "lucide-react";
import { api, apiForm } from "../lib/api";
import {
  A4PageCanvas,
  type PageContentUpdater,
} from "../components/projectNotes/A4PageCanvas";
import {
  NoteCanvasViewport,
  centerPan,
  zoomAroundPoint,
  type ViewPan,
} from "../components/projectNotes/NoteCanvasViewport";
import { compressNoteImage } from "../lib/imageCompress";
import {
  emptyPageContent,
  newId,
  normalizeOrientation,
  pageSize,
  parsePageContent,
  serializePageContent,
  type EditorTool,
  type NoteBackground,
  type NoteOrientation,
  type PageContent,
  type ProjectNote,
  type ProjectNoteAsset,
} from "../lib/projectNoteTypes";
import {
  PAGE_JSON_SOFT_LIMIT,
  pageContentByteLength,
} from "../lib/strokeUtils";

type SaveState = "idle" | "saving" | "saved" | "error";

const ZOOM_MIN = 0.25;
const ZOOM_MAX = 2.5;
const ZOOM_STEP = 0.1;

export function ProjectNotePage() {
  const { projectId, noteId } = useParams<{ projectId: string; noteId: string }>();
  const nav = useNavigate();
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ["project-note", noteId],
    queryFn: () => api<{ note: ProjectNote }>(`/api/project-notes/${noteId}`),
    enabled: !!noteId,
    refetchOnWindowFocus: false,
  });

  const note = data?.note;
  const pages = useMemo(
    () => [...(note?.pages ?? [])].sort((a, b) => a.pageIndex - b.pageIndex),
    [note?.pages],
  );

  const [localAssets, setLocalAssets] = useState<ProjectNoteAsset[]>([]);
  useEffect(() => {
    setLocalAssets(note?.assets ?? []);
  }, [note?.assets]);
  const assets = localAssets;

  const [pageIndex, setPageIndex] = useState(0);
  const [title, setTitle] = useState("");
  const [background, setBackground] = useState<NoteBackground>("none");
  const [noteVersion, setNoteVersion] = useState(0);
  const noteVersionRef = useRef(0);
  const [tool, setTool] = useState<EditorTool>("pen");
  const [penColor, setPenColor] = useState("#0f172a");
  const [penWidth, setPenWidth] = useState(2.5);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [content, setContent] = useState<PageContent>(emptyPageContent());
  const [pageVersion, setPageVersion] = useState(0);
  const pageVersionRef = useRef(0);
  const [pageId, setPageId] = useState<string | null>(null);
  const [orientation, setOrientation] = useState<NoteOrientation>("portrait");
  const orientationRef = useRef<NoteOrientation>("portrait");
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [err, setErr] = useState("");
  const [fitScale, setFitScale] = useState(1);
  const [zoom, setZoom] = useState(1);
  const [zoomMode, setZoomMode] = useState<"fit" | "manual">("fit");
  const [pan, setPan] = useState<ViewPan>({ x: 0, y: 0 });
  const [cancelInkSignal, setCancelInkSignal] = useState(0);
  const [printing, setPrinting] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const [palmRejection, setPalmRejection] = useState(true);
  const [pressureEnabled, setPressureEnabled] = useState(true);
  const [sizeWarnBytes, setSizeWarnBytes] = useState(0);
  const [chromeCollapsed, setChromeCollapsed] = useState(false);
  const [inkActive, setInkActive] = useState(false);
  const undoStackRef = useRef<PageContent[]>([]);
  const redoStackRef = useRef<PageContent[]>([]);
  const inkActiveRef = useRef(false);
  const viewportSizeRef = useRef({ w: 0, h: 0 });
  const viewportElRef = useRef<HTMLDivElement | null>(null);
  const scaleRef = useRef(1);
  const panRef = useRef<ViewPan>({ x: 0, y: 0 });
  const zoomModeRef = useRef<"fit" | "manual">("fit");
  const dirtyRef = useRef(false);
  const [dirty, setDirty] = useState(false);
  const contentRef = useRef(content);
  contentRef.current = content;
  const savingRef = useRef(false);
  const loadedPageIdRef = useRef<string | null>(null);

  const { width: pageWidth, height: pageHeight } = pageSize(orientation);
  const scale =
    zoomMode === "fit"
      ? fitScale
      : Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, zoom));
  scaleRef.current = scale;
  panRef.current = pan;
  zoomModeRef.current = zoomMode;

  const refitToViewport = useCallback(() => {
    const el = viewportElRef.current;
    const vw = el?.clientWidth || Math.max(260, window.innerWidth - 32);
    const vh = el?.clientHeight || Math.max(320, window.innerHeight - 240);
    viewportSizeRef.current = { w: vw, h: vh };
    const next = Math.min(1, vw / pageWidth, vh / pageHeight);
    setFitScale(next);
    if (zoomModeRef.current === "fit") {
      setPan(centerPan(vw, vh, pageWidth, pageHeight, next));
    }
    return next;
  }, [pageWidth, pageHeight]);

  useEffect(() => {
    if (!note) return;
    setTitle(note.title);
    setBackground(note.background);
    setNoteVersion(note.version);
    noteVersionRef.current = note.version;
  }, [note?.id, note?.version, note?.title, note?.background]);

  useEffect(() => {
    if (!pages.length) return;
    const idx = Math.min(Math.max(0, pageIndex), pages.length - 1);
    if (idx !== pageIndex) {
      setPageIndex(idx);
      return;
    }
    const page = pages[idx];
    if (!page) return;

    // Already editing this page — do not stomp local unsaved (or just-saved) content.
    if (page.id === loadedPageIdRef.current) {
      if (!dirtyRef.current) {
        pageVersionRef.current = page.version;
        setPageVersion(page.version);
        const nextOrientation = normalizeOrientation(page.orientation);
        setOrientation(nextOrientation);
        orientationRef.current = nextOrientation;
      }
      return;
    }

    loadedPageIdRef.current = page.id;
    setPageId(page.id);
    pageVersionRef.current = page.version;
    setPageVersion(page.version);
    const nextOrientation = normalizeOrientation(page.orientation);
    setOrientation(nextOrientation);
    orientationRef.current = nextOrientation;
    const parsed = parsePageContent(page.contentJson);
    setContent(parsed);
    contentRef.current = parsed;
    undoStackRef.current = [];
    redoStackRef.current = [];
    setCanUndo(false);
    setCanRedo(false);
    dirtyRef.current = false;
    setDirty(false);
    setSelectedId(null);
  }, [pages, pageIndex]);

  useEffect(() => {
    const measure = () => {
      refitToViewport();
    };
    measure();
    window.addEventListener("resize", measure);
    const el = viewportElRef.current;
    const ro =
      typeof ResizeObserver !== "undefined" && el
        ? new ResizeObserver(() => measure())
        : null;
    if (el && ro) ro.observe(el);
    return () => {
      window.removeEventListener("resize", measure);
      ro?.disconnect();
    };
  }, [refitToViewport]);

  // Re-fit when paper size changes (orientation).
  useEffect(() => {
    setZoomMode("fit");
    zoomModeRef.current = "fit";
    // After orientation changes layout, wait a frame for viewport size.
    requestAnimationFrame(() => refitToViewport());
  }, [orientation, refitToViewport]);

  useEffect(() => {
    const before = () => setPrinting(true);
    const after = () => setPrinting(false);
    window.addEventListener("beforeprint", before);
    window.addEventListener("afterprint", after);
    return () => {
      window.removeEventListener("beforeprint", before);
      window.removeEventListener("afterprint", after);
    };
  }, []);

  useEffect(() => {
    const mq = window.matchMedia(
      "(orientation: landscape) and (max-height: 520px)",
    );
    const sync = () => setChromeCollapsed(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  const pushUndoSnapshot = useCallback((prev: PageContent) => {
    undoStackRef.current.push(structuredClone(prev));
    if (undoStackRef.current.length > 40) {
      undoStackRef.current.shift();
    }
    redoStackRef.current = [];
    setCanUndo(true);
    setCanRedo(false);
  }, []);

  const updateContent = useCallback(
    (next: PageContentUpdater) => {
      setContent((prev) => {
        const resolved = typeof next === "function" ? next(prev) : next;
        if (
          resolved.strokes.length !== prev.strokes.length ||
          resolved.objects.length !== prev.objects.length
        ) {
          pushUndoSnapshot(prev);
        }
        contentRef.current = resolved;
        const bytes = pageContentByteLength(serializePageContent(resolved));
        setSizeWarnBytes(bytes >= PAGE_JSON_SOFT_LIMIT ? bytes : 0);
        return resolved;
      });
      dirtyRef.current = true;
      setDirty(true);
      setSaveState("idle");
    },
    [pushUndoSnapshot],
  );

  const undo = useCallback(() => {
    const prev = undoStackRef.current.pop();
    if (!prev) {
      setCanUndo(false);
      return;
    }
    redoStackRef.current.push(structuredClone(contentRef.current));
    setContent(prev);
    contentRef.current = prev;
    dirtyRef.current = true;
    setDirty(true);
    setSaveState("idle");
    setSelectedId(null);
    setCanUndo(undoStackRef.current.length > 0);
    setCanRedo(true);
  }, []);

  const redo = useCallback(() => {
    const next = redoStackRef.current.pop();
    if (!next) {
      setCanRedo(false);
      return;
    }
    undoStackRef.current.push(structuredClone(contentRef.current));
    setContent(next);
    contentRef.current = next;
    dirtyRef.current = true;
    setDirty(true);
    setSaveState("idle");
    setSelectedId(null);
    setCanRedo(redoStackRef.current.length > 0);
    setCanUndo(true);
  }, []);

  const onInkActivityChange = useCallback((active: boolean) => {
    inkActiveRef.current = active;
    setInkActive(active);
  }, []);

  const savePage = useCallback(async (): Promise<boolean> => {
    if (!pageId || !dirtyRef.current || savingRef.current) return true;
    savingRef.current = true;
    setSaveState("saving");
    setErr("");
    const snapshot = serializePageContent(contentRef.current);
    const orientationSnapshot = orientationRef.current;
    const versionAtStart = pageVersionRef.current;
    try {
      const res = await api<{
        page: {
          version: number;
          contentJson: string;
          orientation: NoteOrientation;
        };
      }>(`/api/project-notes/pages/${pageId}`, {
        method: "PATCH",
        body: JSON.stringify({
          contentJson: snapshot,
          orientation: orientationSnapshot,
          version: versionAtStart,
        }),
      });
      pageVersionRef.current = res.page.version;
      setPageVersion(res.page.version);

      // Keep dirty if the user edited while the request was in flight.
      if (
        serializePageContent(contentRef.current) === snapshot &&
        orientationRef.current === orientationSnapshot
      ) {
        dirtyRef.current = false;
        setDirty(false);
        setSaveState("saved");
      } else {
        setSaveState("idle");
      }

      // Patch cache versions without replacing local editor state.
      qc.setQueryData<{ note: ProjectNote }>(["project-note", noteId], (old) => {
        if (!old?.note?.pages) return old;
        return {
          note: {
            ...old.note,
            pages: old.note.pages.map((p) =>
              p.id === pageId
                ? {
                    ...p,
                    contentJson: snapshot,
                    orientation: orientationSnapshot,
                    version: res.page.version,
                  }
                : p,
            ),
          },
        };
      });
      return true;
    } catch (e) {
      setSaveState("error");
      setErr(e instanceof Error ? e.message : String(e));
      return false;
    } finally {
      savingRef.current = false;
    }
  }, [pageId, noteId, qc]);

  useEffect(() => {
    if (!dirty) return;
    // Defer while pen is down so we don't PATCH mid-stroke.
    if (inkActive) return;
    const t = window.setTimeout(() => {
      void savePage().then((ok) => {
        if (ok && dirtyRef.current && !inkActiveRef.current) {
          void savePage();
        }
      });
    }, 1600);
    return () => window.clearTimeout(t);
  }, [content, dirty, orientation, savePage, inkActive]);

  useEffect(() => {
    const flush = () => {
      if (dirtyRef.current && !inkActiveRef.current) void savePage();
    };
    const onVis = () => {
      if (document.visibilityState === "hidden") flush();
    };
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", onVis);
    return () => {
      window.removeEventListener("pagehide", flush);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [savePage]);

  async function saveMeta(patch: { title?: string; background?: NoteBackground }) {
    if (!noteId) return;
    setErr("");
    try {
      const res = await api<{ note: ProjectNote }>(`/api/project-notes/${noteId}`, {
        method: "PATCH",
        body: JSON.stringify({ ...patch, version: noteVersionRef.current }),
      });
      noteVersionRef.current = res.note.version;
      setNoteVersion(res.note.version);
      setTitle(res.note.title);
      setBackground(res.note.background);
      await qc.invalidateQueries({ queryKey: ["project-notes", projectId] });
      qc.setQueryData<{ note: ProjectNote }>(["project-note", noteId], (old) =>
        old
          ? {
              note: {
                ...old.note,
                title: res.note.title,
                background: res.note.background,
                version: res.note.version,
              },
            }
          : old,
      );
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  }

  async function switchPage(i: number) {
    if (i === pageIndex) return;
    await savePage();
    loadedPageIdRef.current = null; // force load of target page
    setPageIndex(i);
  }

  async function addPage() {
    if (!noteId) return;
    await savePage();
    setErr("");
    try {
      await api(`/api/project-notes/${noteId}/pages`, {
        method: "POST",
        body: JSON.stringify({ afterIndex: pageIndex, orientation }),
      });
      loadedPageIdRef.current = null;
      await qc.invalidateQueries({ queryKey: ["project-note", noteId] });
      setPageIndex(pageIndex + 1);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  }

  async function deletePage() {
    if (!pageId || pages.length <= 1) return;
    if (!confirm("Delete this page?")) return;
    setErr("");
    try {
      await api(`/api/project-notes/pages/${pageId}`, { method: "DELETE" });
      loadedPageIdRef.current = null;
      await qc.invalidateQueries({ queryKey: ["project-note", noteId] });
      setPageIndex(Math.max(0, pageIndex - 1));
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  }

  async function deleteNote() {
    if (!noteId || !confirm("Delete this entire note?")) return;
    try {
      await api(`/api/project-notes/${noteId}`, { method: "DELETE" });
      await qc.invalidateQueries({ queryKey: ["project-notes", projectId] });
      nav(`/p/${projectId}?tab=workspace`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  }

  function addTextBox() {
    const offset = content.objects.filter((o) => o.type === "text").length;
    const obj = {
      id: newId(),
      type: "text" as const,
      x: 60 + (offset % 5) * 24,
      y: 80 + (offset % 8) * 28,
      w: Math.min(280, pageWidth - 80),
      h: 80,
      text: "Type here…",
      fontSize: 16,
    };
    updateContent((prev) => ({
      ...prev,
      objects: [...prev.objects, obj],
    }));
    setTool("select");
    setSelectedId(obj.id);
  }

  async function onPhotoSelected(file: File) {
    if (!noteId) return;
    setErr("");
    try {
      const compressed = await compressNoteImage(file);
      const form = new FormData();
      form.append("file", compressed);
      const res = await apiForm<{ asset: ProjectNoteAsset }>(
        `/api/project-notes/${noteId}/assets`,
        form,
      );
      const asset = res.asset;
      setLocalAssets((prev) =>
        prev.some((a) => a.id === asset.id) ? prev : [...prev, asset],
      );
      const w = Math.min(360, pageWidth - 80);
      const h = Math.min(280, pageHeight - 80);
      const obj = {
        id: newId(),
        type: "image" as const,
        x: 40,
        y: 40,
        w,
        h,
        assetId: asset.id,
      };
      updateContent((prev) => ({
        ...prev,
        objects: [...prev.objects, obj],
      }));
      setTool("select");
      setSelectedId(obj.id);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  }

  function setPageOrientation(next: NoteOrientation) {
    if (next === orientation) return;
    setOrientation(next);
    orientationRef.current = next;
    dirtyRef.current = true;
    setDirty(true);
    setSaveState("idle");
  }

  function zoomBy(delta: number) {
    const el = viewportElRef.current;
    const rect = el?.getBoundingClientRect();
    const base = zoomMode === "fit" ? fitScale : zoom;
    const nextScale = Math.min(
      ZOOM_MAX,
      Math.max(ZOOM_MIN, Math.round((base + delta) * 100) / 100),
    );
    setZoomMode("manual");
    setZoom(nextScale);
    if (rect) {
      setPan(
        zoomAroundPoint({
          viewport: rect,
          clientX: rect.left + rect.width / 2,
          clientY: rect.top + rect.height / 2,
          pan: panRef.current,
          scale: base,
          nextScale,
        }),
      );
    }
  }

  function zoomFit() {
    setZoomMode("fit");
    zoomModeRef.current = "fit";
    refitToViewport();
  }

  function onViewportTransform(next: { scale: number; pan: ViewPan }) {
    setZoomMode("manual");
    setZoom(next.scale);
    setPan(next.pan);
  }

  function onViewportGestureStart() {
    setCancelInkSignal((n) => n + 1);
  }

  function deleteSelected() {
    if (!selectedId) return;
    const id = selectedId;
    updateContent((prev) => ({
      ...prev,
      objects: prev.objects.filter((o) => o.id !== id),
    }));
    setSelectedId(null);
  }

  function clearInk() {
    if (!confirm("Clear all pen strokes on this page?")) return;
    updateContent((prev) => ({ ...prev, strokes: [] }));
  }

  async function handlePrint() {
    await savePage();
    setPrinting(true);
    // Allow print canvases to mount before invoking print.
    window.setTimeout(() => {
      window.print();
      window.setTimeout(() => setPrinting(false), 500);
    }, 50);
  }

  if (isLoading) {
    return <p className="p-6 text-slate-500">Loading note…</p>;
  }
  if (error || !note) {
    return (
      <div className="p-6">
        <p className="text-red-600">Failed to load note</p>
        <Link to={`/p/${projectId}?tab=workspace`} className="text-sm text-blue-700 underline">
          Back to project
        </Link>
      </div>
    );
  }

  const bgButtons: { id: NoteBackground; label: string }[] = [
    { id: "none", label: "Blank" },
    { id: "ruled", label: "Ruled" },
    { id: "grid", label: "10mm grid" },
  ];

  const oneFingerPan =
    tool === "select" || (zoomMode === "manual" && scale > fitScale * 1.02);

  const dockBtn = (
    active: boolean,
    extra = "",
  ) =>
    "note-tool-btn inline-flex flex-col items-center justify-center gap-0.5 rounded-lg px-2 text-[10px] font-medium " +
    (active ? "bg-slate-800 text-white " : "text-slate-600 hover:bg-slate-100 ") +
    extra;

  const zoomOrientBgControls = (
    <>
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="text-slate-500">Zoom</span>
        <button
          type="button"
          title="Zoom out"
          onClick={() => zoomBy(-ZOOM_STEP)}
          className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50"
        >
          <ZoomOut className="h-4 w-4" />
        </button>
        <button
          type="button"
          title="Fit to window"
          onClick={zoomFit}
          className={
            "min-h-11 min-w-[3.5rem] rounded-lg border px-2 tabular-nums " +
            (zoomMode === "fit"
              ? "border-slate-800 bg-slate-800 text-white"
              : "border-slate-200 text-slate-600 hover:bg-slate-50")
          }
        >
          {Math.round(scale * 100)}%
        </button>
        <button
          type="button"
          title="Zoom in"
          onClick={() => zoomBy(ZOOM_STEP)}
          className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50"
        >
          <ZoomIn className="h-4 w-4" />
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="text-slate-500">Page</span>
        {(
          [
            ["portrait", "Portrait"],
            ["landscape", "Landscape"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setPageOrientation(id)}
            className={
              "min-h-11 rounded-lg px-3 " +
              (orientation === id
                ? "bg-slate-800 text-white"
                : "border border-slate-200 text-slate-600 hover:bg-slate-50")
            }
          >
            {label}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="text-slate-500">Background</span>
        {bgButtons.map((b) => (
          <button
            key={b.id}
            type="button"
            onClick={() => {
              setBackground(b.id);
              void saveMeta({ background: b.id });
            }}
            className={
              "min-h-11 rounded-lg px-3 " +
              (background === b.id
                ? "bg-slate-800 text-white"
                : "border border-slate-200 text-slate-600 hover:bg-slate-50")
            }
          >
            {b.label}
          </button>
        ))}
      </div>
    </>
  );

  return (
    <div className="project-note-editor flex min-h-0 flex-1 flex-col bg-slate-100">
      {/* Compact focus-mode chrome */}
      <div
        className={
          "no-print shrink-0 border-b border-slate-200 bg-white px-2 shadow-sm " +
          (chromeCollapsed ? "py-0.5" : "py-1.5")
        }
      >
        <div className="flex items-center gap-2">
          <Link
            to={`/p/${projectId}?tab=workspace`}
            className="note-tool-btn inline-flex items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100"
            title="Back to project"
          >
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <input
            className="min-w-0 flex-1 rounded-lg border border-transparent bg-transparent px-2 py-2 text-sm font-medium focus:border-slate-200 focus:bg-white"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={() => {
              if (title.trim() && title !== note.title) {
                void saveMeta({ title: title.trim() });
              }
            }}
          />
          <span className="hidden shrink-0 text-xs text-slate-400 sm:inline">
            {saveState === "saving"
              ? "Saving…"
              : saveState === "saved"
                ? "Saved"
                : saveState === "error"
                  ? "Save failed"
                  : dirty
                    ? "Unsaved"
                    : ""}
          </span>
          <button
            type="button"
            onClick={() => void handlePrint()}
            className="note-tool-btn hidden items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100 sm:inline-flex"
            title="Print"
          >
            <Printer className="h-5 w-5" />
          </button>
          <button
            type="button"
            onClick={() => setMoreOpen(true)}
            className="note-tool-btn inline-flex items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100 md:hidden"
            title="More"
          >
            <Ellipsis className="h-5 w-5" />
          </button>
          <button
            type="button"
            onClick={() => void deleteNote()}
            className="note-tool-btn hidden items-center justify-center rounded-lg text-red-600 hover:bg-red-50 md:inline-flex"
            title="Delete note"
          >
            <Trash2 className="h-5 w-5" />
          </button>
        </div>

        {sizeWarnBytes > 0 ? (
          <p className="mt-1 text-xs text-amber-700">
            This page is large (~{Math.round(sizeWarnBytes / 1024)} KB). Zoomed
            detail and long handwriting may slow save — clear unused ink if it
            feels laggy.
          </p>
        ) : null}

        {/* Desktop secondary tools */}
        <div
          className={
            "mt-1 flex-wrap items-center gap-2 " +
            (chromeCollapsed ? "hidden" : "hidden md:flex")
          }
        >
          <div className="flex rounded-lg border border-slate-200 p-0.5">
            {(
              [
                ["pen", PenLine, "Pen"],
                ["eraser", Eraser, "Eraser"],
                ["select", MousePointer2, "Select"],
                ["text", Type, "Text"],
              ] as const
            ).map(([id, Icon, label]) => (
              <button
                key={id}
                type="button"
                title={label}
                onClick={() => {
                  if (id === "text") {
                    addTextBox();
                    return;
                  }
                  setTool(id);
                }}
                className={
                  "inline-flex min-h-10 items-center gap-1 rounded-md px-3 text-xs " +
                  (tool === id
                    ? "bg-slate-800 text-white"
                    : "text-slate-600 hover:bg-slate-100")
                }
              >
                <Icon className="h-4 w-4" />
                {label}
              </button>
            ))}
            <button
              type="button"
              title="Insert photo"
              onClick={() => fileRef.current?.click()}
              className="inline-flex min-h-10 items-center gap-1 rounded-md px-3 text-xs text-slate-600 hover:bg-slate-100"
            >
              <ImagePlus className="h-4 w-4" />
              Photo
            </button>
            <button
              type="button"
              title="Undo"
              disabled={!canUndo}
              onClick={undo}
              className="inline-flex min-h-10 items-center gap-1 rounded-md px-3 text-xs text-slate-600 hover:bg-slate-100 disabled:opacity-40"
            >
              <Undo2 className="h-4 w-4" />
              Undo
            </button>
            <button
              type="button"
              title="Redo"
              disabled={!canRedo}
              onClick={redo}
              className="inline-flex min-h-10 items-center gap-1 rounded-md px-3 text-xs text-slate-600 hover:bg-slate-100 disabled:opacity-40"
            >
              <Redo2 className="h-4 w-4" />
              Redo
            </button>
          </div>

          {tool === "pen" ? (
            <div className="flex items-center gap-2 text-xs text-slate-600">
              <label className="flex items-center gap-1">
                Color
                <input
                  type="color"
                  value={penColor}
                  onChange={(e) => setPenColor(e.target.value)}
                  className="h-9 w-10 cursor-pointer"
                />
              </label>
              <label className="flex items-center gap-1">
                Size
                <input
                  type="range"
                  min={1}
                  max={12}
                  step={0.5}
                  value={penWidth}
                  onChange={(e) => setPenWidth(Number(e.target.value))}
                />
              </label>
              <button type="button" className="underline" onClick={clearInk}>
                Clear ink
              </button>
            </div>
          ) : null}

          {tool === "select" && selectedId ? (
            <button
              type="button"
              className="text-xs text-red-700 underline"
              onClick={deleteSelected}
            >
              Delete selected
            </button>
          ) : null}

          <div className="ml-auto flex flex-wrap items-center gap-2">
            {zoomOrientBgControls}
          </div>
        </div>
        {err ? <p className="mt-1 text-sm text-red-600">{err}</p> : null}
      </div>

      <div
        className={
          "no-print shrink-0 items-center gap-1 overflow-x-auto border-b border-slate-200 bg-white px-2 py-1 " +
          (chromeCollapsed ? "hidden" : "flex")
        }
      >
        {pages.map((p, i) => (
          <button
            key={p.id}
            type="button"
            onClick={() => void switchPage(i)}
            className={
              "shrink-0 rounded-lg px-3 py-2 text-sm " +
              (i === pageIndex
                ? "bg-slate-800 text-white"
                : "border border-slate-200 hover:bg-slate-50")
            }
          >
            {i + 1}
          </button>
        ))}
        <button
          type="button"
          onClick={() => void addPage()}
          className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-dashed border-slate-300 px-2 py-2 text-sm text-slate-600 hover:bg-slate-50"
        >
          <Plus className="h-4 w-4" />
          Page
        </button>
        {pages.length > 1 ? (
          <button
            type="button"
            onClick={() => void deletePage()}
            className="shrink-0 px-2 text-xs text-red-700 underline"
          >
            Delete page
          </button>
        ) : null}
      </div>

      <div className="flex min-h-0 flex-1 flex-col print:overflow-visible">
        <div className="print:hidden flex min-h-0 flex-1 flex-col">
          <NoteCanvasViewport
            viewportRef={viewportElRef}
            pageWidth={pageWidth}
            pageHeight={pageHeight}
            scale={scale}
            pan={pan}
            zoomMin={ZOOM_MIN}
            zoomMax={ZOOM_MAX}
            oneFingerPan={oneFingerPan}
            onTransform={onViewportTransform}
            onGestureStart={onViewportGestureStart}
          >
            <A4PageCanvas
              content={content}
              onChange={updateContent}
              background={background}
              pageWidth={pageWidth}
              pageHeight={pageHeight}
              tool={tool}
              penColor={penColor}
              penWidth={penWidth}
              viewScale={scale}
              assets={assets}
              selectedId={selectedId}
              onSelect={setSelectedId}
              cancelInkSignal={cancelInkSignal}
              palmRejection={palmRejection}
              pressureEnabled={pressureEnabled}
              onInkActivityChange={onInkActivityChange}
            />
          </NoteCanvasViewport>
        </div>

        {printing ? (
          <div className="hidden print:block">
            {pages.map((p) => {
              const o = normalizeOrientation(p.orientation);
              const size = pageSize(o);
              return (
                <div
                  key={p.id}
                  className={`a4-print-sheet break-after-page mb-0 a4-print-${o}`}
                >
                  <A4PageCanvas
                    content={
                      p.id === pageId ? content : parsePageContent(p.contentJson)
                    }
                    onChange={() => {}}
                    background={background}
                    pageWidth={p.id === pageId ? pageWidth : size.width}
                    pageHeight={p.id === pageId ? pageHeight : size.height}
                    tool="select"
                    penColor={penColor}
                    penWidth={penWidth}
                    assets={assets}
                    selectedId={null}
                    onSelect={() => {}}
                    readOnly
                  />
                </div>
              );
            })}
          </div>
        ) : null}
      </div>

      {/* Mobile / tablet bottom tool dock */}
      <div
        className={
          "note-tool-dock no-print shrink-0 border-t border-slate-200 bg-white px-1 pt-1 shadow-[0_-4px_12px_rgba(15,23,42,0.06)] " +
          (chromeCollapsed ? "flex" : "flex md:hidden")
        }
      >
        <div className="flex items-stretch justify-around gap-0.5">
          <button
            type="button"
            className={dockBtn(tool === "pen")}
            onClick={() => setTool("pen")}
          >
            <PenLine className="h-5 w-5" />
            Pen
          </button>
          <button
            type="button"
            className={dockBtn(tool === "eraser")}
            onClick={() => setTool("eraser")}
          >
            <Eraser className="h-5 w-5" />
            Eraser
          </button>
          <button
            type="button"
            className={dockBtn(tool === "select")}
            onClick={() => setTool("select")}
          >
            <MousePointer2 className="h-5 w-5" />
            Select
          </button>
          <button
            type="button"
            className={dockBtn(false)}
            onClick={() => fileRef.current?.click()}
          >
            <ImagePlus className="h-5 w-5" />
            Photo
          </button>
          <button
            type="button"
            className={dockBtn(false, canUndo ? "" : "opacity-40")}
            disabled={!canUndo}
            onClick={undo}
          >
            <Undo2 className="h-5 w-5" />
            Undo
          </button>
          <button
            type="button"
            className={dockBtn(moreOpen)}
            onClick={() => setMoreOpen(true)}
          >
            <Ellipsis className="h-5 w-5" />
            More
          </button>
        </div>
        {tool === "pen" && !chromeCollapsed ? (
          <div className="flex items-center gap-3 px-2 pb-1 pt-1 text-xs text-slate-600">
            <label className="flex items-center gap-1">
              Color
              <input
                type="color"
                value={penColor}
                onChange={(e) => setPenColor(e.target.value)}
                className="h-9 w-10 cursor-pointer"
              />
            </label>
            <label className="flex flex-1 items-center gap-2">
              Size
              <input
                type="range"
                min={1}
                max={12}
                step={0.5}
                value={penWidth}
                onChange={(e) => setPenWidth(Number(e.target.value))}
                className="w-full"
              />
            </label>
          </div>
        ) : null}
      </div>

      <input
        ref={fileRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif"
        capture="environment"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (f) void onPhotoSelected(f);
        }}
      />

      {/* More sheet */}
      {moreOpen ? (
        <div className="no-print fixed inset-0 z-40 flex flex-col justify-end md:items-center md:justify-center">
          <button
            type="button"
            className="absolute inset-0 bg-black/40"
            aria-label="Close"
            onClick={() => setMoreOpen(false)}
          />
          <div className="relative z-10 max-h-[85dvh] overflow-y-auto rounded-t-2xl bg-white p-4 shadow-xl md:max-w-md md:rounded-2xl">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-base font-semibold text-slate-900">More</h2>
              <button
                type="button"
                className="note-tool-btn inline-flex items-center justify-center rounded-lg hover:bg-slate-100"
                onClick={() => setMoreOpen(false)}
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="flex flex-col gap-4">
              {zoomOrientBgControls}
              <div className="flex flex-col gap-2 rounded-xl border border-slate-200 p-3 text-sm">
                <label className="flex min-h-11 items-center justify-between gap-3">
                  <span>Palm rejection (stylus)</span>
                  <input
                    type="checkbox"
                    className="h-5 w-5"
                    checked={palmRejection}
                    onChange={(e) => setPalmRejection(e.target.checked)}
                  />
                </label>
                <label className="flex min-h-11 items-center justify-between gap-3">
                  <span>Pressure-sensitive width</span>
                  <input
                    type="checkbox"
                    className="h-5 w-5"
                    checked={pressureEnabled}
                    onChange={(e) => setPressureEnabled(e.target.checked)}
                  />
                </label>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={!canRedo}
                  onClick={() => {
                    redo();
                    setMoreOpen(false);
                  }}
                  className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-slate-200 px-3 text-sm disabled:opacity-40"
                >
                  <Redo2 className="h-4 w-4" />
                  Redo
                </button>
                <button
                  type="button"
                  onClick={() => {
                    addTextBox();
                    setMoreOpen(false);
                  }}
                  className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-slate-200 px-3 text-sm"
                >
                  <Type className="h-4 w-4" />
                  Add text
                </button>
                <button
                  type="button"
                  onClick={() => {
                    clearInk();
                    setMoreOpen(false);
                  }}
                  className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-slate-200 px-3 text-sm"
                >
                  Clear ink
                </button>
                {selectedId ? (
                  <button
                    type="button"
                    onClick={() => {
                      deleteSelected();
                      setMoreOpen(false);
                    }}
                    className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-red-200 px-3 text-sm text-red-700"
                  >
                    Delete selected
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={() => {
                    setMoreOpen(false);
                    void handlePrint();
                  }}
                  className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-slate-200 px-3 text-sm"
                >
                  <Printer className="h-4 w-4" />
                  Print
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMoreOpen(false);
                    void deleteNote();
                  }}
                  className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-red-200 px-3 text-sm text-red-700"
                >
                  <Trash2 className="h-4 w-4" />
                  Delete note
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
