import { test, expect, type APIRequestContext } from "@playwright/test";

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

test.describe("web push", () => {
  test.beforeEach(async ({ context }) => {
    await context.grantPermissions(["notifications"], {
      origin: "http://127.0.0.1:5173",
    });
  });

  test("public push config is available", async ({ request }, testInfo) => {
    if (!(await apiIsHealthy(request))) {
      testInfo.skip();
    }
    const res = await request.get("http://127.0.0.1:3001/api/push/config");
    expect(res.ok()).toBeTruthy();
    const body = (await res.json()) as {
      enabled: boolean;
      publicKey: string | null;
    };
    expect(body.enabled).toBe(true);
    expect(body.publicKey).toBeTruthy();
  });

  test("profile flow: enable push and send test notification", async ({
    page,
    context,
    request,
  }, testInfo) => {
    test.setTimeout(90_000);
    if (!(await apiIsHealthy(request))) {
      testInfo.skip();
    }

    // Real browser push subscribe is unreliable in automated Chromium (headed or headless).
    test.skip(
      !process.env.PUSH_E2E,
      "Set PUSH_E2E=1 to run the full browser push flow on a real device/browser",
    );

    await context.grantPermissions(["notifications"], {
      origin: "http://127.0.0.1:5173",
    });

    const id = `push-${Date.now()}`;
    const email = `${id}@test.local`;
    const password = "playwright12";

    await page.goto("/register");
    await page.getByLabel("Organization").fill(`Org ${id}`);
    await page.getByLabel("Your name", { exact: true }).fill("Push Test User");
    await page.getByLabel("Email", { exact: true }).fill(email);
    await page.getByLabel("Password", { exact: true }).fill(password);
    await page.getByRole("button", { name: "Register" }).click();
    await expect(page).toHaveURL("/", { timeout: 15_000 });

    await page.goto("/profile");
    await expect(
      page.getByRole("heading", { name: "Phone notifications" }),
    ).toBeVisible();

    const enableButton = page.getByRole("button", {
      name: "Enable on this device",
    });
    await expect(enableButton).toBeVisible();
    await enableButton.click();

    await expect(
      page.getByText("Push notifications enabled on this device."),
    ).toBeVisible({ timeout: 15_000 });

    const hasSubscription = await page.evaluate(async () => {
      const registration = await navigator.serviceWorker.getRegistration();
      const subscription = await registration?.pushManager.getSubscription();
      return Boolean(subscription?.endpoint);
    });
    expect(hasSubscription).toBe(true);

    const testButton = page.getByRole("button", {
      name: "Send test notification",
    });
    await expect(testButton).toBeEnabled();
    await testButton.click();

    await expect(
      page.getByText(/Test push sent to \d+ device/),
    ).toBeVisible({ timeout: 15_000 });
  });
});
