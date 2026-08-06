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
} from "lucide-react";
import { api, apiForm } from "../lib/api";
import { A4PageCanvas } from "../components/projectNotes/A4PageCanvas";
import {
  A4_HEIGHT,
  A4_WIDTH,
  emptyPageContent,
  newId,
  parsePageContent,
  serializePageContent,
  type EditorTool,
  type NoteBackground,
  type PageContent,
  type ProjectNote,
  type ProjectNoteAsset,
} from "../lib/projectNoteTypes";

type SaveState = "idle" | "saving" | "saved" | "error";

export function ProjectNotePage() {
  const { projectId, noteId } = useParams<{ projectId: string; noteId: string }>();
  const nav = useNavigate();
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ["project-note", noteId],
    queryFn: () => api<{ note: ProjectNote }>(`/api/project-notes/${noteId}`),
    enabled: !!noteId,
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
  const [tool, setTool] = useState<EditorTool>("pen");
  const [penColor, setPenColor] = useState("#0f172a");
  const [penWidth, setPenWidth] = useState(2.5);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [content, setContent] = useState<PageContent>(emptyPageContent());
  const [pageVersion, setPageVersion] = useState(0);
  const [pageId, setPageId] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [err, setErr] = useState("");
  const [scale, setScale] = useState(1);
  const dirtyRef = useRef(false);
  const [dirty, setDirty] = useState(false);
  const contentRef = useRef(content);
  contentRef.current = content;

  useEffect(() => {
    if (!note) return;
    setTitle(note.title);
    setBackground(note.background);
    setNoteVersion(note.version);
  }, [note?.id, note?.version, note?.title, note?.background]);

  useEffect(() => {
    if (!pages.length) return;
    const idx = Math.min(pageIndex, pages.length - 1);
    if (idx !== pageIndex) {
      setPageIndex(idx);
      return;
    }
    const page = pages[idx];
    if (!page) return;
    if (page.id === pageId && dirtyRef.current) {
      setPageVersion(page.version);
      return;
    }
    setPageId(page.id);
    setPageVersion(page.version);
    setContent(parsePageContent(page.contentJson));
    dirtyRef.current = false;
    setDirty(false);
    setSelectedId(null);
  }, [pages, pageIndex, pageId]);

  useEffect(() => {
    const fit = () => {
      const margin = 48;
      const avail = Math.max(280, window.innerWidth - margin);
      setScale(Math.min(1, avail / A4_WIDTH));
    };
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, []);

  const savePage = useCallback(async () => {
    if (!pageId || !dirtyRef.current) return;
    setSaveState("saving");
    setErr("");
    try {
      const res = await api<{ page: { version: number; contentJson: string } }>(
        `/api/project-notes/pages/${pageId}`,
        {
          method: "PATCH",
          body: JSON.stringify({
            contentJson: serializePageContent(contentRef.current),
            version: pageVersion,
          }),
        },
      );
      setPageVersion(res.page.version);
      dirtyRef.current = false;
      setDirty(false);
      setSaveState("saved");
      await qc.invalidateQueries({ queryKey: ["project-note", noteId] });
    } catch (e) {
      setSaveState("error");
      setErr(e instanceof Error ? e.message : String(e));
    }
  }, [pageId, pageVersion, noteId, qc]);

  useEffect(() => {
    if (!dirtyRef.current) return;
    const t = window.setTimeout(() => void savePage(), 800);
    return () => window.clearTimeout(t);
  }, [content, savePage]);

  function updateContent(next: PageContent) {
    dirtyRef.current = true;
    setDirty(true);
    setSaveState("idle");
    setContent(next);
  }

  async function saveMeta(patch: { title?: string; background?: NoteBackground }) {
    if (!noteId) return;
    setErr("");
    try {
      const res = await api<{ note: ProjectNote }>(`/api/project-notes/${noteId}`, {
        method: "PATCH",
        body: JSON.stringify({ ...patch, version: noteVersion }),
      });
      setNoteVersion(res.note.version);
      setTitle(res.note.title);
      setBackground(res.note.background);
      await qc.invalidateQueries({ queryKey: ["project-note", noteId] });
      await qc.invalidateQueries({ queryKey: ["project-notes", projectId] });
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  }

  async function addPage() {
    if (!noteId) return;
    await savePage();
    setErr("");
    try {
      await api(`/api/project-notes/${noteId}/pages`, {
        method: "POST",
        body: JSON.stringify({ afterIndex: pageIndex }),
      });
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
    const obj = {
      id: newId(),
      type: "text" as const,
      x: 60,
      y: 80,
      w: 280,
      h: 80,
      text: "Type here…",
      fontSize: 16,
    };
    updateContent({ ...content, objects: [...content.objects, obj] });
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
      // Aim for ~half page width; preserve aspect roughly.
      const w = Math.min(360, A4_WIDTH - 80);
      const h = Math.min(280, A4_HEIGHT - 80);
      const obj = {
        id: newId(),
        type: "image" as const,
        x: 40,
        y: 40,
        w,
        h,
        assetId: asset.id,
      };
      updateContent({ ...content, objects: [...content.objects, obj] });
      setTool("select");
      setSelectedId(obj.id);
      await qc.invalidateQueries({ queryKey: ["project-note", noteId] });
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  }

  function deleteSelected() {
    if (!selectedId) return;
    updateContent({
      ...content,
      objects: content.objects.filter((o) => o.id !== selectedId),
    });
    setSelectedId(null);
  }

  function clearInk() {
    if (!confirm("Clear all pen strokes on this page?")) return;
    updateContent({ ...content, strokes: [] });
  }

  async function handlePrint() {
    await savePage();
    window.print();
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
                  (tool === id ? "bg-slate-800 text-white" : "text-slate-600 hover:bg-slate-100")
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
              <button
                type="button"
                className="underline"
                onClick={clearInk}
              >
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

          <div className="ml-auto flex items-center gap-1 text-xs">
            <span className="text-slate-500">Background:</span>
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
            onClick={() => {
              void savePage().then(() => setPageIndex(i));
            }}
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
            width: A4_WIDTH * scale,
            height: A4_HEIGHT * scale,
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
              tool={tool}
              penColor={penColor}
              penWidth={penWidth}
              assets={assets}
              selectedId={selectedId}
              onSelect={setSelectedId}
            />
          </div>
        </div>

        {/* Print: all pages at real size */}
        <div className="hidden print:block">
          {pages.map((p) => (
            <div key={p.id} className="a4-print-sheet break-after-page mb-0">
              <A4PageCanvas
                content={
                  p.id === pageId ? content : parsePageContent(p.contentJson)
                }
                onChange={() => {}}
                background={background}
                tool="select"
                penColor={penColor}
                penWidth={penWidth}
                assets={assets}
                selectedId={null}
                onSelect={() => {}}
                readOnly
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
