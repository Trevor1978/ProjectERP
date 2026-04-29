import { and, eq } from "drizzle-orm";
import { db, project, projectMember } from "@project-erp/db";
import type { AuthUser } from "./session.js";

type ProjectRow = typeof project.$inferSelect;

export async function getProjectForUser(
  auth: AuthUser,
  projectId: string,
): Promise<ProjectRow | null> {
  const p = await db
    .select()
    .from(project)
    .where(
      and(
        eq(project.id, projectId),
        eq(project.organizationId, auth.organizationId),
      ),
    );
  if (p.length === 0) return null;
  if (auth.globalRole === "org_admin") return p[0]!;

  const m = await db
    .select()
    .from(projectMember)
    .where(
      and(
        eq(projectMember.projectId, projectId),
        eq(projectMember.userId, auth.id),
      ),
    );
  if (m.length === 0) return null;
  return p[0]!;
}

export async function requireProject(
  auth: AuthUser,
  projectId: string,
): Promise<ProjectRow | { error: string; status: 404 }> {
  const p = await getProjectForUser(auth, projectId);
  if (!p) {
    return { error: "Project not found or forbidden", status: 404 as const };
  }
  return p;
}
