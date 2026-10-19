import { test, expect, type APIRequestContext, type Page } from "@playwright/test";
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

async function registerAndOpenPurchasing(page: Page) {
  const id = `mob-po-${Date.now()}`;
  const email = `${id}@test.local`;
  const password = "playwright12";

  await page.goto("/register");
  await page.getByLabel("Organization").fill(`Org ${id}`);
  await page.getByLabel("Your name", { exact: true }).fill("Mobile PO Tester");
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Register" }).click();
  await expect(page).toHaveURL("/", { timeout: 20_000 });

  const meRes = await page.request.get("/api/auth/me");
  expect(meRes.ok()).toBeTruthy();
  const orgId = ((await meRes.json()) as { user: { organizationId: string } }).user.organizationId;

  const clientRes = await page.request.post("/api/clients", {
    data: { name: "E2E Client", organizationId: orgId },
  });
  expect(clientRes.ok()).toBeTruthy();
  const clientId = ((await clientRes.json()) as { client: { id: string } }).client.id;

  const projectRes = await page.request.post("/api/projects", {
    data: { name: "Mobile PO Project", clientId, organizationId: orgId, status: "active" },
  });
  expect(projectRes.ok()).toBeTruthy();
  const projectId = ((await projectRes.json()) as { project: { id: string } }).project.id;

  const procRes = await page.request.post("/api/procurement", {
    data: { title: `PO ${id}`, status: "draft" },
  });
  expect(procRes.ok()).toBeTruthy();
  const procurementId = ((await procRes.json()) as { procurement: { id: string } }).procurement.id;

  await page.goto(`/workspace/purchasing/${procurementId}`);
  await expect(page.getByRole("heading", { name: "Purchasing order" })).toBeVisible({
    timeout: 15_000,
  });
  return { projectId, procurementId, lineDescription: `Line ${id}` };
}

async function addLineViaSheet(page: Page, description: string, screenshotName: string) {
  await page.getByTestId("purchasing-add-line").click();
  await expect(page.getByRole("dialog")).toBeVisible();
  const dialog = page.getByRole("dialog");
  const projectSelect = dialog.locator("select").first();
  await expect(projectSelect).toBeVisible();
  const firstProjectValue = await projectSelect
    .locator("option")
    .evaluateAll((opts) => {
      for (const o of opts) {
        const v = (o as HTMLOptionElement).value;
        if (v && !v.startsWith("+")) return v;
      }
      return null;
    });
  if (firstProjectValue) {
    await projectSelect.selectOption(firstProjectValue);
  }
  await dialog.locator("textarea").first().fill(description);
  await expect(page.getByRole("button", { name: "Save line" })).toBeEnabled({ timeout: 15_000 });
  await page.getByRole("button", { name: "Save line" }).click();
  await expect(page.getByText(description)).toBeVisible({ timeout: 15_000 });
  await page.screenshot({
    path: path.join("/opt/cursor/artifacts", screenshotName),
    fullPage: true,
  });
}

test.describe("mobile purchasing line items", () => {
  test.beforeEach(async ({ request }, testInfo) => {
    test.setTimeout(90_000);
    if (!(await apiIsHealthy(request))) {
      testInfo.skip(true, "API not available on 127.0.0.1:3001");
    }
  });

  test("add PO line at phone viewport 390x844", async ({ page, request }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const { lineDescription } = await registerAndOpenPurchasing(page);
    await addLineViaSheet(page, lineDescription, "mobile-po-line-390x844.png");
  });

  test("add PO line at tablet viewport 768x1024", async ({ page, request }) => {
    await page.setViewportSize({ width: 768, height: 1024 });
    const { lineDescription } = await registerAndOpenPurchasing(page);
    await addLineViaSheet(page, lineDescription, "mobile-po-line-768x1024.png");
  });
});
