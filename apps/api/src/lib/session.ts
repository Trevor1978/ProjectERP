import { getCookie, setCookie } from "hono/cookie";
import { randomBytes } from "node:crypto";
import type { Context, MiddlewareHandler } from "hono";
import { eq, and, gt } from "drizzle-orm";
import { db, session, user, organization } from "@project-erp/db";

type UserRow = typeof user.$inferSelect;

const SESSION_DAYS = 30;
const COOKIE = "pe_session";

export type AuthUser = {
  id: string;
  email: string;
  name: string;
  organizationId: string;
  globalRole: "member" | "org_admin";
  org: { id: string; name: string; slug: string };
};

export function sessionIdCreate(): string {
  return randomBytes(32).toString("hex");
}

export function sessionCookieOptions(secure: boolean) {
  return {
    path: "/",
    httpOnly: true,
    maxAge: SESSION_DAYS * 24 * 60 * 60,
    sameSite: "Lax" as const,
    secure,
  };
}

export function setSessionCookie(
  c: Context,
  sessionId: string,
  secure: boolean,
) {
  setCookie(c, COOKIE, sessionId, sessionCookieOptions(secure));
}

export function clearSessionCookie(c: Context, secure: boolean) {
  setCookie(c, COOKIE, "", { ...sessionCookieOptions(secure), maxAge: 0 });
}

export function getSessionId(c: Context): string | undefined {
  return getCookie(c, COOKIE) ?? undefined;
}

export const authMiddleware: MiddlewareHandler = async (c, next) => {
  const id = getSessionId(c);
  c.set("auth", null);
  if (!id) {
    await next();
    return;
  }
  const rows = await db
    .select()
    .from(session)
    .where(and(eq(session.id, id), gt(session.expiresAt, new Date())));
  if (rows.length === 0) {
    await next();
    return;
  }
  const u = await db
    .select()
    .from(user)
    .where(eq(user.id, rows[0]!.userId));
  if (u.length === 0) {
    await next();
    return;
  }
  const o = await db
    .select()
    .from(organization)
    .where(eq(organization.id, u[0]!.organizationId));
  if (o.length === 0) {
    await next();
    return;
  }
  const uu = u[0]! as UserRow;
  c.set("auth", {
    id: uu.id,
    email: uu.email,
    name: uu.name,
    organizationId: uu.organizationId,
    globalRole: uu.globalRole,
    org: {
      id: o[0]!.id,
      name: o[0]!.name,
      slug: o[0]!.slug,
    },
  } satisfies AuthUser);
  await next();
};

export const requireAuth: MiddlewareHandler = async (c, next) => {
  const a = c.get("auth");
  if (!a) {
    return c.json({ error: "Unauthorized" }, 401);
  }
  await next();
};
