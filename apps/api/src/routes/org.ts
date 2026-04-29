import { Hono } from "hono";
import { eq } from "drizzle-orm";
import argon2 from "argon2";
import { db, user } from "@project-erp/db";
import { z } from "zod";
import { requireAuth, type AuthUser } from "../lib/session.js";

const invite = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(128),
  name: z.string().min(1).max(255),
  globalRole: z.enum(["member", "org_admin"]).default("member"),
});

const app = new Hono();
app.use("/*", requireAuth);

app.get("/org/users", async (c) => {
  const a = c.get("auth") as AuthUser;
  if (a.globalRole !== "org_admin") {
    return c.json({ error: "Forbidden" }, 403);
  }
  const rows = await db
    .select({
      id: user.id,
      email: user.email,
      name: user.name,
      globalRole: user.globalRole,
      createdAt: user.createdAt,
    })
    .from(user)
    .where(eq(user.organizationId, a.organizationId));
  return c.json({ users: rows });
});

app.post("/org/users", async (c) => {
  const a = c.get("auth") as AuthUser;
  if (a.globalRole !== "org_admin") {
    return c.json({ error: "Forbidden" }, 403);
  }
  const p = invite.safeParse(await c.req.json());
  if (!p.success) {
    return c.json({ error: p.error.flatten() }, 400);
  }
  const exists = await db
    .select()
    .from(user)
    .where(eq(user.email, p.data.email.toLowerCase()));
  if (exists.length > 0) {
    return c.json({ error: "Email already registered" }, 409);
  }
  const passwordHash = await argon2.hash(p.data.password, { type: argon2.argon2id });
  const [u] = await db
    .insert(user)
    .values({
      organizationId: a.organizationId,
      email: p.data.email.toLowerCase(),
      name: p.data.name,
      passwordHash,
      globalRole: p.data.globalRole,
    })
    .returning({
      id: user.id,
      email: user.email,
      name: user.name,
      globalRole: user.globalRole,
    });
  return c.json({ user: u });
});

export const orgApp = app;
