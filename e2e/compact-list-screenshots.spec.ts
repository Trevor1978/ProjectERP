import { test, expect, type APIRequestContext } from "@playwright/test";
import path from "node:path";

async function apiIsHealthy(r: APIRequestContext) {
  try {
    const res = await r.get("http://127.0.0.1:3001/api/health");
    if (!res.ok()) return false;
    const j = (await res.json()) as { ok?: boolean };
    return j.ok === true;
  } catch {
    return false;
  }
}

const artifactDir = process.env.SCREENSHOT_DIR ?? "/opt/cursor/artifacts";
const prefix = process.env.SCREENSHOT_PREFIX ?? "after";

const viewports = [
  { name: "laptop", width: 1280, height: 800 },
  { name: "tablet", width: 768, height: 1024 },
  { name: "phone", width: 375, height: 812 },
] as const;

test("capture workspace stacked list UI", async ({ page, request }, testInfo) => {
  test.setTimeout(120_000);
  if (!(await apiIsHealthy(request))) {
    testInfo.annotations.push({
      type: "skip",
      description: "API not on :3001",
    });
    test.skip();
  }

  const id = `ss-${Date.now()}`;
  const email = `${id}@test.local`;
  const password = "playwright12";

  await page.goto("/register");
  await page.getByLabel("Organization").fill(`Org ${id}`);
  await page.getByLabel("Your name", { exact: true }).fill("Screenshot User");
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Register" }).click();
  await expect(page).toHaveURL("/", { timeout: 20_000 });
  await page.waitForLoadState("networkidle");

  await page.evaluate(async () => {
    const j = (await (
      await fetch("/api/auth/me", { credentials: "include" })
    ).json()) as { user: { organizationId: string } | null };
    if (!j.user?.organizationId) throw new Error("Not authenticated");
    const orgId = j.user.organizationId;
    const clientRes = await fetch("/api/clients", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        organizationId: orgId,
        name: "Screenshot Customer",
        code: "SS",
      }),
    });
    if (!clientRes.ok) throw new Error("client create failed");
    const client = (await clientRes.json()) as { client: { id: string } };
    for (const name of ["Pump Upgrade Alpha", "Site Commissioning Bravo"]) {
      const pr = await fetch("/api/projects", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          organizationId: orgId,
          clientId: client.client.id,
          name,
          status: "active",
        }),
      });
      if (!pr.ok) throw new Error(`project create failed: ${name}`);
    }
    const ar = await fetch("/api/assets", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "CNC Line 1", site: "Sydney", line: "Fab A" }),
    });
    if (!ar.ok) throw new Error("asset create failed");
  });

  await page.goto("/workspace/projects");
  await expect(page.getByRole("heading", { name: "Projects", exact: true })).toBeVisible({
    timeout: 15_000,
  });
  await expect(page.getByText("Pump Upgrade Alpha")).toBeVisible({ timeout: 15_000 });

  for (const vp of viewports) {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await page.waitForTimeout(300);

    const panel = page.locator(".divide-y").first();
    await expect(panel).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText("Pump Upgrade Alpha")).toBeVisible();

    await page.screenshot({
      path: path.join(artifactDir, `${prefix}-${vp.name}-projects.png`),
      fullPage: false,
    });
  }

  await page.goto("/workspace/machines");
  await expect(page.getByText("CNC Line 1")).toBeVisible({ timeout: 15_000 });
  for (const vp of viewports) {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await page.waitForTimeout(300);
    await expect(page.getByText("CNC Line 1")).toBeVisible();
    await page.screenshot({
      path: path.join(artifactDir, `${prefix}-${vp.name}-machines.png`),
      fullPage: false,
    });
  }
});