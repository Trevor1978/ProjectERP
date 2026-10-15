import type { LucideIcon } from "lucide-react";
import { Edit, Plus, Trash2 } from "lucide-react";

export type AuditActionKind = "create" | "update" | "delete";

export type AuditFieldChange = { field: string; before: unknown; after: unknown };

export type AuditEntryViewModel = {
  id: string;
  actorName: string | null;
  action: string;
  actionKind: AuditActionKind;
  entityType: string;
  entityId: string;
  entityLabel: string | null;
  createdAt: string;
  fieldChanges: AuditFieldChange[];
  diff: Record<string, unknown> | null;
};

export function normalizeAuditAction(action: string): AuditActionKind {
  const a = action.trim().toLowerCase();
  if (a === "delete" || a.endsWith(".delete")) return "delete";
  if (a === "create" || a.endsWith(".create")) return "create";
  return "update";
}

export function formatAuditDate(isoDate: string | null | undefined): string {
  if (!isoDate) return "Unknown time";
  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) return "Unknown time";
  return new Intl.DateTimeFormat("en-AU", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

export function formatEntityType(type: string): string {
  return type
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

export function displayEntityLabel(entry: {
  entityLabel: string | null;
  entityType: string;
  entityId: string;
}): string {
  const label = entry.entityLabel?.trim();
  if (label) return label;
  const typeName = formatEntityType(entry.entityType);
  const shortId = entry.entityId?.slice(0, 8);
  return shortId ? `${typeName} ${shortId}` : typeName;
}

export function formatFieldName(field: string): string {
  return field
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, (str) => str.toUpperCase())
    .trim();
}

export function formatAuditValue(value: unknown): string {
  if (value === null || value === undefined) return "(empty)";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "object") {
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }
  return String(value);
}

export function extractFieldChanges(
  diff: Record<string, unknown> | null,
  actionKind: AuditActionKind,
): AuditFieldChange[] {
  if (!diff) return [];

  if (actionKind === "create") {
    const skip = new Set(["fields", "created", "deleted"]);
    return Object.entries(diff)
      .filter(([key]) => !skip.has(key))
      .map(([field, value]) => ({ field, before: null, after: value }));
  }

  if (actionKind !== "update") return [];

  const rawFields = diff.fields;
  if (rawFields && typeof rawFields === "object" && !Array.isArray(rawFields)) {
    return Object.entries(rawFields as Record<string, unknown>).map(([field, value]) =>
      toFieldChange(field, value),
    );
  }

  const skip = new Set(["fields", "created", "deleted"]);
  return Object.entries(diff)
    .filter(([key]) => !skip.has(key))
    .map(([field, value]) => toFieldChange(field, value));
}

function toFieldChange(field: string, value: unknown): AuditFieldChange {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const obj = value as Record<string, unknown>;
    if ("before" in obj || "after" in obj) {
      return {
        field,
        before: obj.before ?? null,
        after: obj.after ?? null,
      };
    }
  }
  return { field, before: null, after: value };
}

export function toAuditEntryViewModel(raw: {
  id: string;
  actorName?: string | null;
  action: string;
  actionKind?: AuditActionKind;
  entityType?: string;
  entityId?: string;
  entityLabel?: string | null;
  createdAt: string;
  diff?: Record<string, unknown> | null;
  fieldChanges?: AuditFieldChange[];
}): AuditEntryViewModel {
  const actionKind = raw.actionKind ?? normalizeAuditAction(raw.action);
  const diff = raw.diff ?? null;
  const fieldChanges =
    raw.fieldChanges ??
    extractFieldChanges(diff, actionKind).map((c) => ({ ...c }));
  return {
    id: raw.id,
    actorName: raw.actorName ?? null,
    action: raw.action,
    actionKind,
    entityType: raw.entityType ?? "record",
    entityId: raw.entityId ?? raw.id,
    entityLabel: raw.entityLabel ?? null,
    createdAt: raw.createdAt,
    fieldChanges,
    diff,
  };
}

export const auditActionIcons: Record<AuditActionKind, LucideIcon> = {
  create: Plus,
  update: Edit,
  delete: Trash2,
};

export const auditActionColors: Record<AuditActionKind, string> = {
  create: "text-green-700 bg-green-50 border-green-200",
  update: "text-blue-700 bg-blue-50 border-blue-200",
  delete: "text-red-700 bg-red-50 border-red-200",
};

export const auditActionLabels: Record<AuditActionKind, string> = {
  create: "Created",
  update: "Updated",
  delete: "Deleted",
};
