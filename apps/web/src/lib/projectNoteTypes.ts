/** Logical A4 sizes in CSS pixels (~96dpi). Portrait = 210×297mm. */
export const A4_SHORT = 794;
export const A4_LONG = 1123;

/** @deprecated Use pageSize(orientation) — defaults to portrait. */
export const A4_WIDTH = A4_SHORT;
/** @deprecated Use pageSize(orientation) — defaults to portrait. */
export const A4_HEIGHT = A4_LONG;

export type NoteBackground = "none" | "ruled" | "grid";
export type NoteOrientation = "portrait" | "landscape";

export type StrokePoint = { x: number; y: number };

export type Stroke = {
  id: string;
  color: string;
  width: number;
  points: StrokePoint[];
};

export type NoteObject =
  | {
      id: string;
      type: "text";
      x: number;
      y: number;
      w: number;
      h: number;
      text: string;
      fontSize: number;
      color?: string;
    }
  | {
      id: string;
      type: "image";
      x: number;
      y: number;
      w: number;
      h: number;
      assetId: string;
    };

export type PageContent = {
  objects: NoteObject[];
  strokes: Stroke[];
};

export type ProjectNoteAsset = {
  id: string;
  noteId: string;
  fileName: string;
  mimeType: string;
  createdAt: string;
  url: string;
};

export type ProjectNotePage = {
  id: string;
  noteId: string;
  pageIndex: number;
  orientation: NoteOrientation;
  contentJson: string;
  version: number;
  updatedAt: string;
};

export type ProjectNote = {
  id: string;
  projectId: string;
  title: string;
  background: NoteBackground;
  version: number;
  createdById: string | null;
  createdAt: string;
  updatedAt: string;
  pages?: ProjectNotePage[];
  assets?: ProjectNoteAsset[];
};

export type EditorTool = "pen" | "eraser" | "text" | "select" | "photo";

export function pageSize(orientation: NoteOrientation): {
  width: number;
  height: number;
} {
  return orientation === "landscape"
    ? { width: A4_LONG, height: A4_SHORT }
    : { width: A4_SHORT, height: A4_LONG };
}

export function emptyPageContent(): PageContent {
  return { objects: [], strokes: [] };
}

export function parsePageContent(json: string): PageContent {
  try {
    const raw = JSON.parse(json) as Partial<PageContent>;
    return {
      objects: Array.isArray(raw.objects) ? (raw.objects as NoteObject[]) : [],
      strokes: Array.isArray(raw.strokes) ? (raw.strokes as Stroke[]) : [],
    };
  } catch {
    return emptyPageContent();
  }
}

export function serializePageContent(content: PageContent): string {
  return JSON.stringify(content);
}

export function newId(): string {
  return crypto.randomUUID();
}

export function normalizeOrientation(
  value: string | null | undefined,
): NoteOrientation {
  return value === "landscape" ? "landscape" : "portrait";
}
