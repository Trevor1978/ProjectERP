import { Hono } from "hono";
import { db, auditLog, user } from "@project-erp/db";
import { and, eq, desc, gte, lte, or, sql } from "drizzle-orm";
import { requireAuth, type AuthUser } from "../lib/session.js";
import { denyServiceAccount } from "../lib/serviceTokenMiddleware.js";
import { auditEntryDto } from "../lib/auditNormalize.js";

export const auditApp = new Hono();

auditApp.use("/*", requireAuth, denyServiceAccount);

/**
 * GET /api/audit/history
 * Fetch audit history for the organization with optional filters.
 */
auditApp.get("/audit/history", async (c) => {
  const reqUser = c.get("auth") as AuthUser;
  if (!reqUser) return c.json({ error: "Unauthorized" }, 401);

  const entityType = c.req.query("entityType");
  const entityId = c.req.query("entityId");
  const filterUserId = c.req.query("userId");
  const action = c.req.query("action");
  const startDate = c.req.query("startDate");
  const endDate = c.req.query("endDate");
  const limit = Number(c.req.query("limit")) || 100;
  const offset = Number(c.req.query("offset")) || 0;

  const conditions = [eq(auditLog.organizationId, reqUser.organizationId)];

  if (entityType) {
    conditions.push(eq(auditLog.entityType, entityType));
  }
  if (entityId) {
    conditions.push(eq(auditLog.entityId, entityId));
  }
  if (filterUserId) {
    conditions.push(eq(auditLog.actorId, filterUserId));
  }
  if (action === "create" || action === "delete" || action === "update") {
    conditions.push(
      or(eq(auditLog.action, action), sql`${auditLog.action} LIKE ${`%.${action}`}`)!,
    );
  }
  if (startDate) {
    const d = new Date(startDate);
    if (!Number.isNaN(d.getTime())) {
      conditions.push(gte(auditLog.createdAt, d));
    }
  }
  if (endDate) {
    const d = new Date(endDate);
    if (!Number.isNaN(d.getTime())) {
      conditions.push(lte(auditLog.createdAt, d));
    }
  }

  const entries = await db
    .select({
      id: auditLog.id,
      actorId: auditLog.actorId,
      actorName: user.name,
      action: auditLog.action,
      entityType: auditLog.entityType,
      entityId: auditLog.entityId,
      entityLabel: auditLog.entityLabel,
      diffJson: auditLog.diffJson,
      createdAt: auditLog.createdAt,
    })
    .from(auditLog)
    .leftJoin(user, eq(auditLog.actorId, user.id))
    .where(and(...conditions))
    .orderBy(desc(auditLog.createdAt))
    .limit(limit)
    .offset(offset);

  const total = await db
    .select({ count: sql<number>`count(*)` })
    .from(auditLog)
    .where(and(...conditions));

  return c.json({
    entries: entries.map((e) => auditEntryDto(e)),
    total: Number(total[0]?.count ?? 0),
    limit,
    offset,
  });
});

/**
 * GET /api/audit/entity/:entityType/:entityId
 * Fetch audit history for a specific entity.
 */
auditApp.get("/audit/entity/:entityType/:entityId", async (c) => {
  const reqUser = c.get("auth") as AuthUser;
  if (!reqUser) return c.json({ error: "Unauthorized" }, 401);

  const entityType = c.req.param("entityType");
  const entityId = c.req.param("entityId");

  const entries = await db
    .select({
      id: auditLog.id,
      actorId: auditLog.actorId,
      actorName: user.name,
      action: auditLog.action,
      entityType: auditLog.entityType,
      entityId: auditLog.entityId,
      entityLabel: auditLog.entityLabel,
      diffJson: auditLog.diffJson,
      createdAt: auditLog.createdAt,
    })
    .from(auditLog)
    .leftJoin(user, eq(auditLog.actorId, user.id))
    .where(
      and(
        eq(auditLog.organizationId, reqUser.organizationId),
        eq(auditLog.entityType, entityType),
        eq(auditLog.entityId, entityId),
      ),
    )
    .orderBy(desc(auditLog.createdAt));

  return c.json({
    entries: entries.map((e) => auditEntryDto(e)),
  });
});
