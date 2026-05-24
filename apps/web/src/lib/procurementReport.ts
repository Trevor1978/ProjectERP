import type { Procurement, ProcurementLine } from "../workspace/purchasingTypes";
import { calcProcurementTotals, formatOrderedQty } from "../workspace/procurementLineStatus";

type Supplier = { id: string; name: string };
type Project = { id: string; name: string };

function money(n: number): string {
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString();
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function buildProcurementReportHtml(opts: {
  row: Procurement;
  lines: ProcurementLine[];
  supplier?: Supplier | null;
  projects: Project[];
}): { html: string; docTitle: string; filename: string } {
  const { row, lines, supplier, projects } = opts;
  const projectName = new Map(projects.map((p) => [p.id, p.name]));
  const isPo =
    row.status === "ordered" || row.status === "partially_received" || row.status === "closed";
  const docTitle = isPo ? "Purchase Order" : "Request for Quotation";
  const { subtotal, gst, total } = calcProcurementTotals(lines);

  const lineRows = lines
    .map(
      (l) => `
    <tr>
      <td>${escapeHtml(l.partNumber ?? "")}</td>
      <td>${escapeHtml(l.description)}</td>
      <td>${escapeHtml(projectName.get(l.projectId) ?? "")}</td>
      <td class="num">${escapeHtml(l.quantity)}</td>
      <td class="num">${escapeHtml(formatOrderedQty(l.orderedQty))}</td>
      <td class="num">${l.receivedQty}</td>
      <td>${escapeHtml(l.unit ?? "")}</td>
      <td class="num">${l.estUnitPrice != null ? money(l.estUnitPrice) : "—"}</td>
    </tr>`,
    )
    .join("");

  const safeName = row.title.replace(/[^\w.-]+/g, "-").replace(/^-|-$/g, "") || "report";
  const filename = `${isPo ? "PO" : "RFQ"}-${safeName}.html`;

  const html = `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"/><title>${docTitle} — ${escapeHtml(row.title)}</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: "Helvetica Neue", Helvetica, Arial, sans-serif; color: #171a20; margin: 2rem; }
  h1 { font-size: 1.5rem; font-weight: 500; letter-spacing: 0.02em; margin: 0 0 0.25rem; }
  .meta { color: #5c5e62; font-size: 0.875rem; margin-bottom: 1.5rem; }
  table { width: 100%; border-collapse: collapse; font-size: 0.8125rem; }
  th, td { border-bottom: 1px solid #e8e8e8; padding: 0.5rem 0.4rem; text-align: left; vertical-align: top; }
  th { font-weight: 500; color: #393c41; }
  .num { text-align: right; }
  .totals { margin-top: 1.5rem; max-width: 16rem; margin-left: auto; }
  .totals div { display: flex; justify-content: space-between; padding: 0.25rem 0; }
  .totals .grand { font-weight: 600; border-top: 2px solid #171a20; margin-top: 0.5rem; padding-top: 0.5rem; }
  @media print { body { margin: 0.5in; } }
</style></head><body>
  <h1>${docTitle}</h1>
  <p class="meta">
    <strong>${escapeHtml(row.title)}</strong><br/>
    Status: ${escapeHtml(row.status)} · Supplier: ${escapeHtml(supplier?.name ?? "—")}<br/>
    Need by: ${fmtDate(row.needBy)} · SAP PO: ${escapeHtml(row.sapPoNumber ?? "—")}
  </p>
  <table>
    <thead><tr>
      <th>Part #</th><th>Description</th><th>Project</th>
      <th class="num">Qty</th><th class="num">Ordered</th><th class="num">Received</th>
      <th>Unit</th><th class="num">Unit price</th>
    </tr></thead>
    <tbody>${lineRows || "<tr><td colspan='8'>No lines</td></tr>"}</tbody>
  </table>
  <div class="totals">
    <div><span>Subtotal (ex GST)</span><span>$${money(subtotal)}</span></div>
    <div><span>GST (10%)</span><span>$${money(gst)}</span></div>
    <div class="grand"><span>Total</span><span>$${money(total)}</span></div>
  </div>
  <p class="meta" style="margin-top:2rem">Use <strong>Print</strong> → <strong>Save as PDF</strong> (or your browser’s PDF printer).</p>
  <script>window.addEventListener("load", () => window.setTimeout(() => window.print(), 250));</script>
</body></html>`;

  return { html, docTitle, filename };
}

function downloadReportHtml(filename: string, html: string) {
  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 2000);
}

function printViaHiddenIframe(html: string): boolean {
  try {
    const iframe = document.createElement("iframe");
    iframe.setAttribute("title", "RFQ/PO report");
    iframe.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0";
    document.body.appendChild(iframe);
    const win = iframe.contentWindow;
    const doc = win?.document;
    if (!doc) {
      iframe.remove();
      return false;
    }
    doc.open();
    doc.write(html);
    doc.close();
    window.setTimeout(() => iframe.remove(), 120_000);
    return true;
  } catch {
    return false;
  }
}

function openReportInNewTab(html: string, filename: string): boolean {
  const dataUrl = `data:text/html;charset=utf-8,${encodeURIComponent(html)}`;
  const w = window.open(dataUrl, "_blank");
  if (w) return true;

  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const blobUrl = URL.createObjectURL(blob);
  const w2 = window.open(blobUrl, "_blank");
  if (w2) {
    window.setTimeout(() => URL.revokeObjectURL(blobUrl), 10 * 60 * 1000);
    return true;
  }
  URL.revokeObjectURL(blobUrl);
  downloadReportHtml(filename, html);
  return false;
}

/**
 * Opens the RFQ/PO report and triggers Print → Save as PDF.
 * Prefers a hidden iframe (no pop-up / blank tab). Falls back to a new tab, then HTML download.
 */
export function openProcurementPdfReport(opts: {
  row: Procurement;
  lines: ProcurementLine[];
  supplier?: Supplier | null;
  projects: Project[];
}): void {
  const { html, filename } = buildProcurementReportHtml(opts);
  if (printViaHiddenIframe(html)) return;
  if (openReportInNewTab(html, filename)) return;
  window.alert(
    "Could not open the report. An HTML file was downloaded — open it in your browser, then use Print → Save as PDF.",
  );
}
