type Asset = { name: string; site: string; line: string; serial: string | null };
type Log = {
  title: string;
  description: string | null;
  performedAt: string;
  technicianName: string | null;
};

export function openMachineServiceReport(asset: Asset, logs: Log[]): void {
  const rows = logs
    .map(
      (l) => `<tr>
      <td>${fmt(l.performedAt)}</td>
      <td>${esc(l.title)}</td>
      <td>${esc(l.description ?? "")}</td>
      <td>${esc(l.technicianName ?? "—")}</td>
    </tr>`,
    )
    .join("");

  const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"/><title>Service report — ${esc(asset.name)}</title>
<style>
  body { font-family: "Helvetica Neue", Arial, sans-serif; color: #171a20; margin: 2rem; }
  h1 { font-weight: 500; font-size: 1.35rem; }
  .meta { color: #5c5e62; font-size: 0.875rem; margin-bottom: 1.25rem; }
  table { width: 100%; border-collapse: collapse; font-size: 0.8125rem; }
  th, td { border-bottom: 1px solid #e8e8e8; padding: 0.45rem 0.35rem; text-align: left; vertical-align: top; }
  th { font-weight: 500; }
</style></head><body>
  <h1>Machine service report</h1>
  <p class="meta">
    <strong>${esc(asset.name)}</strong><br/>
    Site: ${esc(asset.site)} · Line: ${esc(asset.line)}${asset.serial ? ` · S/N: ${esc(asset.serial)}` : ""}
  </p>
  <table>
    <thead><tr><th>Date</th><th>Title</th><th>Work performed</th><th>Technician</th></tr></thead>
    <tbody>${rows || "<tr><td colspan='4'>No service history recorded.</td></tr>"}</tbody>
  </table>
  <script>window.onload = () => window.print();</script>
</body></html>`;

  const w = window.open("", "_blank", "noopener,noreferrer");
  if (!w) {
    alert("Allow pop-ups to print or save the report as PDF.");
    return;
  }
  w.document.write(html);
  w.document.close();
}

function fmt(iso: string): string {
  return new Date(iso).toLocaleString();
}

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
