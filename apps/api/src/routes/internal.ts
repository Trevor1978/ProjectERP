import { Hono } from "hono";
import { runDigests } from "../lib/runDigests.js";

const app = new Hono();

function cronAuthorized(c: {
  req: { header: (name: string) => string | undefined };
}): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return false;
  const auth = c.req.header("Authorization") ?? "";
  return auth === `Bearer ${secret}`;
}

/**
 * Manual / Coolify cron trigger.
 * Authorization: Bearer ${CRON_SECRET}
 * ?force=1 skips digest_run idempotency (still requires secret).
 */
app.post("/digests/run", async (c) => {
  if (!cronAuthorized(c)) {
    return c.json({ error: "Unauthorized" }, 401);
  }
  if (!process.env.CRON_SECRET?.trim()) {
    return c.json({ error: "CRON_SECRET is not configured" }, 503);
  }
  const force =
    c.req.query("force") === "1" || c.req.query("force") === "true";
  try {
    const result = await runDigests({ force });
    return c.json({ ok: true, result });
  } catch (e) {
    console.error("[digest] manual run failed:", e);
    return c.json(
      { error: e instanceof Error ? e.message : "Digest run failed" },
      500,
    );
  }
});

export { app as internalApp };
