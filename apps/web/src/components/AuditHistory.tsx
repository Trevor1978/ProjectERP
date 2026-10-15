import { useQuery } from "@tanstack/react-query";
import { Clock } from "lucide-react";
import { api } from "../lib/api";
import { toAuditEntryViewModel, type AuditEntryViewModel } from "../lib/auditDisplay";
import { AuditHistoryErrorBoundary } from "./AuditHistoryErrorBoundary";
import { AuditHistoryList } from "./AuditHistoryList";

type AuditApiEntry = {
  id: string;
  actorName: string | null;
  action: string;
  actionKind?: "create" | "update" | "delete";
  entityType?: string;
  entityId?: string;
  entityLabel?: string | null;
  createdAt: string;
  diff?: Record<string, unknown> | null;
  fieldChanges?: { field: string; before: unknown; after: unknown }[];
};

function AuditHistoryInner({
  entityType,
  entityId,
}: {
  entityType: string;
  entityId: string;
}) {
  const { data, isLoading, error } = useQuery({
    queryKey: ["audit-history", entityType, entityId],
    queryFn: async () => {
      const res = await api<{ entries: AuditApiEntry[] }>(
        `/api/audit/entity/${entityType}/${entityId}`,
      );
      return {
        entries: (res.entries ?? []).map((e) =>
          toAuditEntryViewModel({
            ...e,
            entityType: e.entityType ?? entityType,
            entityId: e.entityId ?? entityId,
          }),
        ),
      };
    },
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

  const entries: AuditEntryViewModel[] = data?.entries ?? [];

  if (entries.length === 0) {
    return (
      <div className="rounded border border-slate-200 bg-slate-50 p-8 text-center text-sm text-slate-600">
        No history entries found for this record.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold text-slate-900">Change History</h3>
      <AuditHistoryList entries={entries} variant="timeline" />
    </div>
  );
}

export function AuditHistory(props: { entityType: string; entityId: string }) {
  return (
    <AuditHistoryErrorBoundary>
      <AuditHistoryInner {...props} />
    </AuditHistoryErrorBoundary>
  );
}
