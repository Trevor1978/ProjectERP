import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import { Clock, User, Plus, Edit, Trash2 } from "lucide-react";

interface AuditEntry {
  id: string;
  actorId: string | null;
  actorName: string | null;
  action: "create" | "update" | "delete";
  entityType: string;
  entityId: string;
  entityLabel: string | null;
  diff: Record<string, unknown> | null;
  createdAt: string;
}

function formatDate(isoDate: string): string {
  const date = new Date(isoDate);
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function formatFieldName(field: string): string {
  return field
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, (str) => str.toUpperCase())
    .trim();
}

function formatValue(value: unknown): React.ReactNode {
  if (value === null || value === undefined) {
    return "(empty)";
  }
  if (typeof value === "boolean") {
    return value ? "Yes" : "No";
  }
  if (typeof value === "object") {
    return JSON.stringify(value);
  }
  return String(value);
}

const actionIcons = {
  create: Plus,
  update: Edit,
  delete: Trash2,
};

const actionColors = {
  create: "text-green-700 bg-green-50 border-green-200",
  update: "text-blue-700 bg-blue-50 border-blue-200",
  delete: "text-red-700 bg-red-50 border-red-200",
};

const actionLabels = {
  create: "Created",
  update: "Updated",
  delete: "Deleted",
};

export function AuditHistory({
  entityType,
  entityId,
}: {
  entityType: string;
  entityId: string;
}) {
  const { data, isLoading, error } = useQuery({
    queryKey: ["audit-history", entityType, entityId],
    queryFn: () =>
      api<{ entries: AuditEntry[] }>(`/api/audit/entity/${entityType}/${entityId}`),
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8 text-slate-500">
        <Clock className="mr-2 h-4 w-4 animate-spin" />
        Loading history...
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded border border-red-200 bg-red-50 p-4 text-sm text-red-800">
        Failed to load history: {error instanceof Error ? error.message : "Unknown error"}
      </div>
    );
  }

  if (!data?.entries || data.entries.length === 0) {
    return (
      <div className="rounded border border-slate-200 bg-slate-50 p-8 text-center text-sm text-slate-600">
        No history entries found for this record.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold text-slate-900">Change History</h3>
      <div className="relative">
        <div className="absolute left-[17px] top-0 h-full w-0.5 bg-slate-200 md:left-[21px]" />
        <ul className="space-y-4">
          {data.entries.map((entry, idx) => {
            const Icon = actionIcons[entry.action];
            return (
              <li key={entry.id} className="relative flex gap-3 md:gap-4">
                <div
                  className={
                    "relative z-10 flex h-9 w-9 shrink-0 items-center justify-center rounded-full border md:h-11 md:w-11 " +
                    actionColors[entry.action]
                  }
                >
                  <Icon className="h-4 w-4 md:h-5 md:w-5" />
                </div>
                <div className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-white p-3 shadow-sm md:p-4">
                  <div className="mb-2 flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="font-medium text-slate-900">
                        {actionLabels[entry.action]}
                      </p>
                      <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-slate-600">
                        <User className="h-3 w-3" />
                        <span>{entry.actorName ?? "Unknown"}</span>
                        <span className="text-slate-400">·</span>
                        <Clock className="h-3 w-3" />
                        <span>{formatDate(entry.createdAt)}</span>
                      </p>
                    </div>
                  </div>

                  {entry.diff && entry.action === "update" && "fields" in entry.diff && (
                    <div className="mt-3 space-y-2 border-t border-slate-100 pt-3">
                      <p className="text-xs font-medium text-slate-700">Changes:</p>
                      {Object.entries(entry.diff.fields as Record<string, { before: unknown; after: unknown }>).map(
                        ([field, change]) => (
                          <div
                            key={field}
                            className="rounded border border-slate-100 bg-slate-50 p-2 text-xs"
                          >
                            <p className="mb-1 font-medium text-slate-700">
                              {formatFieldName(field)}
                            </p>
                            <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-2">
                              <div className="flex-1">
                                <span className="text-slate-500">From: </span>
                                <span className="font-mono text-slate-900">
                                  {formatValue(change.before)}
                                </span>
                              </div>
                              <span className="hidden text-slate-400 sm:inline">→</span>
                              <div className="flex-1">
                                <span className="text-slate-500">To: </span>
                                <span className="font-mono text-slate-900">
                                  {formatValue(change.after)}
                                </span>
                              </div>
                            </div>
                          </div>
                        ),
                      )}
                    </div>
                  )}

                  {entry.action === "create" && entry.diff && "created" in entry.diff && (
                    <div className="mt-3 rounded border border-green-100 bg-green-50 p-2 text-xs text-green-900">
                      Record created with initial values
                    </div>
                  )}

                  {entry.action === "delete" && entry.diff && "deleted" in entry.diff && (
                    <div className="mt-3 rounded border border-red-100 bg-red-50 p-2 text-xs text-red-900">
                      Record permanently deleted
                    </div>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
