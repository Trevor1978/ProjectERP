/** Client-side resize/compress for note photo uploads. */
export async function compressNoteImage(
  file: File,
  opts?: { maxEdge?: number; quality?: number },
): Promise<File> {
  const maxEdge = opts?.maxEdge ?? 1600;
  const quality = opts?.quality ?? 0.82;
  if (!file.type.startsWith("image/")) return file;
  // Skip tiny / already-small files
  if (file.size < 280_000 && file.type !== "image/png") return file;

  const bitmap = await createImageBitmap(file).catch(() => null);
  if (!bitmap) return file;

  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
  const w = Math.max(1, Math.round(bitmap.width * scale));
  const h = Math.max(1, Math.round(bitmap.height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    bitmap.close();
    return file;
  }
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();

  const preferWebp = "toDataURL" in canvas;
  const mime =
    preferWebp && supportsWebp()
      ? "image/webp"
      : file.type === "image/png"
        ? "image/jpeg"
        : file.type === "image/jpeg" || file.type === "image/webp"
          ? file.type
          : "image/jpeg";

  const blob: Blob | null = await new Promise((resolve) => {
    canvas.toBlob((b) => resolve(b), mime, quality);
  });
  if (!blob || blob.size >= file.size * 0.95) return file;

  const base = file.name.replace(/\.[^.]+$/, "") || "photo";
  const ext = mime === "image/webp" ? "webp" : "jpg";
  return new File([blob], `${base}.${ext}`, { type: mime, lastModified: Date.now() });
}

let webpOk: boolean | null = null;
function supportsWebp(): boolean {
  if (webpOk != null) return webpOk;
  try {
    webpOk =
      document
        .createElement("canvas")
        .toDataURL("image/webp")
        .startsWith("data:image/webp");
  } catch {
    webpOk = false;
  }
  return webpOk;
}
