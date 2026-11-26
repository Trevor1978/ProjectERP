import { test, expect } from "@playwright/test";
import path from "node:path";

const artifactDir = process.env.SCREENSHOT_DIR ?? "/opt/cursor/artifacts";
const prefix = process.env.SCREENSHOT_PREFIX ?? "after-purchasing";

const viewports = [
  { name: "laptop", width: 1280, height: 800 },
  { name: "tablet", width: 768, height: 1024 },
  { name: "phone", width: 375, height: 812 },
] as const;

test("purchasing lines list and PO detail screenshots", async ({ page }, testInfo) => {
  test.setTimeout(120_000);

  const health = await page.request.get("http://127.0.0.1:3001/api/health").catch(() => null);
  if (!health?.ok()) {
    testInfo.annotations.push({ type: "skip", description: "API not on :3001" });
    test.skip();
  }

  const id = `po-${Date.now()}`;
  const email = `${id}@test.local`;
  const password = "playwright12";

  await page.goto("/register");
  await page.getByLabel("Organization").fill(`Org ${id}`);
  await page.getByLabel("Your name", { exact: true }).fill("PO Screenshot User");
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Register" }).click();
  await expect(page).toHaveURL("/", { timeout: 20_000 });
  await page.waitForLoadState("networkidle");

  const seed = await page.evaluate(async () => {
    const me = (await (
      await fetch("/api/auth/me", { credentials: "include" })
    ).json()) as { user: { organizationId: string } | null };
    if (!me.user?.organizationId) throw new Error("Not authenticated");
    const orgId = me.user.organizationId;

    const clientRes = await fetch("/api/clients", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ organizationId: orgId, name: "Widget Co", code: "W" }),
    });
    if (!clientRes.ok) throw new Error("client");
    const client = (await clientRes.json()) as { client: { id: string } };

    const projectRes = await fetch("/api/projects", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        organizationId: orgId,
        clientId: client.client.id,
        name: "Site upgrade",
        status: "active",
      }),
    });
    if (!projectRes.ok) throw new Error("project");
    const project = (await projectRes.json()) as { project: { id: string } };

    const procRes = await fetch("/api/procurement", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Hardware PO", status: "ordered" }),
    });
    if (!procRes.ok) throw new Error("proc");
    const proc = (await procRes.json()) as { procurement: { id: string } };

    const mkLine = async (body: Record<string, unknown>) => {
      const r = await fetch("/api/procurement-lines", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!r.ok) throw new Error("line");
      return (await r.json()) as { line: { id: string } };
    };

    const open = await mkLine({
      procurementId: proc.procurement.id,
      projectId: project.project.id,
      description: "Open widget order",
      quantity: "10",
      orderedQty: "10",
      receivedQty: 0,
    });

    const done = await mkLine({
      procurementId: proc.procurement.id,
      projectId: project.project.id,
      description: "Received bolts",
      quantity: "5",
      orderedQty: "5",
      receivedQty: 5,
    });

    return { procId: proc.procurement.id };
  });

  const procId = seed.procId;
  if (!procId) throw new Error("seed failed");

  await page.goto("/workspace/purchasing-lines");
  await expect(page.getByRole("heading", { name: "Purchasing lines" })).toBeVisible({
    timeout: 15_000,
  });
  const listLine = page.locator(".divide-y").getByText("Open widget order");
  await expect(listLine.first()).toBeVisible({ timeout: 15_000 });

  for (const vp of viewports) {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await page.waitForTimeout(250);
    await page.screenshot({
      path: path.join(artifactDir, `${prefix}-${vp.name}-purchasing-lines.png`),
      fullPage: false,
    });
  }

  await page.goto(`/workspace/purchasing/${procId}`);
  await expect(page.getByRole("heading", { name: "Hardware PO", exact: true })).toBeVisible({
    timeout: 20_000,
  });
  const poLine = page.locator(".divide-y").getByText("Open widget order");
  await expect(poLine.first()).toBeVisible({ timeout: 15_000 });

  for (const vp of viewports) {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await page.waitForTimeout(250);
    await page.screenshot({
      path: path.join(artifactDir, `${prefix}-${vp.name}-po-detail.png`),
      fullPage: false,
    });
  }
});