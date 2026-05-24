import { apiFetchUrl } from "./api";

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

/** Load report images as data URLs so they render in blob/data report tabs. */
export async function fetchReportImageDataUrls(paths: string[]): Promise<string[]> {
  const out: string[] = [];
  for (const path of paths) {
    try {
      const r = await fetch(apiFetchUrl(path), { credentials: "include" });
      if (!r.ok) continue;
      const blob = await r.blob();
      out.push(await blobToDataUrl(blob));
    } catch {
      /* skip broken image */
    }
  }
  return out;
}
