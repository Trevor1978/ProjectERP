import { Hono } from "hono";
import { asc, eq } from "drizzle-orm";
import {
  db,
  projectNote,
  projectNotePage,
  projectNoteAsset,
} from "@project-erp/db";
import {
  projectNoteCreate,
  projectNotePatch,
  projectNotePagePatch,
  projectNotePageCreate,
} from "@project-erp/validators";
import { requireAuth, type AuthUser } from "../lib/session.js";
import { requireProject } from "../lib/projectAccess.js";
import { writeAudit } from "../lib/audit.js";
import {
  deleteProjectNoteImageFile,
  isAllowedNoteImageMime,
  MAX_NOTE_IMAGE_BYTES,
  readProjectNoteImage,
  saveProjectNoteImage,
} from "../lib/projectNoteUploads.js";

const EMPTY_PAGE = '{"objects":[],"strokes":[]}';

const app = new Hono();
app.use("/*", requireAuth);

async function loadNoteForAuth(auth: AuthUser, noteId: string) {
  const [row] = await db
    .select()
    .from(projectNote)
    .where(eq(projectNote.id, noteId));
  if (!row) return { error: "Not found" as const, status: 404 as const };
  const pr = await requireProject(auth, row.projectId);
  if ("error" in pr) return pr;
  return { note: row, project: pr };
}

function assetDto(a: typeof projectNoteAsset.$inferSelect) {
  return {
    id: a.id,
    noteId: a.noteId,
    fileName: a.fileName,
    mimeType: a.mimeType,
    createdAt: a.createdAt,
    url: `/api/project-notes/assets/${a.id}/file`,
  };
}

function pageDto(p: typeof projectNotePage.$inferSelect) {
  return {
    id: p.id,
    noteId: p.noteId,
    pageIndex: p.pageIndex,
    contentJson: p.contentJson,
    version: p.version,
    updatedAt: p.updatedAt,
  };
}

function noteDto(
  n: typeof projectNote.$inferSelect,
  pages?: ReturnType<typeof pageDto>[],
  assets?: ReturnType<typeof assetDto>[],
) {
  return {
    id: n.id,
    projectId: n.projectId,
    title: n.title,
    background: n.background as "none" | "ruled" | "grid",
    version: n.version,
    createdById: n.createdById,
    createdAt: n.createdAt,
    updatedAt: n.updatedAt,
    ...(pages ? { pages } : {}),
    ...(assets ? { assets } : {}),
  };
}

app.get("/projects/:projectId/notes", async (c) => {
  const a = c.get("auth") as AuthUser;
  const projectId = c.req.param("projectId");
  const pr = await requireProject(a, projectId);
  if ("error" in pr) return c.json({ error: pr.error }, pr.status);

  const notes = await db
    .select()
    .from(projectNote)
    .where(eq(projectNote.projectId, projectId))
    .orderBy(asc(projectNote.createdAt));

  return c.json({ notes: notes.map((n) => noteDto(n)) });
});

app.post("/projects/:projectId/notes", async (c) => {
  const a = c.get("auth") as AuthUser;
  const projectId = c.req.param("projectId");
  const pr = await requireProject(a, projectId);
  if ("error" in pr) return c.json({ error: pr.error }, pr.status);

  const body = projectNoteCreate.safeParse(await c.req.json().catch(() => ({})));
  if (!body.success) return c.json({ error: body.error.flatten() }, 400);

  const [note] = await db
    .insert(projectNote)
    .values({
      projectId,
      title: body.data.title ?? "Untitled note",
      background: body.data.background ?? "none",
      createdById: a.id,
    })
    .returning();

  const [page] = await db
    .insert(projectNotePage)
    .values({
      noteId: note!.id,
      pageIndex: 0,
      contentJson: EMPTY_PAGE,
    })
    .returning();

  await writeAudit(a, "project_note.create", "project_note", note!.id, {
    projectId,
  });

  return c.json({
    note: noteDto(note!, [pageDto(page!)], []),
  });
});

app.get("/project-notes/:noteId", async (c) => {
  const a = c.get("auth") as AuthUser;
  const loaded = await loadNoteForAuth(a, c.req.param("noteId"));
  if ("error" in loaded) return c.json({ error: loaded.error }, loaded.status);

  const pages = await db
    .select()
    .from(projectNotePage)
    .where(eq(projectNotePage.noteId, loaded.note.id))
    .orderBy(asc(projectNotePage.pageIndex));

  const assets = await db
    .select()
    .from(projectNoteAsset)
    .where(eq(projectNoteAsset.noteId, loaded.note.id));

  return c.json({
    note: noteDto(
      loaded.note,
      pages.map(pageDto),
      assets.map(assetDto),
    ),
  });
});

app.patch("/project-notes/:noteId", async (c) => {
  const a = c.get("auth") as AuthUser;
  const loaded = await loadNoteForAuth(a, c.req.param("noteId"));
  if ("error" in loaded) return c.json({ error: loaded.error }, loaded.status);

  const body = projectNotePatch.safeParse(await c.req.json());
  if (!body.success) return c.json({ error: body.error.flatten() }, 400);
  if (body.data.version !== loaded.note.version) {
    return c.json({ error: "Conflict: note was updated elsewhere", version: loaded.note.version }, 409);
  }

  const [updated] = await db
    .update(projectNote)
    .set({
      ...(body.data.title !== undefined ? { title: body.data.title } : {}),
      ...(body.data.background !== undefined
        ? { background: body.data.background }
        : {}),
      version: loaded.note.version + 1,
      updatedAt: new Date(),
    })
    .where(eq(projectNote.id, loaded.note.id))
    .returning();

  return c.json({ note: noteDto(updated!) });
});

app.delete("/project-notes/:noteId", async (c) => {
  const a = c.get("auth") as AuthUser;
  const loaded = await loadNoteForAuth(a, c.req.param("noteId"));
  if ("error" in loaded) return c.json({ error: loaded.error }, loaded.status);

  const assets = await db
    .select()
    .from(projectNoteAsset)
    .where(eq(projectNoteAsset.noteId, loaded.note.id));
  for (const asset of assets) {
    await deleteProjectNoteImageFile(a.organizationId, asset.storageName);
  }

  await db.delete(projectNote).where(eq(projectNote.id, loaded.note.id));
  await writeAudit(a, "project_note.delete", "project_note", loaded.note.id, {
    projectId: loaded.note.projectId,
  });
  return c.json({ ok: true });
});

app.post("/project-notes/:noteId/pages", async (c) => {
  const a = c.get("auth") as AuthUser;
  const loaded = await loadNoteForAuth(a, c.req.param("noteId"));
  if ("error" in loaded) return c.json({ error: loaded.error }, loaded.status);

  const body = projectNotePageCreate.safeParse(
    await c.req.json().catch(() => ({})),
  );
  if (!body.success) return c.json({ error: body.error.flatten() }, 400);

  const existing = await db
    .select()
    .from(projectNotePage)
    .where(eq(projectNotePage.noteId, loaded.note.id))
    .orderBy(asc(projectNotePage.pageIndex));

  const insertAt =
    body.data.afterIndex !== undefined
      ? body.data.afterIndex + 1
      : existing.length;

  // Shift pages at/after insertAt up by 1 (from the end to avoid unique conflicts).
  for (let i = existing.length - 1; i >= insertAt; i--) {
    const p = existing[i]!;
    await db
      .update(projectNotePage)
      .set({ pageIndex: p.pageIndex + 1, updatedAt: new Date() })
      .where(eq(projectNotePage.id, p.id));
  }

  const [page] = await db
    .insert(projectNotePage)
    .values({
      noteId: loaded.note.id,
      pageIndex: insertAt,
      contentJson: EMPTY_PAGE,
    })
    .returning();

  await db
    .update(projectNote)
    .set({
      version: loaded.note.version + 1,
      updatedAt: new Date(),
    })
    .where(eq(projectNote.id, loaded.note.id));

  return c.json({ page: pageDto(page!) });
});

app.patch("/project-notes/pages/:pageId", async (c) => {
  const a = c.get("auth") as AuthUser;
  const pageId = c.req.param("pageId");
  const [page] = await db
    .select()
    .from(projectNotePage)
    .where(eq(projectNotePage.id, pageId));
  if (!page) return c.json({ error: "Not found" }, 404);

  const loaded = await loadNoteForAuth(a, page.noteId);
  if ("error" in loaded) return c.json({ error: loaded.error }, loaded.status);

  const body = projectNotePagePatch.safeParse(await c.req.json());
  if (!body.success) return c.json({ error: body.error.flatten() }, 400);
  if (body.data.version !== page.version) {
    return c.json(
      { error: "Conflict: page was updated elsewhere", version: page.version },
      409,
    );
  }

  try {
    JSON.parse(body.data.contentJson);
  } catch {
    return c.json({ error: "contentJson must be valid JSON" }, 400);
  }

  const [updated] = await db
    .update(projectNotePage)
    .set({
      contentJson: body.data.contentJson,
      version: page.version + 1,
      updatedAt: new Date(),
    })
    .where(eq(projectNotePage.id, pageId))
    .returning();

  await db
    .update(projectNote)
    .set({ updatedAt: new Date() })
    .where(eq(projectNote.id, loaded.note.id));

  return c.json({ page: pageDto(updated!) });
});

app.delete("/project-notes/pages/:pageId", async (c) => {
  const a = c.get("auth") as AuthUser;
  const pageId = c.req.param("pageId");
  const [page] = await db
    .select()
    .from(projectNotePage)
    .where(eq(projectNotePage.id, pageId));
  if (!page) return c.json({ error: "Not found" }, 404);

  const loaded = await loadNoteForAuth(a, page.noteId);
  if ("error" in loaded) return c.json({ error: loaded.error }, loaded.status);

  const siblings = await db
    .select()
    .from(projectNotePage)
    .where(eq(projectNotePage.noteId, loaded.note.id));
  if (siblings.length <= 1) {
    return c.json({ error: "Cannot delete the only page" }, 400);
  }

  await db.delete(projectNotePage).where(eq(projectNotePage.id, pageId));

  const remaining = siblings
    .filter((p) => p.id !== pageId)
    .sort((x, y) => x.pageIndex - y.pageIndex);
  for (let i = 0; i < remaining.length; i++) {
    if (remaining[i]!.pageIndex !== i) {
      await db
        .update(projectNotePage)
        .set({ pageIndex: i, updatedAt: new Date() })
        .where(eq(projectNotePage.id, remaining[i]!.id));
    }
  }

  await db
    .update(projectNote)
    .set({
      version: loaded.note.version + 1,
      updatedAt: new Date(),
    })
    .where(eq(projectNote.id, loaded.note.id));

  return c.json({ ok: true });
});

app.post("/project-notes/:noteId/assets", async (c) => {
  const a = c.get("auth") as AuthUser;
  const loaded = await loadNoteForAuth(a, c.req.param("noteId"));
  if ("error" in loaded) return c.json({ error: loaded.error }, loaded.status);

  const body = await c.req.parseBody();
  const file = body["file"];
  if (!(file instanceof File)) {
    return c.json({ error: 'Expected multipart field "file" (image)' }, 400);
  }
  const mime = file.type || "application/octet-stream";
  if (!isAllowedNoteImageMime(mime)) {
    return c.json({ error: "Unsupported image type (PNG, JPEG, WebP, or GIF)" }, 400);
  }
  const buf = Buffer.from(await file.arrayBuffer());
  if (buf.length === 0) return c.json({ error: "Empty file" }, 400);
  if (buf.length > MAX_NOTE_IMAGE_BYTES) {
    return c.json({ error: "Image too large (max 8MB)" }, 400);
  }

  let storageName: string;
  try {
    storageName = await saveProjectNoteImage(a.organizationId, mime, buf);
  } catch (e) {
    return c.json({ error: e instanceof Error ? e.message : String(e) }, 400);
  }

  const [asset] = await db
    .insert(projectNoteAsset)
    .values({
      noteId: loaded.note.id,
      fileName: file.name.slice(0, 255) || "image",
      storageName,
      mimeType: mime,
    })
    .returning();

  return c.json({ asset: assetDto(asset!) });
});

app.get("/project-notes/assets/:assetId/file", async (c) => {
  const a = c.get("auth") as AuthUser;
  const assetId = c.req.param("assetId");
  const [asset] = await db
    .select()
    .from(projectNoteAsset)
    .where(eq(projectNoteAsset.id, assetId));
  if (!asset) return c.json({ error: "Not found" }, 404);

  const loaded = await loadNoteForAuth(a, asset.noteId);
  if ("error" in loaded) return c.json({ error: loaded.error }, loaded.status);

  try {
    const buf = await readProjectNoteImage(a.organizationId, asset.storageName);
    return c.body(new Uint8Array(buf), 200, {
      "Content-Type": asset.mimeType,
      "Cache-Control": "private, max-age=3600",
    });
  } catch {
    return c.json({ error: "File missing" }, 404);
  }
});

app.delete("/project-notes/assets/:assetId", async (c) => {
  const a = c.get("auth") as AuthUser;
  const assetId = c.req.param("assetId");
  const [asset] = await db
    .select()
    .from(projectNoteAsset)
    .where(eq(projectNoteAsset.id, assetId));
  if (!asset) return c.json({ error: "Not found" }, 404);

  const loaded = await loadNoteForAuth(a, asset.noteId);
  if ("error" in loaded) return c.json({ error: loaded.error }, loaded.status);

  await deleteProjectNoteImageFile(a.organizationId, asset.storageName);
  await db.delete(projectNoteAsset).where(eq(projectNoteAsset.id, assetId));
  return c.json({ ok: true });
});

export const projectNotesApp = app;
