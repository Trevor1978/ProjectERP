import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

const UPLOAD_ROOT = process.env.UPLOAD_DIR ?? path.join(process.cwd(), "data", "uploads");

const ALLOWED_MIME = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
]);

const EXT_BY_MIME: Record<string, string> = {
  "image/png": ".png",
  "image/jpeg": ".jpg",
  "image/webp": ".webp",
  "image/gif": ".gif",
};

export const MAX_NOTE_IMAGE_BYTES = 8 * 1024 * 1024;

export function projectNoteUploadDir(organizationId: string): string {
  return path.join(UPLOAD_ROOT, organizationId, "project-notes");
}

export function projectNoteImagePath(
  organizationId: string,
  storageName: string,
): string {
  return path.join(projectNoteUploadDir(organizationId), storageName);
}

export function isAllowedNoteImageMime(mime: string): boolean {
  return ALLOWED_MIME.has(mime);
}

export async function saveProjectNoteImage(
  organizationId: string,
  mimeType: string,
  buffer: Buffer,
): Promise<string> {
  if (!isAllowedNoteImageMime(mimeType)) {
    throw new Error("Unsupported image type (use PNG, JPEG, WebP, or GIF)");
  }
  if (buffer.length > MAX_NOTE_IMAGE_BYTES) {
    throw new Error("Image too large (max 8MB)");
  }
  const dir = projectNoteUploadDir(organizationId);
  await mkdir(dir, { recursive: true });
  const storageName = `${randomUUID()}${EXT_BY_MIME[mimeType] ?? ".bin"}`;
  await writeFile(path.join(dir, storageName), buffer);
  return storageName;
}

export async function readProjectNoteImage(
  organizationId: string,
  storageName: string,
): Promise<Buffer> {
  const full = projectNoteImagePath(organizationId, storageName);
  const resolved = path.resolve(full);
  const root = path.resolve(projectNoteUploadDir(organizationId));
  if (!resolved.startsWith(root + path.sep) && resolved !== root) {
    throw new Error("Invalid path");
  }
  return readFile(resolved);
}

export async function deleteProjectNoteImageFile(
  organizationId: string,
  storageName: string,
): Promise<void> {
  try {
    await unlink(projectNoteImagePath(organizationId, storageName));
  } catch {
    /* ignore missing */
  }
}
