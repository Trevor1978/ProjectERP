import { Hono } from "hono";
import { eq, asc, and, count, max } from "drizzle-orm";
import argon2 from "argon2";
import {
  db,
  user,
  organizationProfile,
  organizationReportImage,
  project,
  projectMember,
} from "@project-erp/db";
import { z } from "zod";
import { writeAudit } from "../lib/audit.js";
import { requireAuth, type AuthUser } from "../lib/session.js";
import {
  deleteReportImageFile,
  isAllowedReportImageMime,
  MAX_REPORT_IMAGE_BYTES,
  readReportImage,
  saveReportImage,
} from "../lib/orgUploads.js";

const invite = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(128),
  name: z.string().min(1).max(255),
  globalRole: z.enum(["member", "org_admin"]).default("member"),
  /** When true (default), add the user to every existing project in the org. */
  addToAllProjects: z.boolean().default(true),
});

const userPatch = z.object({
  globalRole: z.enum(["member", "org_admin"]).optional(),
  name: z.string().min(1).max(255).optional(),
  dailyDigestEmailEnabled: z.boolean().optional(),
});

const profilePatch = z.object({
  displayName: z.string().max(255).nullable().optional(),
  shippingAddress: z.string().max(4000).optional(),
  billingAddress: z.string().max(4000).optional(),
  correspondenceAddress: z.string().max(4000).optional(),
  phone: z.string().max(64).optional(),
  email: z.string().max(255).optional(),
  website: z.string().max(255).optional(),
  taxId: z.string().max(64).optional(),
});

const imagePatch = z.object({
  sortOrder: z.number().int().min(0).optional(),
  includeOnReports: z.boolean().optional(),
});

const app = new Hono();
app.use("/*", requireAuth);

function requireOrgAdmin(a: AuthUser) {
  return a.globalRole === "org_admin";
}

async function addUserToAllOrgProjects(
  organizationId: string,
  userId: string,
  role: "viewer" | "member" | "pm" | "admin" = "member",
): Promise<number> {
  const projects = await db
    .select({ id: project.id })
    .from(project)
    .where(eq(project.organizationId, organizationId));
  if (projects.length === 0) return 0;
  let added = 0;
  for (const p of projects) {
    const [row] = await db
      .insert(projectMember)
      .values({ projectId: p.id, userId, role })
      .onConflictDoNothing({
        target: [projectMember.projectId, projectMember.userId],
      })
      .returning({ id: projectMember.id });
    if (row) added += 1;
  }
  return added;
}

async function getOrCreateProfile(organizationId: string) {
  const existing = await db
    .select()
    .from(organizationProfile)
    .where(eq(organizationProfile.organizationId, organizationId));
  if (existing[0]) return existing[0];
  const [row] = await db
    .insert(organizationProfile)
    .values({ organizationId })
    .returning();
  return row!;
}

function profileDto(
  row: typeof organizationProfile.$inferSelect,
  images: (typeof organizationReportImage.$inferSelect)[],
) {
  return {
    organizationId: row.organizationId,
    displayName: row.displayName,
    shippingAddress: row.shippingAddress,
    billingAddress: row.billingAddress,
    correspondenceAddress: row.correspondenceAddress,
    phone: row.phone,
    email: row.email,
    website: row.website,
    taxId: row.taxId,
    updatedAt: row.updatedAt,
    images: images.map((img) => ({
      id: img.id,
      fileName: img.fileName,
      mimeType: img.mimeType,
      sortOrder: img.sortOrder,
      includeOnReports: img.includeOnReports,
      createdAt: img.createdAt,
      url: `/api/org/report-images/${img.id}/file`,
    })),
  };
}

app.get("/org/profile", async (c) => {
  const a = c.get("auth") as AuthUser;
  const profile = await getOrCreateProfile(a.organizationId);
  const images = await db
    .select()
    .from(organizationReportImage)
    .where(eq(organizationReportImage.organizationId, a.organizationId))
    .orderBy(asc(organizationReportImage.sortOrder), asc(organizationReportImage.createdAt));
  return c.json({ profile: profileDto(profile, images) });
});

app.patch("/org/profile", async (c) => {
  const a = c.get("auth") as AuthUser;
  if (!requireOrgAdmin(a)) {
    return c.json({ error: "Forbidden" }, 403);
  }
  const p = profilePatch.safeParse(await c.req.json());
  if (!p.success) {
    return c.json({ error: p.error.flatten() }, 400);
  }
  const before = await getOrCreateProfile(a.organizationId);
  const patch = p.data;
  const [row] = await db
    .update(organizationProfile)
    .set({
      ...(patch.displayName !== undefined ? { displayName: patch.displayName } : {}),
      ...(patch.shippingAddress !== undefined ? { shippingAddress: patch.shippingAddress } : {}),
      ...(patch.billingAddress !== undefined ? { billingAddress: patch.billingAddress } : {}),
      ...(patch.correspondenceAddress !== undefined
        ? { correspondenceAddress: patch.correspondenceAddress }
        : {}),
      ...(patch.phone !== undefined ? { phone: patch.phone } : {}),
      ...(patch.email !== undefined ? { email: patch.email } : {}),
      ...(patch.website !== undefined ? { website: patch.website } : {}),
      ...(patch.taxId !== undefined ? { taxId: patch.taxId } : {}),
      updatedAt: new Date(),
    })
    .where(eq(organizationProfile.organizationId, a.organizationId))
    .returning();
  
  const diff: Record<string, unknown> = {};
  if (patch.displayName !== undefined && patch.displayName !== before.displayName) {
    diff.displayName = { before: before.displayName, after: patch.displayName };
  }
  if (patch.shippingAddress !== undefined && patch.shippingAddress !== before.shippingAddress) {
    diff.shippingAddress = { before: before.shippingAddress, after: patch.shippingAddress };
  }
  if (patch.billingAddress !== undefined && patch.billingAddress !== before.billingAddress) {
    diff.billingAddress = { before: before.billingAddress, after: patch.billingAddress };
  }
  if (patch.correspondenceAddress !== undefined && patch.correspondenceAddress !== before.correspondenceAddress) {
    diff.correspondenceAddress = { before: before.correspondenceAddress, after: patch.correspondenceAddress };
  }
  if (patch.phone !== undefined && patch.phone !== before.phone) {
    diff.phone = { before: before.phone, after: patch.phone };
  }
  if (patch.email !== undefined && patch.email !== before.email) {
    diff.email = { before: before.email, after: patch.email };
  }
  if (patch.website !== undefined && patch.website !== before.website) {
    diff.website = { before: before.website, after: patch.website };
  }
  if (patch.taxId !== undefined && patch.taxId !== before.taxId) {
    diff.taxId = { before: before.taxId, after: patch.taxId };
  }
  
  if (Object.keys(diff).length > 0) {
    const label = patch.displayName ?? before.displayName ?? "Organization";
    await writeAudit(a, "update", "organization_profile", a.organizationId, diff, label);
  }
  
  const images = await db
    .select()
    .from(organizationReportImage)
    .where(eq(organizationReportImage.organizationId, a.organizationId))
    .orderBy(asc(organizationReportImage.sortOrder), asc(organizationReportImage.createdAt));
  return c.json({ profile: profileDto(row!, images) });
});

app.post("/org/report-images", async (c) => {
  const a = c.get("auth") as AuthUser;
  if (!requireOrgAdmin(a)) {
    return c.json({ error: "Forbidden" }, 403);
  }
  const body = await c.req.parseBody();
  const file = body["file"];
  if (!(file instanceof File)) {
    return c.json({ error: "Expected multipart field \"file\" (image)" }, 400);
  }
  const mime = file.type || "application/octet-stream";
  if (!isAllowedReportImageMime(mime)) {
    return c.json({ error: "Unsupported image type (PNG, JPEG, WebP, or GIF)" }, 400);
  }
  const buf = Buffer.from(await file.arrayBuffer());
  if (buf.length === 0) {
    return c.json({ error: "Empty file" }, 400);
  }
  if (buf.length > MAX_REPORT_IMAGE_BYTES) {
    return c.json({ error: "Image too large (max 2MB)" }, 400);
  }

  const countRows = await db
    .select({ n: count() })
    .from(organizationReportImage)
    .where(eq(organizationReportImage.organizationId, a.organizationId));
  if ((countRows[0]?.n ?? 0) >= 10) {
    return c.json({ error: "Maximum 10 report images per organization" }, 400);
  }

  let storageName: string;
  try {
    storageName = await saveReportImage(a.organizationId, mime, buf);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return c.json({ error: msg }, 400);
  }

  const maxSort = await db
    .select({ m: max(organizationReportImage.sortOrder) })
    .from(organizationReportImage)
    .where(eq(organizationReportImage.organizationId, a.organizationId));

  const [img] = await db
    .insert(organizationReportImage)
    .values({
      organizationId: a.organizationId,
      fileName: file.name.slice(0, 255) || "image",
      storageName,
      mimeType: mime,
      sortOrder: (maxSort[0]?.m ?? -1) + 1,
    })
    .returning();

  await writeAudit(a, "create", "organization_report_image", img!.id, {
    fileName: { after: img!.fileName },
    mimeType: { after: img!.mimeType },
    sortOrder: { after: img!.sortOrder },
  }, img!.fileName);

  return c.json({
    image: {
      id: img!.id,
      fileName: img!.fileName,
      mimeType: img!.mimeType,
      sortOrder: img!.sortOrder,
      includeOnReports: img!.includeOnReports,
      createdAt: img!.createdAt,
      url: `/api/org/report-images/${img!.id}/file`,
    },
  });
});

app.patch("/org/report-images/:id", async (c) => {
  const a = c.get("auth") as AuthUser;
  if (!requireOrgAdmin(a)) {
    return c.json({ error: "Forbidden" }, 403);
  }
  const p = imagePatch.safeParse(await c.req.json());
  if (!p.success) {
    return c.json({ error: p.error.flatten() }, 400);
  }
  const id = c.req.param("id");
  const patchImg = p.data;
  
  const beforeRows = await db
    .select()
    .from(organizationReportImage)
    .where(
      and(
        eq(organizationReportImage.id, id),
        eq(organizationReportImage.organizationId, a.organizationId),
      ),
    );
  const before = beforeRows[0];
  if (!before) {
    return c.json({ error: "Not found" }, 404);
  }
  
  const [img] = await db
    .update(organizationReportImage)
    .set({
      ...(patchImg.sortOrder !== undefined ? { sortOrder: patchImg.sortOrder } : {}),
      ...(patchImg.includeOnReports !== undefined
        ? { includeOnReports: patchImg.includeOnReports }
        : {}),
    })
    .where(
      and(
        eq(organizationReportImage.id, id),
        eq(organizationReportImage.organizationId, a.organizationId),
      ),
    )
    .returning();
  if (!img) {
    return c.json({ error: "Not found" }, 404);
  }
  
  const diff: Record<string, unknown> = {};
  if (patchImg.sortOrder !== undefined && patchImg.sortOrder !== before.sortOrder) {
    diff.sortOrder = { before: before.sortOrder, after: patchImg.sortOrder };
  }
  if (patchImg.includeOnReports !== undefined && patchImg.includeOnReports !== before.includeOnReports) {
    diff.includeOnReports = { before: before.includeOnReports, after: patchImg.includeOnReports };
  }
  
  if (Object.keys(diff).length > 0) {
    await writeAudit(a, "update", "organization_report_image", id, diff, img.fileName);
  }
  
  return c.json({
    image: {
      id: img.id,
      fileName: img.fileName,
      mimeType: img.mimeType,
      sortOrder: img.sortOrder,
      includeOnReports: img.includeOnReports,
      createdAt: img.createdAt,
      url: `/api/org/report-images/${img.id}/file`,
    },
  });
});

app.delete("/org/report-images/:id", async (c) => {
  const a = c.get("auth") as AuthUser;
  if (!requireOrgAdmin(a)) {
    return c.json({ error: "Forbidden" }, 403);
  }
  const id = c.req.param("id");
  const rows = await db
    .select()
    .from(organizationReportImage)
    .where(eq(organizationReportImage.id, id));
  const img = rows[0];
  if (!img || img.organizationId !== a.organizationId) {
    return c.json({ error: "Not found" }, 404);
  }
  
  await writeAudit(a, "delete", "organization_report_image", id, {
    fileName: { before: img.fileName },
    mimeType: { before: img.mimeType },
    sortOrder: { before: img.sortOrder },
    includeOnReports: { before: img.includeOnReports },
  }, img.fileName);
  
  await deleteReportImageFile(a.organizationId, img.storageName);
  await db.delete(organizationReportImage).where(eq(organizationReportImage.id, id));
  return c.json({ ok: true });
});

app.get("/org/report-images/:id/file", async (c) => {
  const a = c.get("auth") as AuthUser;
  const id = c.req.param("id");
  const rows = await db
    .select()
    .from(organizationReportImage)
    .where(eq(organizationReportImage.id, id));
  const img = rows[0];
  if (!img || img.organizationId !== a.organizationId) {
    return c.json({ error: "Not found" }, 404);
  }
  try {
    const buf = await readReportImage(a.organizationId, img.storageName);
    return c.body(new Uint8Array(buf), 200, {
      "Content-Type": img.mimeType,
      "Cache-Control": "private, max-age=3600",
    });
  } catch {
    return c.json({ error: "File missing" }, 404);
  }
});

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
      dailyDigestEmailEnabled: user.dailyDigestEmailEnabled,
      createdAt: user.createdAt,
    })
    .from(user)
    .where(eq(user.organizationId, a.organizationId));

  const withCounts = await Promise.all(
    rows.map(async (u) => {
      const [mc] = await db
        .select({ n: count() })
        .from(projectMember)
        .where(eq(projectMember.userId, u.id));
      return { ...u, projectCount: Number(mc?.n ?? 0) };
    }),
  );
  return c.json({ users: withCounts });
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
  
  if (u) {
    await writeAudit(a, "create", "user", u.id, {
      email: { after: u.email },
      name: { after: u.name },
      globalRole: { after: u.globalRole },
    }, u.name || u.email);
  }
  
  let projectsAdded = 0;
  if (p.data.addToAllProjects && u) {
    projectsAdded = await addUserToAllOrgProjects(a.organizationId, u.id);
  }
  return c.json({ user: u, projectsAdded });
});

app.patch("/org/users/:userId", async (c) => {
  const a = c.get("auth") as AuthUser;
  if (a.globalRole !== "org_admin") {
    return c.json({ error: "Forbidden" }, 403);
  }
  const userId = c.req.param("userId");
  const p = userPatch.safeParse(await c.req.json());
  if (!p.success) {
    return c.json({ error: p.error.flatten() }, 400);
  }
  const rows = await db
    .select()
    .from(user)
    .where(and(eq(user.id, userId), eq(user.organizationId, a.organizationId)));
  if (rows.length === 0) {
    return c.json({ error: "Not found" }, 404);
  }
  const before = rows[0]!;
  if (userId === a.id && p.data.globalRole === "member") {
    return c.json(
      { error: "You cannot demote yourself from org admin" },
      400,
    );
  }
  const [updated] = await db
    .update(user)
    .set({
      name: p.data.name ?? before.name,
      globalRole: p.data.globalRole ?? before.globalRole,
      dailyDigestEmailEnabled:
        p.data.dailyDigestEmailEnabled ?? before.dailyDigestEmailEnabled,
      updatedAt: new Date(),
    })
    .where(eq(user.id, userId))
    .returning({
      id: user.id,
      email: user.email,
      name: user.name,
      globalRole: user.globalRole,
      dailyDigestEmailEnabled: user.dailyDigestEmailEnabled,
    });

  const diff: Record<string, unknown> = {};
  if (p.data.name !== undefined && p.data.name !== before.name) {
    diff.name = { before: before.name, after: p.data.name };
  }
  if (p.data.globalRole !== undefined && p.data.globalRole !== before.globalRole) {
    diff.globalRole = { before: before.globalRole, after: p.data.globalRole };
  }
  if (
    p.data.dailyDigestEmailEnabled !== undefined &&
    p.data.dailyDigestEmailEnabled !== before.dailyDigestEmailEnabled
  ) {
    diff.dailyDigestEmailEnabled = {
      before: before.dailyDigestEmailEnabled,
      after: p.data.dailyDigestEmailEnabled,
    };
  }

  if (Object.keys(diff).length > 0) {
    await writeAudit(
      a,
      "update",
      "user",
      userId,
      diff,
      updated.name || before.name || before.email,
    );
  }

  return c.json({ user: updated });
});

app.post("/org/users/:userId/grant-all-projects", async (c) => {
  const a = c.get("auth") as AuthUser;
  if (a.globalRole !== "org_admin") {
    return c.json({ error: "Forbidden" }, 403);
  }
  const userId = c.req.param("userId");
  const rows = await db
    .select({ id: user.id })
    .from(user)
    .where(and(eq(user.id, userId), eq(user.organizationId, a.organizationId)));
  if (rows.length === 0) {
    return c.json({ error: "Not found" }, 404);
  }
  const projectsAdded = await addUserToAllOrgProjects(a.organizationId, userId);
  const [mc] = await db
    .select({ n: count() })
    .from(projectMember)
    .where(eq(projectMember.userId, userId));
  return c.json({
    ok: true,
    projectsAdded,
    projectCount: Number(mc?.n ?? 0),
  });
});

export const orgApp = app;
