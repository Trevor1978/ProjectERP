import { Clock, User } from "lucide-react";
import {
  auditActionColors,
  auditActionIcons,
  auditActionLabels,
  displayEntityLabel,
  formatAuditDate,
  formatAuditValue,
  formatEntityType,
  formatFieldName,
  toAuditEntryViewModel,
  type AuditEntryViewModel,
} from "../lib/auditDisplay";

function ChangeList({ entry }: { entry: AuditEntryViewModel }) {
  if (entry.actionKind === "create") {
    if (entry.fieldChanges.length > 0) {
      return (
        <div className="mt-3 space-y-2 border-t border-slate-100 pt-3">
          <p className="text-xs font-medium text-slate-700">Initial values</p>
          {entry.fieldChanges.map((change) => (
            <div
              key={change.field}
              className="rounded border border-green-100 bg-green-50/80 p-2 text-xs text-green-950"
            >
              <span className="font-medium">{formatFieldName(change.field)}: </span>
              <span className="font-mono">{formatAuditValue(change.after)}</span>
            </div>
          ))}
        </div>
      );
    }
    return (
      <div className="mt-3 rounded border border-green-100 bg-green-50 p-2 text-xs text-green-900">
        Record created
      </div>
    );
  }

  if (entry.actionKind === "delete") {
    return (
      <div className="mt-3 rounded border border-red-100 bg-red-50 p-2 text-xs text-red-900">
        Record deleted
      </div>
    );
  }

  if (entry.fieldChanges.length === 0) return null;

  return (
    <div className="mt-3 space-y-2 border-t border-slate-100 pt-3">
      <p className="text-xs font-medium text-slate-700">Changes</p>
      {entry.fieldChanges.map((change) => (
        <div
          key={change.field}
          className="rounded border border-slate-100 bg-slate-50 p-2 text-xs"
        >
          <p className="mb-1 font-medium text-slate-700">{formatFieldName(change.field)}</p>
          <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-2">
            <div className="min-w-0 flex-1">
              <span className="text-slate-500">From: </span>
              <span className="break-all font-mono text-slate-900">
                {formatAuditValue(change.before)}
              </span>
            </div>
            <span className="hidden text-slate-400 sm:inline">→</span>
            <div className="min-w-0 flex-1">
              <span className="text-slate-500">To: </span>
              <span className="break-all font-mono text-slate-900">
                {formatAuditValue(change.after)}
              </span>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

export function AuditHistoryList({
  entries,
  variant = "timeline",
  showEntityType = false,
}: {
  entries: AuditEntryViewModel[];
  variant?: "timeline" | "compact";
  showEntityType?: boolean;
}) {
  const models = entries.map((e) => toAuditEntryViewModel(e));

  if (variant === "compact") {
    return (
      <ul className="divide-y divide-slate-100">
        {models.map((entry) => {
          const Icon = auditActionIcons[entry.actionKind];
          const label = displayEntityLabel(entry);
          return (
            <li key={entry.id} className="p-4 hover:bg-slate-50">
              <div className="flex gap-3">
                <div
                  className={
                    "flex h-10 w-10 shrink-0 items-center justify-center rounded-full border " +
                    auditActionColors[entry.actionKind]
                  }
                >
                  <Icon className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-slate-900">
                    {auditActionLabels[entry.actionKind]}
                    {showEntityType ? ` ${formatEntityType(entry.entityType)}` : ""}
                    <span className="ml-1 font-normal text-slate-600">"{label}"</span>
                  </p>
                  <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-slate-600">
                    <User className="h-3 w-3" />
                    <span>{entry.actorName ?? "Unknown"}</span>
                    <span className="text-slate-400">·</span>
                    <Clock className="h-3 w-3" />
                    <span>{formatAuditDate(entry.createdAt)}</span>
                  </p>
                  {entry.fieldChanges.length > 0 && (
                    <p className="mt-2 text-xs text-slate-600">
                      {entry.fieldChanges.length} field
                      {entry.fieldChanges.length === 1 ? "" : "s"} changed
                    </p>
                  )}
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    );
  }

  return (
    <div className="relative">
      <div className="absolute left-[17px] top-0 h-full w-0.5 bg-slate-200 md:left-[21px]" />
      <ul className="space-y-4">
        {models.map((entry) => {
          const Icon = auditActionIcons[entry.actionKind];
          const label = displayEntityLabel(entry);
          return (
            <li key={entry.id} className="relative flex gap-3 md:gap-4">
              <div
                className={
                  "relative z-10 flex h-9 w-9 shrink-0 items-center justify-center rounded-full border md:h-11 md:w-11 " +
                  auditActionColors[entry.actionKind]
                }
              >
                <Icon className="h-4 w-4 md:h-5 md:w-5" />
              </div>
              <div className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-white p-3 shadow-sm md:p-4">
                <p className="font-medium text-slate-900">
                  {auditActionLabels[entry.actionKind]}
                  {label ? (
                    <span className="ml-1 font-normal text-slate-600">"{label}"</span>
                  ) : null}
                </p>
                <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-slate-600">
                  <User className="h-3 w-3" />
                  <span>{entry.actorName ?? "Unknown"}</span>
                  <span className="text-slate-400">·</span>
                  <Clock className="h-3 w-3" />
                  <span>{formatAuditDate(entry.createdAt)}</span>
                </p>
                <ChangeList entry={entry} />
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
