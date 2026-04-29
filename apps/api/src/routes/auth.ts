import { Hono } from "hono";
import { randomUUID } from "node:crypto";
import argon2 from "argon2";
import { eq } from "drizzle-orm";
import { db, user, organization, session } from "@project-erp/db";
import { registerBody, loginBody } from "@project-erp/validators";
import {
  setSessionCookie,
  clearSessionCookie,
  sessionIdCreate,
  getSessionId,
} from "../lib/session.js";

function slugify(s: string) {
  return (
    s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "") || "org"
  );
}

const secureFromEnv = () => process.env.NODE_ENV === "production";

export const authApp = new Hono()
  .post("/register", async (c) => {
    const body = registerBody.safeParse(await c.req.json());
    if (!body.success) {
      return c.json({ error: body.error.flatten() }, 400);
    }
    const { email, password, name, organizationName } = body.data;
    const slug = `${slugify(organizationName)}-${randomUUID().slice(0, 8)}`;
    const existing = await db
      .select()
      .from(organization)
      .where(eq(organization.slug, slug));
    if (existing.length > 0) {
      return c.json({ error: "Try a different organization name" }, 409);
    }
    const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
    const [org] = await db
      .insert(organization)
      .values({ name: organizationName, slug })
      .returning();
    if (!org) {
      return c.json({ error: "Failed to create org" }, 500);
    }
    const [u] = await db
      .insert(user)
      .values({
        organizationId: org.id,
        email: email.toLowerCase(),
        passwordHash,
        name,
        globalRole: "org_admin",
      })
      .returning();
    if (!u) {
      return c.json({ error: "Failed to create user" }, 500);
    }
    const sid = sessionIdCreate();
    const expires = new Date();
    expires.setDate(expires.getDate() + 30);
    await db.insert(session).values({
      id: sid,
      userId: u.id,
      expiresAt: expires,
    });
    setSessionCookie(c, sid, secureFromEnv());
    return c.json({
      user: {
        id: u.id,
        email: u.email,
        name: u.name,
        organizationId: u.organizationId,
        globalRole: u.globalRole,
        org: { id: org.id, name: org.name, slug: org.slug },
      },
    });
  })
  .post("/login", async (c) => {
    const body = loginBody.safeParse(await c.req.json());
    if (!body.success) {
      return c.json({ error: body.error.flatten() }, 400);
    }
    const { email, password } = body.data;
    const rows = await db
      .select()
      .from(user)
      .where(eq(user.email, email.toLowerCase()));
    if (rows.length === 0) {
      return c.json({ error: "Invalid email or password" }, 401);
    }
    const u = rows[0]!;
    const ok = await argon2.verify(u.passwordHash, password);
    if (!ok) {
      return c.json({ error: "Invalid email or password" }, 401);
    }
    const org = await db
      .select()
      .from(organization)
      .where(eq(organization.id, u.organizationId));
    if (org.length === 0) {
      return c.json({ error: "Organization missing" }, 500);
    }
    const sid = sessionIdCreate();
    const expires = new Date();
    expires.setDate(expires.getDate() + 30);
    await db.insert(session).values({
      id: sid,
      userId: u.id,
      expiresAt: expires,
    });
    setSessionCookie(c, sid, secureFromEnv());
    return c.json({
      user: {
        id: u.id,
        email: u.email,
        name: u.name,
        organizationId: u.organizationId,
        globalRole: u.globalRole,
        org: {
          id: org[0]!.id,
          name: org[0]!.name,
          slug: org[0]!.slug,
        },
      },
    });
  })
  .post("/logout", async (c) => {
    const sid = getSessionId(c);
    if (sid) {
      await db.delete(session).where(eq(session.id, sid));
    }
    clearSessionCookie(c, secureFromEnv());
    return c.json({ ok: true });
  })
  .get("/me", (c) => {
    const a = c.get("auth");
    if (!a) {
      return c.json({ user: null });
    }
    return c.json({ user: a });
  });

export type AuthRoute = typeof authApp;
