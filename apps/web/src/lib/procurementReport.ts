import type { Procurement, ProcurementLine } from "../workspace/purchasingTypes";
import type { OrgProfile } from "../workspace/orgProfileTypes";
import { calcProcurementTotals, formatOrderedQty } from "../workspace/procurementLineStatus";
import { fetchReportImageDataUrls } from "./reportImageData";

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

function formatAddressBlock(label: string, value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";
  return `<div class="addr-block"><span class="addr-label">${escapeHtml(label)}</span><div class="addr-body">${escapeHtml(trimmed).replace(/\n/g, "<br/>")}</div></div>`;
}

function buildOrgHeaderHtml(
  orgName: string,
  profile: OrgProfile | null | undefined,
  logos: string[],
): string {
  const display = profile?.displayName?.trim() || orgName;
  const contact: string[] = [];
  if (profile?.phone?.trim()) contact.push(escapeHtml(profile.phone.trim()));
  if (profile?.email?.trim()) contact.push(escapeHtml(profile.email.trim()));
  if (profile?.website?.trim()) contact.push(escapeHtml(profile.website.trim()));
  const tax = profile?.taxId?.trim() ? `<div class="tax-id">ABN / Tax ID: ${escapeHtml(profile.taxId.trim())}</div>` : "";

  const logoHtml = logos.length
    ? `<div class="logos">${logos.map((src) => `<img src="${src}" alt="" />`).join("")}</div>`
    : "";

  const addresses = [
    formatAddressBlock("Shipping", profile?.shippingAddress ?? ""),
    formatAddressBlock("Billing", profile?.billingAddress ?? ""),
    formatAddressBlock("Correspondence", profile?.correspondenceAddress ?? ""),
  ]
    .filter(Boolean)
    .join("");

  return `<header class="org-header">
    <div class="org-brand">
      ${logoHtml}
      <div class="org-identity">
        <div class="org-name">${escapeHtml(display)}</div>
        ${contact.length ? `<div class="org-contact">${contact.join(" · ")}</div>` : ""}
        ${tax}
      </div>
    </div>
    ${addresses ? `<div class="org-addresses">${addresses}</div>` : ""}
  </header>`;
}

function buildProcurementReportHtml(opts: {
  row: Procurement;
  lines: ProcurementLine[];
  supplier?: Supplier | null;
  projects: Project[];
  orgName: string;
  orgProfile?: OrgProfile | null;
  logoDataUrls?: string[];
}): { html: string; docTitle: string; filename: string } {
  const { row, lines, supplier, projects, orgName, orgProfile, logoDataUrls = [] } = opts;
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
  const orgHeader = buildOrgHeaderHtml(orgName, orgProfile, logoDataUrls);

  const html = `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"/><title>${docTitle} — ${escapeHtml(row.title)}</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: "Helvetica Neue", Helvetica, Arial, sans-serif; color: #171a20; margin: 2rem; }
  .org-header { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 1.5rem; padding-bottom: 1.25rem; margin-bottom: 1.5rem; border-bottom: 2px solid #171a20; }
  .org-brand { display: flex; flex-wrap: wrap; align-items: flex-start; gap: 1rem; flex: 1; min-width: 14rem; }
  .logos { display: flex; flex-wrap: wrap; align-items: center; gap: 0.75rem; }
  .logos img { max-height: 56px; max-width: 160px; object-fit: contain; }
  .org-name { font-size: 1.125rem; font-weight: 600; letter-spacing: 0.02em; }
  .org-contact, .tax-id { color: #5c5e62; font-size: 0.8125rem; margin-top: 0.25rem; }
  .org-addresses { display: flex; flex-wrap: wrap; gap: 1rem 1.5rem; font-size: 0.8125rem; max-width: 28rem; }
  .addr-block { min-width: 10rem; }
  .addr-label { display: block; font-weight: 600; color: #393c41; margin-bottom: 0.2rem; }
  .addr-body { color: #5c5e62; line-height: 1.4; }
  h1 { font-size: 1.5rem; font-weight: 500; letter-spacing: 0.02em; margin: 0 0 0.25rem; }
  .meta { color: #5c5e62; font-size: 0.875rem; margin-bottom: 1.5rem; }
  table { width: 100%; border-collapse: collapse; font-size: 0.8125rem; }
  th, td { border-bottom: 1px solid #e8e8e8; padding: 0.5rem 0.4rem; text-align: left; vertical-align: top; }
  th { font-weight: 500; color: #393c41; }
  .num { text-align: right; }
  .totals { margin-top: 1.5rem; max-width: 16rem; margin-left: auto; }
  .totals div { display: flex; justify-content: space-between; padding: 0.25rem 0; }
  .totals .grand { font-weight: 600; border-top: 2px solid #171a20; margin-top: 0.5rem; padding-top: 0.5rem; }
  .hint { margin-top: 2rem; color: #5c5e62; font-size: 0.8125rem; }
  @media print { body { margin: 0.5in; } }
</style></head><body>
  ${orgHeader}
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
  <p class="hint">Use your browser menu: <strong>Print</strong> → <strong>Save as PDF</strong> when you are ready.</p>
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

function openReportInNewTab(html: string, filename: string): boolean {
  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const blobUrl = URL.createObjectURL(blob);
  const w = window.open(blobUrl, "_blank");
  if (w) {
    window.setTimeout(() => URL.revokeObjectURL(blobUrl), 10 * 60 * 1000);
    return true;
  }
  URL.revokeObjectURL(blobUrl);

  const dataUrl = `data:text/html;charset=utf-8,${encodeURIComponent(html)}`;
  const w2 = window.open(dataUrl, "_blank");
  if (w2) return true;

  downloadReportHtml(filename, html);
  return false;
}

/**
 * Opens the RFQ/PO report in a new browser tab (no automatic print).
 */
export async function openProcurementPdfReport(opts: {
  row: Procurement;
  lines: ProcurementLine[];
  supplier?: Supplier | null;
  projects: Project[];
  orgName: string;
  orgProfile?: OrgProfile | null;
}): Promise<void> {
  const imagePaths = (opts.orgProfile?.images ?? [])
    .filter((img) => img.includeOnReports)
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((img) => img.url);
  const logoDataUrls = await fetchReportImageDataUrls(imagePaths);

  const { html, filename } = buildProcurementReportHtml({
    ...opts,
    logoDataUrls,
  });

  if (!openReportInNewTab(html, filename)) {
    window.alert(
      "Pop-up was blocked. The report was downloaded as an HTML file — open it in your browser to view or print.",
    );
  }
}
