import { apiFetchUrl } from "./api";

/** Authenticated download of a service report file attached to a service log. */
export async function downloadServiceReport(
  logId: string,
  kind: "md" | "pdf",
  cacheBust?: number | string,
): Promise<void> {
  const basePath =
    kind === "md"
      ? `/api/asset-service-logs/${logId}/report.md`
      : `/api/asset-service-logs/${logId}/report.pdf`;
  const bust = cacheBust ?? Date.now();
  const path = `${basePath}?v=${encodeURIComponent(String(bust))}`;
  const r = await fetch(apiFetchUrl(path), {
    credentials: "include",
    cache: "no-store",
  });
  if (!r.ok) {
    throw new Error(`Download failed (${r.status})`);
  }
  const blob = await r.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = kind === "md" ? `service-report.md` : `service-report.pdf`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
