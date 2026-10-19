export type NormalizedAuditAction = "create" | "update" | "delete";

export function normalizeAuditAction(action: string): NormalizedAuditAction {
  const a = action.trim().toLowerCase();
  if (a === "delete" || a.endsWith(".delete")) return "delete";
  if (a === "create" || a.endsWith(".create")) return "create";
  return "update";
}

export function parseAuditDiffJson(diffJson: string | null): Record<string, unknown> | null {
  if (!diffJson) return null;
  try {
    const parsed = JSON.parse(diffJson) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
    return null;
  } catch {
    return null;
  }
}

export type AuditFieldChange = { before: unknown; after: unknown };

/** Flatten legacy and new diff shapes for API consumers. */
export function extractAuditFieldChanges(
  diff: Record<string, unknown> | null,
  action: NormalizedAuditAction,
): AuditFieldChange[] {
  if (!diff) return [];

  if (action === "create") {
    const skip = new Set(["fields", "created", "deleted"]);
    return Object.entries(diff)
      .filter(([key]) => !skip.has(key))
      .map(([field, value]) => ({ field, before: null, after: value }));
  }

  if (action !== "update") return [];

  const rawFields = diff.fields;
  if (rawFields && typeof rawFields === "object" && !Array.isArray(rawFields)) {
    return Object.entries(rawFields as Record<string, unknown>).map(([field, value]) =>
      normalizeFieldChange(field, value),
    );
  }

  const skip = new Set(["fields", "created", "deleted"]);
  return Object.entries(diff)
    .filter(([key]) => !skip.has(key))
    .map(([field, value]) => normalizeFieldChange(field, value));
}

function normalizeFieldChange(field: string, value: unknown): AuditFieldChange {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const obj = value as Record<string, unknown>;
    if ("before" in obj || "after" in obj) {
      return { before: obj.before ?? null, after: obj.after ?? null };
    }
  }
  return { before: null, after: value };
}

export function auditEntryDto(
  row: {
    id: string;
    actorId: string | null;
    actorName: string | null;
    action: string;
    entityType: string;
    entityId: string;
    entityLabel: string | null;
    diffJson: string | null;
    createdAt: Date;
  },
) {
  const actionKind = normalizeAuditAction(row.action);
  const diff = parseAuditDiffJson(row.diffJson);
  return {
    id: row.id,
    actorId: row.actorId,
    actorName: row.actorName,
    action: row.action,
    actionKind,
    entityType: row.entityType,
    entityId: row.entityId,
    entityLabel: row.entityLabel,
    diff,
    fieldChanges: extractAuditFieldChanges(diff, actionKind),
    createdAt: row.createdAt.toISOString(),
  };
}
