import { and, eq } from "drizzle-orm";
import { asset, db } from "@project-erp/db";
import type { AuthUser } from "./session.js";

/** Ensure asset exists in the caller's organization (for linking work items). */
export async function requireOrgAsset(
  a: AuthUser,
  assetId: string,
): Promise<{ ok: true } | { ok: false; status: 400 | 404; error: string }> {
  const rows = await db
    .select({ id: asset.id })
    .from(asset)
    .where(
      and(eq(asset.id, assetId), eq(asset.organizationId, a.organizationId)),
    );
  if (rows.length === 0) {
    return { ok: false, status: 404, error: "Machine not found" };
  }
  return { ok: true };
}

/** Effective machine for a todo: explicit todo link, else parent task link. */
export function effectiveTodoAssetId(
  todoAssetId: string | null,
  taskAssetId: string | null,
): string | null {
  return todoAssetId ?? taskAssetId;
}
