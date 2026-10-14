import { db, auditLog } from "@project-erp/db";
import type { AuthUser } from "./session.js";

export async function writeAudit(
  actor: AuthUser,
  action: string,
  entityType: string,
  entityId: string,
  diff: Record<string, unknown> | null,
  entityLabel?: string | null,
) {
  try {
    await db.insert(auditLog).values({
      organizationId: actor.organizationId,
      actorId: actor.id,
      action,
      entityType,
      entityId,
      entityLabel: entityLabel ?? null,
      diffJson: diff ? JSON.stringify(diff) : null,
    });
  } catch (error) {
    console.error("[AUDIT] Failed to write audit log entry:", {
      error: error instanceof Error ? error.message : String(error),
      entityType,
      entityId,
      action,
    });
  }
}
