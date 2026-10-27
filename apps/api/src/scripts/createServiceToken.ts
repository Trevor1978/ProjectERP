/**
 * Create a service API token (org admin CLI).
 *
 * Usage (from repo root, with DATABASE_URL set):
 *   pnpm --filter @project-erp/api exec tsx src/scripts/createServiceToken.ts \
 *     --org-email admin@example.com \
 *     --name "Automation bot" \
 *     --scopes work:read,work:write \
 *     [--expires-days 90]
 */
import argon2 from "argon2";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { db, apiAccessToken, organization, user } from "@project-erp/db";
import {
  generateRawServiceToken,
  hashServiceToken,
  tokenPrefixFromRaw,
} from "../lib/serviceToken.js";
import {
  SERVICE_TOKEN_SCOPES,
  type ServiceTokenScope,
} from "../lib/serviceTokenScopes.js";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  if (i === -1 || i === process.argv.length - 1) return undefined;
  return process.argv[i + 1];
}

async function main() {
  const orgEmail = arg("--org-email")?.trim().toLowerCase();
  const name = arg("--name")?.trim();
  const scopesRaw = arg("--scopes") ?? "work:read,work:write";
  const expiresDays = arg("--expires-days");

  if (!orgEmail || !name) {
    console.error(
      "Usage: createServiceToken.ts --org-email <admin@example.com> --name <label> [--scopes work:read,work:write] [--expires-days 90]",
    );
    process.exit(1);
  }

  const scopes = scopesRaw
    .split(",")
    .map((s) => s.trim())
    .filter((s): s is ServiceTokenScope =>
      (SERVICE_TOKEN_SCOPES as readonly string[]).includes(s),
    );
  if (scopes.length === 0) {
    console.error(`Invalid scopes. Allowed: ${SERVICE_TOKEN_SCOPES.join(", ")}`);
    process.exit(1);
  }

  const admins = await db
    .select({ admin: user, org: organization })
    .from(user)
    .innerJoin(organization, eq(user.organizationId, organization.id))
    .where(eq(user.email, orgEmail))
    .limit(1);

  if (admins.length === 0) {
    console.error("No user found with that email");
    process.exit(1);
  }
  const { admin, org } = admins[0]!;
  if (admin.globalRole !== "org_admin") {
    console.error("User must be an org admin");
    process.exit(1);
  }
  if (admin.accountKind === "service") {
    console.error("Cannot use a service account to create tokens");
    process.exit(1);
  }

  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .slice(0, 40);
  const serviceEmail = `service+${slug}-${randomUUID().slice(0, 8)}@projecterp.internal`;
  const passwordHash = await argon2.hash(randomUUID(), { type: argon2.argon2id });
  const rawToken = generateRawServiceToken();
  const tokenHash = hashServiceToken(rawToken);
  const expiresAt =
    expiresDays !== undefined
      ? new Date(Date.now() + Number(expiresDays) * 24 * 60 * 60 * 1000)
      : null;

  const [serviceUser] = await db
    .insert(user)
    .values({
      organizationId: org.id,
      email: serviceEmail,
      passwordHash,
      name: `Service: ${name}`,
      globalRole: "member",
      accountKind: "service",
      dailyDigestEmailEnabled: false,
    })
    .returning();

  const [row] = await db
    .insert(apiAccessToken)
    .values({
      organizationId: org.id,
      serviceUserId: serviceUser!.id,
      name,
      tokenHash,
      tokenPrefix: tokenPrefixFromRaw(rawToken),
      scopes: JSON.stringify(scopes),
      expiresAt,
      createdById: admin.id,
    })
    .returning();

  console.log(JSON.stringify({
    ok: true,
    organization: org.name,
    tokenId: row!.id,
    serviceUserId: serviceUser!.id,
    tokenPrefix: row!.tokenPrefix,
    scopes,
    expiresAt: expiresAt?.toISOString() ?? null,
    secret: rawToken,
  }, null, 2));
  console.error("\nStore the secret securely. It will not be shown again.\n");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
