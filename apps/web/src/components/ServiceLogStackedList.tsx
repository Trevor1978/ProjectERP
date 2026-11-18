import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import {
  StackedList,
  StackedListEmpty,
  StackedListHeading,
  StackedListRow,
  StackedMetaGrid,
  StackedMetaItem,
  formatStackedDateTime,
} from "./StackedDataList";

export type ServiceLogRow = {
  id: string;
  assetId: string;
  title: string;
  description: string | null;
  performedAt: string;
  technicianName: string | null;
  assetName?: string | null;
  reportMarkdownStorage?: string | null;
  version?: number;
};

export function ServiceLogStackedList({
  logs,
  loading,
  showMachine = false,
  reports,
  actions,
}: {
  logs: ServiceLogRow[];
  loading?: boolean;
  showMachine?: boolean;
  reports?: (log: ServiceLogRow) => ReactNode;
  actions?: (log: ServiceLogRow) => ReactNode;
}) {
  if (loading) {
    return <StackedListEmpty>Loading…</StackedListEmpty>;
  }
  if (logs.length === 0) {
    return <StackedListEmpty>No service entries yet.</StackedListEmpty>;
  }

  return (
    <StackedList>
      {logs.map((l) => (
        <StackedListRow key={l.id}>
          <StackedListHeading
            title={
              <Link
                to={`/workspace/service-history/${l.id}`}
                className="underline-offset-2 hover:underline"
              >
                {l.title}
              </Link>
            }
            actions={actions?.(l)}
          />
          <StackedMetaGrid>
            <StackedMetaItem label="Date">
              {formatStackedDateTime(l.performedAt)}
            </StackedMetaItem>
            {showMachine ? (
              <StackedMetaItem label="Machine">
                <Link
                  to={`/workspace/machines/${l.assetId}`}
                  className="text-blue-700 underline-offset-2 hover:underline"
                >
                  {l.assetName ?? l.assetId}
                </Link>
              </StackedMetaItem>
            ) : null}
            <StackedMetaItem label="Technician">{l.technicianName ?? "—"}</StackedMetaItem>
            <StackedMetaItem label="Work performed" className="sm:col-span-2 lg:col-span-3">
              {l.description?.trim() ? l.description : "—"}
            </StackedMetaItem>
            {reports ? (
              <StackedMetaItem label="Reports">{reports(l)}</StackedMetaItem>
            ) : null}
          </StackedMetaGrid>
        </StackedListRow>
      ))}
    </StackedList>
  );
}