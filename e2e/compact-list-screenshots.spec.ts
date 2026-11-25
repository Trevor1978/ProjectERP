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

  await page.goto("/workspace");
  await expect(page.getByRole("button", { name: "Projects", exact: true })).toBeVisible({
    timeout: 15_000,
  });

  for (const vp of viewports) {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await page.waitForTimeout(300);

    const list = page.locator(".divide-y").first();
    await expect(list).toBeVisible({ timeout: 10_000 });

    await page.screenshot({
      path: path.join(artifactDir, `${prefix}-${vp.name}-projects.png`),
      fullPage: false,
    });
  }

  await page.goto("/workspace/machines");
  for (const vp of viewports) {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await page.waitForTimeout(300);
    const list = page.locator(".divide-y").first();
    if (await list.isVisible().catch(() => false)) {
      await page.screenshot({
        path: path.join(artifactDir, `${prefix}-${vp.name}-machines.png`),
        fullPage: false,
      });
    }
  }
});