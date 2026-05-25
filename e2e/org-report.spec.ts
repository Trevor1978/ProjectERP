import { test, expect, type APIRequestContext, type Page } from "@playwright/test";

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

async function registerOrgAdmin(page: Page, id: string) {
  const email = `${id}@test.local`;
  const password = "playwright12";
  await page.goto("/register");
  await page.getByLabel("Organization").fill(`Org ${id}`);
  await page.getByLabel("Your name", { exact: true }).fill("Org Admin");
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Register" }).click();
  await expect(page).toHaveURL("/", { timeout: 15_000 });
}

async function seedPurchasingOrder(page: Page): Promise<string> {
  const meRes = await page.request.get("/api/auth/me");
  const me = (await meRes.json()) as { user: { organizationId: string } };
  const oid = me.user.organizationId;

  const clientRes = await page.request.post("/api/clients", {
    data: { name: "PW Client", organizationId: oid },
  });
  const clientId = ((await clientRes.json()) as { client: { id: string } }).client.id;

  const projectRes = await page.request.post("/api/projects", {
    data: {
      name: "PW Project",
      organizationId: oid,
      clientId,
      status: "active",
    },
  });
  const projectId = ((await projectRes.json()) as { project: { id: string } }).project.id;

  const procRes = await page.request.post("/api/procurement", {
    data: { title: "PW RFQ Order", status: "draft" },
  });
  const procurementId = ((await procRes.json()) as { procurement: { id: string } })
    .procurement.id;

  await page.request.post("/api/procurement-lines", {
    data: {
      procurementId,
      projectId,
      description: "Test widget",
      quantity: "3",
      orderIndex: 0,
    },
  });

  return procurementId;
}

test("organization settings: edit addresses and upload report image", async ({
  page,
  request,
}, testInfo) => {
  test.setTimeout(90_000);
  testInfo.annotations.push({
    type: "note",
    description: "Requires API on 127.0.0.1:3001 with migrations through 0008",
  });
  if (!(await apiIsHealthy(request))) {
    test.skip();
  }

  await registerOrgAdmin(page, `org-${Date.now()}`);

  await page.goto("/workspace/organization");
  await expect(page.getByRole("heading", { name: "Organization" })).toBeVisible();

  await page.getByLabel("Display name on reports").fill("E2E Test Co");
  await page.getByLabel("Shipping").fill("1 Ship St\nSydney");
  await page.getByLabel("Billing").fill("2 Bill Rd");
  await page.getByLabel("Correspondence / other").fill("PO Box 1");

  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
    "base64",
  );
  await page.getByLabel("Upload images").setInputFiles({
    name: "logo.png",
    mimeType: "image/png",
    buffer: png,
  });
  await expect(page.getByText("logo.png")).toBeVisible({ timeout: 10_000 });

  await page.waitForTimeout(1200);
  await page.reload();
  await expect(page.getByLabel("Display name on reports")).toHaveValue("E2E Test Co", {
    timeout: 10_000,
  });
  await expect(page.getByLabel("Shipping")).toHaveValue("1 Ship St\nSydney");
  await expect(page.getByText("logo.png")).toBeVisible();
});

test("RFQ report opens in new tab without auto-print script", async ({
  page,
  context,
  request,
}) => {
  test.setTimeout(90_000);
  if (!(await apiIsHealthy(request))) {
    test.skip();
  }

  await registerOrgAdmin(page, `rfq-${Date.now()}`);

  await page.goto("/workspace/organization");
  await page.getByLabel("Display name on reports").fill("Report Header Co");
  await page.getByLabel("Shipping").fill("Warehouse 9");
  await page.waitForTimeout(800);

  const procurementId = await seedPurchasingOrder(page);
  await page.goto(`/workspace/purchasing/${procurementId}`);

  const [reportPage] = await Promise.all([
    context.waitForEvent("page"),
    page.getByRole("button", { name: "RFQ / PO report" }).click(),
  ]);

  await reportPage.waitForLoadState("domcontentloaded");
  await expect(reportPage.getByText("Report Header Co")).toBeVisible({ timeout: 10_000 });
  await expect(reportPage.getByText("Warehouse 9")).toBeVisible();
  await expect(
    reportPage.getByRole("heading", { name: /Request for Quotation|Purchase Order/ }),
  ).toBeVisible();

  const html = await reportPage.content();
  expect(html).not.toMatch(/window\.print\s*\(/);
  expect(html).toContain("Save as PDF");
});
