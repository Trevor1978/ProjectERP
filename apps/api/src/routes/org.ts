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
  await getOrCreateProfile(a.organizationId);
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
  if (userId === a.id && p.data.globalRole === "member") {
    return c.json(
      { error: "You cannot demote yourself from org admin" },
      400,
    );
  }
  const [updated] = await db
    .update(user)
    .set({
      name: p.data.name ?? rows[0]!.name,
      globalRole: p.data.globalRole ?? rows[0]!.globalRole,
      updatedAt: new Date(),
    })
    .where(eq(user.id, userId))
    .returning({
      id: user.id,
      email: user.email,
      name: user.name,
      globalRole: user.globalRole,
    });
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
