import type { MiddlewareHandler } from "hono";
import { db, apiAccessLog } from "@project-erp/db";
import {
  authenticateServiceToken,
  getBearerToken,
  isServiceTokenFormat,
} from "./serviceToken.js";
import type { AuthUser } from "./session.js";
import {
  inferAccessLogEntity,
  scopesInclude,
  serviceTokenAllowsWorkRoute,
} from "./serviceTokenScopes.js";

/** Reject automation tokens on routes that must stay human/session-only. */
export const denyServiceAccount: MiddlewareHandler = async (c, next) => {
  const a = c.get("auth") as AuthUser | null;
  if (a?.accountKind === "service") {
    return c.json({ error: "Forbidden" }, 403);
  }
  await next();
};

/** Enforce work scopes and route allowlist for service tokens on /api work routes. */
export const enforceServiceWorkScopes: MiddlewareHandler = async (c, next) => {
  const a = c.get("auth") as AuthUser | null;
  if (!a || a.accountKind !== "service") {
    await next();
    return;
  }
  const st = c.get("serviceToken");
  if (!st) {
    return c.json({ error: "Unauthorized" }, 401);
  }
  const path = c.req.path;
  const method = c.req.method;
  const gate = serviceTokenAllowsWorkRoute(method, path);
  if (!gate.allowed || !gate.requiredScope) {
    return c.json({ error: "Forbidden" }, 403);
  }
  if (!scopesInclude(st.scopes, gate.requiredScope)) {
    return c.json({ error: "Forbidden" }, 403);
  }
  await next();
};

function clientIp(c: {
  req: { header: (name: string) => string | undefined };
}): string | null {
  const forwarded = c.req.header("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  const realIp = c.req.header("x-real-ip")?.trim();
  return realIp || null;
}

/** Log each request made with a service token (after response). */
export const serviceTokenAccessLogMiddleware: MiddlewareHandler = async (
  c,
  next,
) => {
  const bearer = getBearerToken(c);
  const isService = bearer && isServiceTokenFormat(bearer);
  await next();
  if (!isService) return;
  const a = c.get("auth") as AuthUser | null;
  const st = c.get("serviceToken");
  if (!a || a.accountKind !== "service" || !st) return;

  const path = c.req.path;
  const { entityType, entityId } = inferAccessLogEntity(path);
  try {
    await db.insert(apiAccessLog).values({
      organizationId: a.organizationId,
      tokenId: st.tokenId,
      serviceUserId: a.id,
      method: c.req.method,
      path,
      statusCode: c.res.status,
      entityType,
      entityId,
      sourceIp: clientIp(c),
    });
  } catch (e) {
    console.error("[service-token] access log failed:", e);
  }
};
