import { chromium } from "@playwright/test";
import { mkdir } from "node:fs/promises";

const API = process.env.API_URL ?? "http://127.0.0.1:3001";
const WEB = process.env.WEB_URL ?? "http://127.0.0.1:5173";
const OUT = "/opt/cursor/artifacts/screenshots";

async function apiJson(path, { method = "GET", body, cookie } = {}) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(cookie ? { Cookie: cookie } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = text;
  }
  if (!res.ok) throw new Error(`${method} ${path}: ${res.status} ${text}`);
  return { json, headers: res.headers };
}

function parseCookie(setCookie) {
  if (!setCookie) return "";
  const first = setCookie.split(",")[0];
  return first.split(";")[0];
}

const email = `audit-ui-${Date.now()}@test.local`;
const password = "password12";

const reg = await apiJson("/api/auth/register", {
  method: "POST",
  body: {
    email,
    password,
    name: "Audit UI",
    organizationName: `Audit Org ${Date.now()}`,
  },
});
const cookie = parseCookie(reg.headers.get("set-cookie"));
const orgId = reg.json.user.organizationId;

const client = await apiJson("/api/clients", {
  method: "POST",
  cookie,
  body: { name: "Acme Mining", organizationId: orgId, code: "ACME" },
});
const clientId = client.json.client.id;

await apiJson(`/api/clients/${clientId}`, {
  method: "PATCH",
  cookie,
  body: { name: "Acme Mining Pty", code: "ACME", version: 0 },
});

const project = await apiJson("/api/projects", {
  method: "POST",
  cookie,
  body: {
    name: "Pit Expansion",
    organizationId: orgId,
    clientId,
    status: "active",
  },
});
const projectId = project.json.project.id;

const milestone = await apiJson("/api/milestones", {
  method: "POST",
  cookie,
  body: { projectId, name: "Phase 1", orderIndex: 0 },
});
const task = await apiJson("/api/tasks", {
  method: "POST",
  cookie,
  body: {
    projectId,
    milestoneId: milestone.json.milestone.id,
    title: "Install conveyor",
    orderIndex: 0,
    useDerivedPercent: true,
    percentComplete: 0,
  },
});
const todo = await apiJson("/api/todos", {
  method: "POST",
  cookie,
  body: { taskId: task.json.task.id, title: "Order belts", status: "backlog" },
});

await apiJson(`/api/todos/${todo.json.todo.id}`, {
  method: "PATCH",
  cookie,
  body: { title: "Order belts (urgent)", status: "in_progress", version: 0 },
});

await mkdir(OUT, { recursive: true });

const browser = await chromium.launch();
const contexts = [
  { name: "desktop-1280", width: 1280, height: 800 },
  { name: "tablet-1024", width: 1024, height: 768 },
  { name: "tablet-768", width: 768, height: 1024 },
  { name: "phone-390", width: 390, height: 844 },
];

for (const vp of contexts) {
  const context = await browser.newContext({
    viewport: { width: vp.width, height: vp.height },
  });
  await context.addCookies([
    {
      name: "pe_session",
      value: cookie.split("=")[1],
      domain: "127.0.0.1",
      path: "/",
      httpOnly: true,
    },
  ]);
  const page = await context.newPage();
  await page.goto(`${WEB}/workspace/customers/${clientId}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);
  await page.screenshot({
    path: `${OUT}/customer-history-${vp.name}.png`,
    fullPage: true,
  });
  await page.goto(`${WEB}/workspace/customers`, { waitUntil: "networkidle" });
  await page.waitForTimeout(800);
  await page.screenshot({
    path: `${OUT}/customers-table-${vp.name}.png`,
    fullPage: true,
  });
  await page.goto(`${WEB}/workspace/projects/${projectId}`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "History" }).click();
  await page.waitForTimeout(1200);
  await page.screenshot({
    path: `${OUT}/project-history-tab-${vp.name}.png`,
    fullPage: true,
  });
  await context.close();
}

await browser.close();
console.log("Screenshots written to", OUT);
