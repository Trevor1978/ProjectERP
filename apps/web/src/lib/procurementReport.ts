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

/**
 * Opens a printable RFQ/PO report in a new tab, then triggers the browser print dialog (Save as PDF).
 * If pop-ups are blocked, downloads the same report as an HTML file instead.
 */
export function openProcurementPdfReport(opts: {
  row: Procurement;
  lines: ProcurementLine[];
  supplier?: Supplier | null;
  projects: Project[];
}): void {
  const { html, filename } = buildProcurementReportHtml(opts);
  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);

  const w = window.open(url, "_blank");
  if (!w) {
    URL.revokeObjectURL(url);
    downloadReportHtml(filename, html);
    window.alert(
      "Pop-up was blocked. The report was downloaded as an HTML file — open it in your browser, then use Print → Save as PDF.",
    );
    return;
  }

  const cleanup = () => URL.revokeObjectURL(url);
  const triggerPrint = () => {
    try {
      w.focus();
      w.print();
    } catch {
      /* print may fail in strict embed contexts */
    }
  };

  w.addEventListener("load", () => {
    cleanup();
    window.setTimeout(triggerPrint, 300);
  });
  // If load already fired (blob URL), still print shortly after open
  window.setTimeout(() => {
    cleanup();
    triggerPrint();
  }, 600);
}
