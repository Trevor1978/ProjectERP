import { db, auditLog } from "@project-erp/db";
import type { AuthUser } from "./session.js";

export async function writeAudit(
  actor: AuthUser,
  action: string,
  entityType: string,
  entityId: string,
  diff: Record<string, unknown> | null,
) {
  await db.insert(auditLog).values({
    organizationId: actor.organizationId,
    actorId: actor.id,
    action,
    entityType,
    entityId,
    diffJson: diff ? JSON.stringify(diff) : null,
  });
}
