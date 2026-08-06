import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft,
  Eraser,
  ImagePlus,
  MousePointer2,
  PenLine,
  Plus,
  Printer,
  Trash2,
  Type,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { api, apiForm } from "../lib/api";
import {
  A4PageCanvas,
  type PageContentUpdater,
} from "../components/projectNotes/A4PageCanvas";
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
  const [printing, setPrinting] = useState(false);
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
    dirtyRef.current = false;
    setDirty(false);
    setSelectedId(null);
  }, [pages, pageIndex]);

  useEffect(() => {
    const fit = () => {
      const chrome = 240;
      const availW = Math.max(260, window.innerWidth - 32);
      const availH = Math.max(320, window.innerHeight - chrome);
      const next = Math.min(1, availW / pageWidth, availH / pageHeight);
      setFitScale(next);
    };
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, [pageWidth, pageHeight]);

  // Re-fit when paper size changes (orientation).
  useEffect(() => {
    setZoomMode("fit");
  }, [orientation]);

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

  const updateContent = useCallback((next: PageContentUpdater) => {
    setContent((prev) => {
      const resolved = typeof next === "function" ? next(prev) : next;
      contentRef.current = resolved;
      return resolved;
    });
    dirtyRef.current = true;
    setDirty(true);
    setSaveState("idle");
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
    const t = window.setTimeout(() => {
      void savePage().then((ok) => {
        // If edits landed during save, schedule again.
        if (ok && dirtyRef.current) {
          void savePage();
        }
      });
    }, 700);
    return () => window.clearTimeout(t);
  }, [content, dirty, orientation, savePage]);

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
      const form = new FormData();
      form.append("file", file);
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
    setZoomMode("manual");
    setZoom((prev) => {
      const base = zoomMode === "fit" ? fitScale : prev;
      return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round((base + delta) * 100) / 100));
    });
  }

  function zoomFit() {
    setZoomMode("fit");
    setZoom(fitScale);
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

  return (
    <div className="project-note-editor flex min-h-0 flex-1 flex-col bg-slate-100">
      <div className="no-print sticky top-0 z-20 border-b border-slate-200 bg-white px-3 py-2 shadow-sm">
        <div className="flex flex-wrap items-center gap-2">
          <Link
            to={`/p/${projectId}?tab=workspace`}
            className="inline-flex items-center gap-1 text-sm text-slate-600 hover:text-slate-900"
          >
            <ArrowLeft className="h-4 w-4" />
            Project
          </Link>
          <input
            className="min-w-[160px] flex-1 rounded border border-slate-200 px-2 py-1 text-sm font-medium"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={() => {
              if (title.trim() && title !== note.title) {
                void saveMeta({ title: title.trim() });
              }
            }}
          />
          <span className="text-xs text-slate-400">
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
            className="inline-flex items-center gap-1 rounded border border-slate-200 px-2 py-1 text-sm hover:bg-slate-50"
          >
            <Printer className="h-4 w-4" />
            Print
          </button>
          <button
            type="button"
            onClick={() => void deleteNote()}
            className="inline-flex items-center gap-1 rounded border border-red-200 px-2 py-1 text-sm text-red-700 hover:bg-red-50"
          >
            <Trash2 className="h-4 w-4" />
            Delete
          </button>
        </div>

        <div className="mt-2 flex flex-wrap items-center gap-2">
          <div className="flex rounded border border-slate-200 p-0.5">
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
                  "inline-flex items-center gap-1 rounded px-2 py-1 text-xs " +
                  (tool === id
                    ? "bg-slate-800 text-white"
                    : "text-slate-600 hover:bg-slate-100")
                }
              >
                <Icon className="h-3.5 w-3.5" />
                {label}
              </button>
            ))}
            <button
              type="button"
              title="Insert photo"
              onClick={() => fileRef.current?.click()}
              className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs text-slate-600 hover:bg-slate-100"
            >
              <ImagePlus className="h-3.5 w-3.5" />
              Photo
            </button>
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
          </div>

          {tool === "pen" ? (
            <div className="flex items-center gap-2 text-xs text-slate-600">
              <label className="flex items-center gap-1">
                Color
                <input
                  type="color"
                  value={penColor}
                  onChange={(e) => setPenColor(e.target.value)}
                  className="h-7 w-8 cursor-pointer"
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

          <div className="ml-auto flex flex-wrap items-center gap-2 text-xs">
            <span className="text-slate-500">Zoom:</span>
            <button
              type="button"
              title="Zoom out"
              onClick={() => zoomBy(-ZOOM_STEP)}
              className="inline-flex items-center rounded border border-slate-200 px-1.5 py-1 text-slate-600 hover:bg-slate-50"
            >
              <ZoomOut className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              title="Fit to window"
              onClick={zoomFit}
              className={
                "min-w-[3.25rem] rounded border px-1.5 py-1 tabular-nums " +
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
              className="inline-flex items-center rounded border border-slate-200 px-1.5 py-1 text-slate-600 hover:bg-slate-50"
            >
              <ZoomIn className="h-3.5 w-3.5" />
            </button>

            <span className="ml-1 text-slate-500">Page:</span>
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
                  "rounded px-2 py-1 " +
                  (orientation === id
                    ? "bg-slate-800 text-white"
                    : "border border-slate-200 text-slate-600 hover:bg-slate-50")
                }
              >
                {label}
              </button>
            ))}

            <span className="ml-1 text-slate-500">Background:</span>
            {bgButtons.map((b) => (
              <button
                key={b.id}
                type="button"
                onClick={() => {
                  setBackground(b.id);
                  void saveMeta({ background: b.id });
                }}
                className={
                  "rounded px-2 py-1 " +
                  (background === b.id
                    ? "bg-slate-800 text-white"
                    : "border border-slate-200 text-slate-600 hover:bg-slate-50")
                }
              >
                {b.label}
              </button>
            ))}
          </div>
        </div>
        {err ? <p className="mt-1 text-sm text-red-600">{err}</p> : null}
      </div>

      <div className="no-print flex items-center justify-center gap-2 border-b border-slate-200 bg-white px-3 py-2">
        {pages.map((p, i) => (
          <button
            key={p.id}
            type="button"
            onClick={() => void switchPage(i)}
            className={
              "rounded px-3 py-1 text-sm " +
              (i === pageIndex
                ? "bg-slate-800 text-white"
                : "border border-slate-200 hover:bg-slate-50")
            }
          >
            Page {i + 1}
          </button>
        ))}
        <button
          type="button"
          onClick={() => void addPage()}
          className="inline-flex items-center gap-1 rounded border border-dashed border-slate-300 px-2 py-1 text-sm text-slate-600 hover:bg-slate-50"
        >
          <Plus className="h-4 w-4" />
          Page
        </button>
        {pages.length > 1 ? (
          <button
            type="button"
            onClick={() => void deletePage()}
            className="text-xs text-red-700 underline"
          >
            Delete page
          </button>
        ) : null}
      </div>

      <div className="flex flex-1 justify-center overflow-auto p-4 print:p-0 print:overflow-visible">
        <div
          className="print:hidden"
          style={{
            width: pageWidth * scale,
            height: pageHeight * scale,
          }}
        >
          <div
            style={{
              transform: `scale(${scale})`,
              transformOrigin: "top left",
            }}
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
              assets={assets}
              selectedId={selectedId}
              onSelect={setSelectedId}
            />
          </div>
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
                    pageWidth={
                      p.id === pageId ? pageWidth : size.width
                    }
                    pageHeight={
                      p.id === pageId ? pageHeight : size.height
                    }
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
    </div>
  );
}
