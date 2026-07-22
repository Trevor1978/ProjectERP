import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { marked } from "marked";
import puppeteer from "puppeteer-core";
import { SERVICE_REPORT_CSS } from "./css.js";

const UPLOAD_ROOT = process.env.UPLOAD_DIR ?? path.join(process.cwd(), "data", "uploads");

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

export async function saveServiceReportFiles(
  organizationId: string,
  markdown: string,
): Promise<{ markdownStorage: string; pdfStorage: string }> {
  const dir = serviceReportDir(organizationId);
  mkdirSync(dir, { recursive: true });
  const id = randomUUID();
  const markdownStorage = `${id}.md`;
  const pdfStorage = `${id}.pdf`;
  const mdPath = path.join(dir, markdownStorage);
  const pdfPath = path.join(dir, pdfStorage);

  const withLogo = ensureLogoInMarkdown(markdown);
  writeFileSync(mdPath, withLogo, "utf8");

  const embedded = embedLocalImages(withLogo, dir);
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

  if (!existsSync(pdfPath)) {
    throw new Error("PDF generation did not produce an output file");
  }

  return { markdownStorage, pdfStorage };
}

export async function readServiceReportFile(
  organizationId: string,
  storageName: string,
): Promise<Buffer> {
  const full = serviceReportPath(organizationId, storageName);
  const resolved = path.resolve(full);
  const root = path.resolve(serviceReportDir(organizationId));
  if (!resolved.startsWith(root + path.sep) && resolved !== root) {
    throw new Error("Invalid path");
  }
  return readFileSync(resolved);
}
