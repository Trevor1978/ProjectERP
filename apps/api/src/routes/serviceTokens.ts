import { Hono } from "hono";
import { randomUUID } from "node:crypto";
import argon2 from "argon2";
import { and, desc, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import {
  db,
  apiAccessLog,
  apiAccessToken,
  user,
} from "@project-erp/db";
import { requireAuth, type AuthUser } from "../lib/session.js";
import { denyServiceAccount } from "../lib/serviceTokenMiddleware.js";
import {
  generateRawServiceToken,
  hashServiceToken,
  tokenPrefixFromRaw,
} from "../lib/serviceToken.js";
import {
  SERVICE_TOKEN_SCOPES,
  type ServiceTokenScope,
} from "../lib/serviceTokenScopes.js";
import { writeAudit } from "../lib/audit.js";

const createBody = z.object({
  name: z.string().min(1).max(120),
  scopes: z
    .array(z.enum(SERVICE_TOKEN_SCOPES))
    .min(1)
    .refine((s) => s.includes("work:read") || s.includes("work:write"), {
      message: "At least one work scope is required",
    }),
  expiresInDays: z.number().int().min(1).max(3650).optional(),
});

const app = new Hono();
app.use("/*", requireAuth, denyServiceAccount);

function requireOrgAdmin(a: AuthUser) {
  return a.globalRole === "org_admin";
}

function tokenDto(row: typeof apiAccessToken.$inferSelect) {
  let scopes: ServiceTokenScope[] = [];
  try {
    scopes = JSON.parse(row.scopes) as ServiceTokenScope[];
  } catch {
    scopes = [];
  }
  return {
    id: row.id,
    name: row.name,
    tokenPrefix: row.tokenPrefix,
    scopes,
    expiresAt: row.expiresAt?.toISOString() ?? null,
    revokedAt: row.revokedAt?.toISOString() ?? null,
    lastUsedAt: row.lastUsedAt?.toISOString() ?? null,
    serviceUserId: row.serviceUserId,
    createdAt: row.createdAt.toISOString(),
  };
}

app.get("/service-tokens", async (c) => {
  const a = c.get("auth") as AuthUser;
  if (!requireOrgAdmin(a)) {
    return c.json({ error: "Forbidden" }, 403);
  }
  const rows = await db
    .select()
    .from(apiAccessToken)
    .where(eq(apiAccessToken.organizationId, a.organizationId))
    .orderBy(desc(apiAccessToken.createdAt));
  return c.json({ tokens: rows.map(tokenDto) });
});

app.post("/service-tokens", async (c) => {
  const a = c.get("auth") as AuthUser;
  if (!requireOrgAdmin(a)) {
    return c.json({ error: "Forbidden" }, 403);
  }
  const parsed = createBody.safeParse(await c.req.json());
  if (!parsed.success) {
    return c.json({ error: parsed.error.flatten() }, 400);
  }
  const { name, scopes, expiresInDays } = parsed.data;
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 40);
  const serviceEmail = `service+${slug}-${randomUUID().slice(0, 8)}@projecterp.internal`;
  const passwordHash = await argon2.hash(randomUUID(), { type: argon2.argon2id });

  const rawToken = generateRawServiceToken();
  const tokenHash = hashServiceToken(rawToken);
  const expiresAt =
    expiresInDays !== undefined
      ? new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000)
      : null;

  const [serviceUser] = await db
    .insert(user)
    .values({
      organizationId: a.organizationId,
      email: serviceEmail,
      passwordHash,
      name: `Service: ${name}`,
      globalRole: "member",
      accountKind: "service",
      dailyDigestEmailEnabled: false,
    })
    .returning();

  if (!serviceUser) {
    return c.json({ error: "Failed to create service account" }, 500);
  }

  const [row] = await db
    .insert(apiAccessToken)
    .values({
      organizationId: a.organizationId,
      serviceUserId: serviceUser.id,
      name,
      tokenHash,
      tokenPrefix: tokenPrefixFromRaw(rawToken),
      scopes: JSON.stringify(scopes),
      expiresAt,
      createdById: a.id,
    })
    .returning();

  if (!row) {
    return c.json({ error: "Failed to create token" }, 500);
  }

  await writeAudit(
    a,
    "service_token.create",
    "api_access_token",
    row.id,
    { name, scopes, serviceUserId: serviceUser.id },
    name,
  );

  return c.json({
    token: tokenDto(row),
    /** Shown once — store securely; it cannot be retrieved again. */
    secret: rawToken,
  });
});

app.post("/service-tokens/:id/revoke", async (c) => {
  const a = c.get("auth") as AuthUser;
  if (!requireOrgAdmin(a)) {
    return c.json({ error: "Forbidden" }, 403);
  }
  const id = c.req.param("id");
  const [row] = await db
    .select()
    .from(apiAccessToken)
    .where(
      and(
        eq(apiAccessToken.id, id),
        eq(apiAccessToken.organizationId, a.organizationId),
      ),
    )
    .limit(1);
  if (!row) {
    return c.json({ error: "Not found" }, 404);
  }
  if (row.revokedAt) {
    return c.json({ token: tokenDto(row) });
  }
  const [updated] = await db
    .update(apiAccessToken)
    .set({ revokedAt: new Date() })
    .where(eq(apiAccessToken.id, id))
    .returning();
  await writeAudit(
    a,
    "service_token.revoke",
    "api_access_token",
    id,
    { name: row.name },
    row.name,
  );
  return c.json({ token: tokenDto(updated!) });
});

app.post("/service-tokens/:id/rotate", async (c) => {
  const a = c.get("auth") as AuthUser;
  if (!requireOrgAdmin(a)) {
    return c.json({ error: "Forbidden" }, 403);
  }
  const id = c.req.param("id");
  const [row] = await db
    .select()
    .from(apiAccessToken)
    .where(
      and(
        eq(apiAccessToken.id, id),
        eq(apiAccessToken.organizationId, a.organizationId),
        isNull(apiAccessToken.revokedAt),
      ),
    )
    .limit(1);
  if (!row) {
    return c.json({ error: "Not found" }, 404);
  }

  const rawToken = generateRawServiceToken();
  const tokenHash = hashServiceToken(rawToken);

  const [updated] = await db
    .update(apiAccessToken)
    .set({
      tokenHash,
      tokenPrefix: tokenPrefixFromRaw(rawToken),
      lastUsedAt: null,
    })
    .where(eq(apiAccessToken.id, id))
    .returning();

  await writeAudit(
    a,
    "service_token.rotate",
    "api_access_token",
    id,
    { name: row.name },
    row.name,
  );

  return c.json({
    token: tokenDto(updated!),
    secret: rawToken,
  });
});

app.get("/service-tokens/access-log", async (c) => {
  const a = c.get("auth") as AuthUser;
  if (!requireOrgAdmin(a)) {
    return c.json({ error: "Forbidden" }, 403);
  }
  const limit = Math.min(Number(c.req.query("limit")) || 100, 500);
  const offset = Number(c.req.query("offset")) || 0;
  const tokenId = c.req.query("tokenId");

  const conditions = [eq(apiAccessLog.organizationId, a.organizationId)];
  if (tokenId) {
    conditions.push(eq(apiAccessLog.tokenId, tokenId));
  }

  const rows = await db
    .select({
      id: apiAccessLog.id,
      tokenId: apiAccessLog.tokenId,
      serviceUserId: apiAccessLog.serviceUserId,
      method: apiAccessLog.method,
      path: apiAccessLog.path,
      statusCode: apiAccessLog.statusCode,
      entityType: apiAccessLog.entityType,
      entityId: apiAccessLog.entityId,
      sourceIp: apiAccessLog.sourceIp,
      createdAt: apiAccessLog.createdAt,
      tokenName: apiAccessToken.name,
    })
    .from(apiAccessLog)
    .innerJoin(apiAccessToken, eq(apiAccessLog.tokenId, apiAccessToken.id))
    .where(and(...conditions))
    .orderBy(desc(apiAccessLog.createdAt))
    .limit(limit)
    .offset(offset);

  return c.json({
    entries: rows.map((e) => ({
      id: e.id,
      tokenId: e.tokenId,
      tokenName: e.tokenName,
      serviceUserId: e.serviceUserId,
      method: e.method,
      path: e.path,
      statusCode: e.statusCode,
      entityType: e.entityType,
      entityId: e.entityId,
      sourceIp: e.sourceIp,
      createdAt: e.createdAt.toISOString(),
    })),
    limit,
    offset,
  });
});

export const serviceTokensApp = app;
