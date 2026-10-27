import {
  createHash,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";
import {
  db,
  apiAccessToken,
  organization,
  user,
} from "@project-erp/db";
import type { AuthUser } from "./session.js";
import {
  parseScopes,
  type ServiceTokenScope,
} from "./serviceTokenScopes.js";

export const TOKEN_PREFIX = "pe_at_";
const TOKEN_SECRET_BYTES = 32;

export type ServiceTokenAuth = {
  tokenId: string;
  scopes: ServiceTokenScope[];
};

export function hashServiceToken(raw: string): string {
  return createHash("sha256").update(raw, "utf8").digest("hex");
}

export function tokenPrefixFromRaw(raw: string): string {
  return raw.slice(0, Math.min(12, raw.length));
}

export function generateRawServiceToken(): string {
  return `${TOKEN_PREFIX}${randomBytes(TOKEN_SECRET_BYTES).toString("base64url")}`;
}

export function verifyTokenHash(raw: string, storedHash: string): boolean {
  const computed = hashServiceToken(raw);
  try {
    const a = Buffer.from(computed, "hex");
    const b = Buffer.from(storedHash, "hex");
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

function parseBearer(c: {
  req: { header: (name: string) => string | undefined };
}): string | null {
  const auth = c.req.header("Authorization")?.trim() ?? "";
  if (!auth.toLowerCase().startsWith("bearer ")) return null;
  const token = auth.slice(7).trim();
  return token.length > 0 ? token : null;
}

export function isServiceTokenFormat(raw: string): boolean {
  return raw.startsWith(TOKEN_PREFIX);
}

/** In-memory rate limit: max requests per token per window (single API process). */
const RATE_WINDOW_MS = 60_000;
const RATE_MAX = 300;
const rateBuckets = new Map<string, { count: number; windowStart: number }>();

export function checkServiceTokenRateLimit(tokenId: string): boolean {
  const now = Date.now();
  const cur = rateBuckets.get(tokenId);
  if (!cur || now - cur.windowStart >= RATE_WINDOW_MS) {
    rateBuckets.set(tokenId, { count: 1, windowStart: now });
    return true;
  }
  if (cur.count >= RATE_MAX) return false;
  cur.count += 1;
  return true;
}

export async function authenticateServiceToken(
  raw: string,
): Promise<
  | {
      auth: AuthUser;
      serviceToken: ServiceTokenAuth;
    }
  | { error: "invalid" | "expired" | "revoked" | "rate_limited" }
> {
  if (!isServiceTokenFormat(raw)) {
    return { error: "invalid" };
  }

  const hash = hashServiceToken(raw);
  const rows = await db
    .select({
      token: apiAccessToken,
      serviceUser: user,
      org: organization,
    })
    .from(apiAccessToken)
    .innerJoin(user, eq(apiAccessToken.serviceUserId, user.id))
    .innerJoin(organization, eq(apiAccessToken.organizationId, organization.id))
    .where(
      and(
        eq(apiAccessToken.tokenHash, hash),
        isNull(apiAccessToken.revokedAt),
      ),
    )
    .limit(1);

  if (rows.length === 0) {
    return { error: "invalid" };
  }

  const { token, serviceUser, org } = rows[0]!;
  if (!verifyTokenHash(raw, token.tokenHash)) {
    return { error: "invalid" };
  }
  if (serviceUser.accountKind !== "service") {
    return { error: "invalid" };
  }
  if (token.expiresAt && token.expiresAt.getTime() <= Date.now()) {
    return { error: "expired" };
  }

  if (!checkServiceTokenRateLimit(token.id)) {
    return { error: "rate_limited" };
  }

  const scopes = parseScopes(token.scopes);

  await db
    .update(apiAccessToken)
    .set({ lastUsedAt: new Date() })
    .where(eq(apiAccessToken.id, token.id));

  const auth: AuthUser = {
    id: serviceUser.id,
    email: serviceUser.email,
    name: serviceUser.name,
    organizationId: serviceUser.organizationId,
    globalRole: "member",
    dailyDigestEmailEnabled: false,
    accountKind: "service",
    org: { id: org.id, name: org.name, slug: org.slug },
  };

  return {
    auth,
    serviceToken: { tokenId: token.id, scopes },
  };
}

export function getBearerToken(c: {
  req: { header: (name: string) => string | undefined };
}): string | null {
  return parseBearer(c);
}
