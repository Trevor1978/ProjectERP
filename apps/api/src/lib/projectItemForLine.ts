import { and, eq } from "drizzle-orm";
import { db, projectItem } from "@project-erp/db";
import type { AuthUser } from "./session.js";
import { requireProject } from "./projectAccess.js";

type LineInput = {
  projectId: string;
  projectItemId?: string | null;
  partNumber?: string | null;
  description: string;
  quantity: string;
  unit?: string | null;
  createProjectItem?: boolean;
};

export async function resolveProjectItemIdForLine(
  a: AuthUser,
  input: LineInput,
): Promise<{ ok: true; projectItemId: string | null } | { ok: false; error: string; status: number }> {
  const pr = await requireProject(a, input.projectId);
  if ("error" in pr) {
    return { ok: false, error: pr.error, status: pr.status };
  }

  if (input.projectItemId) {
    const items = await db
      .select()
      .from(projectItem)
      .where(
        and(
          eq(projectItem.id, input.projectItemId),
          eq(projectItem.projectId, input.projectId),
        ),
      );
    if (items.length === 0) {
      return { ok: false, error: "Project item not found for this project", status: 400 };
    }
    return { ok: true, projectItemId: input.projectItemId };
  }

  if (input.createProjectItem === false) {
    return { ok: true, projectItemId: null };
  }

  const [created] = await db
    .insert(projectItem)
    .values({
      projectId: input.projectId,
      kind: "hardware",
      partNumber: input.partNumber ?? null,
      description: input.description,
      quantity: input.quantity,
      unit: input.unit ?? null,
      status: "specified",
    })
    .returning({ id: projectItem.id });

  return { ok: true, projectItemId: created?.id ?? null };
}
