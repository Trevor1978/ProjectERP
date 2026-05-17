import type { Procurement, ProcurementLine } from "../workspace/purchasingTypes";
import { calcProcurementTotals, displayOrderedQty } from "../workspace/procurementLineStatus";

type Supplier = { id: string; name: string };
type Project = { id: string; name: string };

function money(n: number): string {
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString();
}

export function openProcurementPdfReport(opts: {
  row: Procurement;
  lines: ProcurementLine[];
  supplier?: Supplier | null;
  projects: Project[];
}): void {
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
      <td class="num">${escapeHtml(displayOrderedQty(row.status, l.quantity))}</td>
      <td class="num">${l.receivedQty}</td>
      <td>${escapeHtml(l.unit ?? "")}</td>
      <td class="num">${l.estUnitPrice != null ? money(l.estUnitPrice) : "—"}</td>
    </tr>`,
    )
    .join("");

  const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"/><title>${docTitle} — ${escapeHtml(row.title)}</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: "Gotham", "Helvetica Neue", Arial, sans-serif; color: #171a20; margin: 2rem; }
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
  <script>window.onload = () => { window.print(); };</script>
</body></html>`;

  const w = window.open("", "_blank", "noopener,noreferrer");
  if (!w) {
    alert("Allow pop-ups to print or save the report as PDF.");
    return;
  }
  w.document.write(html);
  w.document.close();
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
