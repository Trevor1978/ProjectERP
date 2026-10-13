import { Hono } from "hono";
import { db } from "@project-erp/db";
import { auditLog, user } from "@project-erp/db/schema";
import { and, eq, desc, gte, lte, sql } from "drizzle-orm";
import { requireAuth } from "../lib/session.js";

export const auditApp = new Hono();

auditApp.use("/*", requireAuth);

/**
 * GET /api/audit/history
 * Fetch audit history for the organization with optional filters.
 * Query params:
 * - entityType: filter by entity type
 * - entityId: filter by specific entity
 * - userId: filter by user
 * - action: filter by action (create/update/delete)
 * - startDate: filter from date (ISO)
 * - endDate: filter to date (ISO)
 * - limit: max results (default 100)
 * - offset: pagination offset
 */
auditApp.get("/audit/history", async (c) => {
  const reqUser = c.get("user");
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
  if (action && (action === "create" || action === "update" || action === "delete")) {
    conditions.push(eq(auditLog.action, action));
  }
  if (startDate) {
    conditions.push(gte(auditLog.createdAt, new Date(startDate)));
  }
  if (endDate) {
    conditions.push(lte(auditLog.createdAt, new Date(endDate)));
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
    entries: entries.map((e) => ({
      ...e,
      diff: e.diffJson ? JSON.parse(e.diffJson) : null,
      diffJson: undefined,
    })),
    total: total[0]?.count ?? 0,
    limit,
    offset,
  });
});

/**
 * GET /api/audit/entity/:entityType/:entityId
 * Fetch audit history for a specific entity.
 */
auditApp.get("/audit/entity/:entityType/:entityId", async (c) => {
  const reqUser = c.get("user");
  if (!reqUser) return c.json({ error: "Unauthorized" }, 401);

  const entityType = c.req.param("entityType");
  const entityId = c.req.param("entityId");

  const entries = await db
    .select({
      id: auditLog.id,
      actorId: auditLog.actorId,
      actorName: user.name,
      action: auditLog.action,
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
    entries: entries.map((e) => ({
      ...e,
      diff: e.diffJson ? JSON.parse(e.diffJson) : null,
      diffJson: undefined,
    })),
  });
});
