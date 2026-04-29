import { test, expect, type APIRequestContext } from "@playwright/test";

async function apiIsHealthy(r: APIRequestContext) {
  try {
    const res = await r.get("http://127.0.0.1:3001/api/health");
    if (!res.ok()) {
      return false;
    }
    const j = (await res.json()) as { ok?: boolean };
    return j.ok === true;
  } catch {
    return false;
  }
}

test("login page is reachable and shows sign-in", async ({ page }) => {
  await page.goto("/login");
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Log in" }),
  ).toBeVisible();
});

test("register page shows form", async ({ page }) => {
  await page.goto("/register");
  await expect(
    page.getByRole("heading", { name: "Create organization" }),
  ).toBeVisible();
});

test("end-to-end: register, then land on home with projects heading", async ({
  page,
  request,
}, testInfo) => {
  test.setTimeout(60_000);
  if (!process.env.CI) {
    testInfo.annotations.push({
      type: "note",
      description:
        "Requires API on 127.0.0.1:3001; skipped automatically if health check fails",
    });
  }
  if (!(await apiIsHealthy(request))) {
    test.skip();
  }
  const id = `pw-${Date.now()}`;
  const email = `${id}@test.local`;
  const password = "playwright12";
  await page.goto("/register");
  await page.getByLabel("Organization").fill(`Org ${id}`);
  await page.getByLabel("Your name", { exact: true }).fill("Play Test User");
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Register" }).click();
  await expect(page.getByRole("heading", { name: "Projects" })).toBeVisible({
    timeout: 15_000,
  });
  await expect(page).toHaveURL("/");
  await expect(page.getByText("No projects yet")).toBeVisible();
});
