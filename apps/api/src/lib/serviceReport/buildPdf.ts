import {
  existsSync,
  readFileSync,
  writeFileSync,
  mkdirSync,
  unlinkSync,
} from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { marked } from "marked";
import puppeteer from "puppeteer-core";
import { SERVICE_REPORT_CSS } from "./css.js";

const UPLOAD_ROOT = process.env.UPLOAD_DIR ?? path.join(process.cwd(), "data", "uploads");

export const SERVICE_REPORT_DOWNLOAD_HEADERS = {
  "Cache-Control": "no-store, no-cache, must-revalidate",
  Pragma: "no-cache",
} as const;

function logoCandidates(): string[] {
  const here = path.dirname(fileURLToPath(import.meta.url));
  return [
    path.resolve(process.cwd(), "assets", "SpantecLogo.jpg"),
    path.resolve(here, "../../../../assets/SpantecLogo.jpg"),
    path.resolve(here, "../../../assets/SpantecLogo.jpg"),
  ];
}

export function resolveSpantecLogoPath(): string | null {
  for (const p of logoCandidates()) {
    if (existsSync(p)) return p;
  }
  return null;
}

/** Embed local images as data URIs for reliable Chromium PDF rendering. */
export function embedLocalImages(markdown: string, baseDir: string): string {
  return markdown.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (match, alt, src) => {
    const trimmed = String(src).trim().replace(/^<|>$/g, "");
    if (/^(https?:|data:)/i.test(trimmed)) return match;

    let imagePath: string;
    if (trimmed.startsWith("file:")) {
      imagePath = fileURLToPath(trimmed);
    } else if (trimmed.includes("SpantecLogo")) {
      imagePath = resolveSpantecLogoPath() ?? path.resolve(baseDir, trimmed);
    } else {
      imagePath = path.resolve(baseDir, trimmed);
    }
    if (!existsSync(imagePath)) {
      return match;
    }
    const ext = imagePath.split(".").pop()?.toLowerCase();
    const mime =
      ext === "png" ? "image/png" : ext === "gif" ? "image/gif" : "image/jpeg";
    const dataUri = `data:${mime};base64,${readFileSync(imagePath).toString("base64")}`;
    return `![${alt}](${dataUri})`;
  });
}

/** Ensure logo path in markdown points at a resolvable relative name. */
export function ensureLogoInMarkdown(markdown: string): string {
  if (/!\[[^\]]*\]\([^)]*SpantecLogo[^)]*\)/i.test(markdown)) {
    return markdown;
  }
  return `![Spantec](SpantecLogo.jpg)\n\n${markdown.replace(/^\s+/, "")}`;
}

export function serviceReportDir(organizationId: string): string {
  return path.join(UPLOAD_ROOT, organizationId, "service-reports");
}

export function serviceReportPath(
  organizationId: string,
  storageName: string,
): string {
  return path.join(serviceReportDir(organizationId), storageName);
}

export function pairedPdfStorageName(markdownStorage: string): string {
  return markdownStorage.replace(/\.md$/i, ".pdf");
}

async function resolveChromeLaunch(): Promise<{
  executablePath?: string;
  args: string[];
}> {
  const override = process.env.PUPPETEER_EXECUTABLE_PATH?.trim();
  const baseArgs = [
    "--no-sandbox",
    "--disable-setuid-sandbox",
    "--disable-dev-shm-usage",
  ];

  if (override && existsSync(override)) {
    return { executablePath: override, args: baseArgs };
  }

  // @sparticuz/chromium ships a Linux binary only (Coolify / Docker).
  if (process.platform === "linux") {
    try {
      const chromium = await import("@sparticuz/chromium");
      chromium.default.setGraphicsMode = false;
      const executablePath = await chromium.default.executablePath();
      return {
        executablePath,
        args: [...chromium.default.args, ...baseArgs],
      };
    } catch (e) {
      console.warn(
        "[service-report] @sparticuz/chromium unavailable:",
        e instanceof Error ? e.message : e,
      );
    }
  }

  const localChromeCandidates = [
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
  ];
  for (const p of localChromeCandidates) {
    if (existsSync(p)) {
      return { executablePath: p, args: baseArgs };
    }
  }

  return { args: baseArgs };
}

function markdownToHtmlDocument(markdown: string): string {
  const body = marked.parse(markdown, { async: false }) as string;
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <style>${SERVICE_REPORT_CSS}</style>
</head>
<body>
${body}
</body>
</html>`;
}

async function renderServiceReportPdf(
  organizationId: string,
  markdown: string,
  pdfStorageName: string,
): Promise<boolean> {
  const dir = serviceReportDir(organizationId);
  mkdirSync(dir, { recursive: true });
  const pdfPath = path.join(dir, pdfStorageName);

  try {
    const embedded = embedLocalImages(markdown, dir);
    const html = markdownToHtmlDocument(embedded);
    const launch = await resolveChromeLaunch();

    if (!launch.executablePath) {
      throw new Error(
        "No Chromium/Chrome executable found for PDF generation. Set PUPPETEER_EXECUTABLE_PATH or install Chrome.",
      );
    }

    const browser = await puppeteer.launch({
      executablePath: launch.executablePath,
      args: launch.args,
      headless: true,
    });
    try {
      const page = await browser.newPage();
      await page.setContent(html, { waitUntil: "load" });
      await page.pdf({
        path: pdfPath,
        format: "A4",
        printBackground: true,
      });
    } finally {
      await browser.close();
    }

    return existsSync(pdfPath);
  } catch (e) {
    console.error(
      "[service-report] PDF failed:",
      e instanceof Error ? e.message : e,
    );
    return false;
  }
}

function writeServiceReportMarkdown(
  organizationId: string,
  markdown: string,
  markdownStorage: string,
): string {
  const dir = serviceReportDir(organizationId);
  mkdirSync(dir, { recursive: true });
  const withLogo = ensureLogoInMarkdown(markdown);
  writeFileSync(path.join(dir, markdownStorage), withLogo, "utf8");
  return withLogo;
}

/** Create a new markdown + PDF pair (first save / Log work confirm). */
export async function saveServiceReportFiles(
  organizationId: string,
  markdown: string,
): Promise<{ markdownStorage: string; pdfStorage: string | null; pdfGenerated: boolean }> {
  const id = randomUUID();
  const markdownStorage = `${id}.md`;
  const pdfStorageName = `${id}.pdf`;
  const withLogo = writeServiceReportMarkdown(
    organizationId,
    markdown,
    markdownStorage,
  );
  const pdfGenerated = await renderServiceReportPdf(
    organizationId,
    withLogo,
    pdfStorageName,
  );
  return {
    markdownStorage,
    pdfStorage: pdfGenerated ? pdfStorageName : null,
    pdfGenerated,
  };
}

/** Overwrite an existing markdown file and regenerate its paired PDF. */
export async function updateServiceReportFiles(
  organizationId: string,
  markdown: string,
  existing: { markdownStorage: string; pdfStorage: string | null },
): Promise<{ markdownStorage: string; pdfStorage: string | null; pdfGenerated: boolean }> {
  const withLogo = writeServiceReportMarkdown(
    organizationId,
    markdown,
    existing.markdownStorage,
  );
  const pdfStorageName =
    existing.pdfStorage ?? pairedPdfStorageName(existing.markdownStorage);
  const pdfGenerated = await renderServiceReportPdf(
    organizationId,
    withLogo,
    pdfStorageName,
  );
  return {
    markdownStorage: existing.markdownStorage,
    pdfStorage: pdfGenerated ? pdfStorageName : null,
    pdfGenerated,
  };
}

/** Build or rebuild the PDF from the stored markdown file. */
export async function regenerateServiceReportPdf(
  organizationId: string,
  markdownStorage: string,
  pdfStorage: string | null,
): Promise<{ pdfStorage: string; buffer: Buffer } | null> {
  const markdown = readServiceReportFileSync(organizationId, markdownStorage).toString(
    "utf8",
  );
  const pdfStorageName = pdfStorage ?? pairedPdfStorageName(markdownStorage);
  const pdfGenerated = await renderServiceReportPdf(
    organizationId,
    markdown,
    pdfStorageName,
  );
  if (!pdfGenerated) {
    return null;
  }
  return {
    pdfStorage: pdfStorageName,
    buffer: readServiceReportFileSync(organizationId, pdfStorageName),
  };
}

function resolvedReportPath(
  organizationId: string,
  storageName: string,
): string {
  const full = serviceReportPath(organizationId, storageName);
  const resolved = path.resolve(full);
  const root = path.resolve(serviceReportDir(organizationId));
  if (!resolved.startsWith(root + path.sep) && resolved !== root) {
    throw new Error("Invalid path");
  }
  return resolved;
}

function readServiceReportFileSync(
  organizationId: string,
  storageName: string,
): Buffer {
  return readFileSync(resolvedReportPath(organizationId, storageName));
}

export async function readServiceReportFile(
  organizationId: string,
  storageName: string,
): Promise<Buffer> {
  return readServiceReportFileSync(organizationId, storageName);
}

export function deleteServiceReportFile(
  organizationId: string,
  storageName: string,
): void {
  const resolved = resolvedReportPath(organizationId, storageName);
  if (existsSync(resolved)) {
    unlinkSync(resolved);
  }
}
