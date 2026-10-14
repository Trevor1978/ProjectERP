import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../../lib/api";
import { Clock, User, Filter, Plus, Edit, Trash2, ChevronLeft, ChevronRight } from "lucide-react";

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

function formatEntityType(type: string): string {
  return type
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function displayEntityLabel(entry: { entityLabel: string | null; entityType: string; entityId: string }): string {
  const label = entry.entityLabel?.trim();
  if (label) return label;
  const typeName = formatEntityType(entry.entityType);
  const shortId = entry.entityId?.slice(0, 8);
  return shortId ? `${typeName} ${shortId}` : typeName;
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

const ENTITY_TYPES = [
  { value: "", label: "All Types" },
  { value: "client", label: "Customers" },
  { value: "supplier", label: "Suppliers" },
  { value: "project", label: "Projects" },
  { value: "milestone", label: "Milestones" },
  { value: "task", label: "Tasks" },
  { value: "todo", label: "Todos" },
  { value: "time_entry", label: "Time Entries" },
  { value: "procurement", label: "Purchasing" },
  { value: "procurement_line", label: "Purchasing Lines" },
  { value: "asset", label: "Machines" },
  { value: "service_log", label: "Service History" },
  { value: "project_note", label: "A4 Notes" },
  { value: "organization", label: "Organization Settings" },
  { value: "user", label: "Users" },
];

export function WorkspaceHistoryPage() {
  const [entityType, setEntityType] = useState("");
  const [action, setAction] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [page, setPage] = useState(0);
  const [showFilters, setShowFilters] = useState(false);
  const limit = 50;

  const queryParams = new URLSearchParams();
  if (entityType) queryParams.set("entityType", entityType);
  if (action) queryParams.set("action", action);
  if (startDate) queryParams.set("startDate", new Date(startDate).toISOString());
  if (endDate) queryParams.set("endDate", new Date(endDate).toISOString());
  queryParams.set("limit", String(limit));
  queryParams.set("offset", String(page * limit));

  const { data, isLoading, error } = useQuery({
    queryKey: ["audit-history", entityType, action, startDate, endDate, page],
    queryFn: () =>
      api<{
        entries: AuditEntry[];
        total: number;
        limit: number;
        offset: number;
      }>(`/api/audit/history?${queryParams.toString()}`),
  });

  const totalPages = data ? Math.ceil(data.total / limit) : 0;

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold text-slate-900">Change History</h1>
        <button
          type="button"
          onClick={() => setShowFilters(!showFilters)}
          className="flex items-center gap-2 rounded-sm border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          <Filter className="h-4 w-4" />
          {showFilters ? "Hide" : "Show"} Filters
        </button>
      </div>

      {showFilters && (
        <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <div>
              <label className="block text-sm font-medium text-slate-700">Type</label>
              <select
                className="mt-1 w-full rounded border px-2 py-1.5 text-sm"
                value={entityType}
                onChange={(e) => {
                  setEntityType(e.target.value);
                  setPage(0);
                }}
              >
                {ENTITY_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700">Action</label>
              <select
                className="mt-1 w-full rounded border px-2 py-1.5 text-sm"
                value={action}
                onChange={(e) => {
                  setAction(e.target.value);
                  setPage(0);
                }}
              >
                <option value="">All Actions</option>
                <option value="create">Created</option>
                <option value="update">Updated</option>
                <option value="delete">Deleted</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700">Start Date</label>
              <input
                type="date"
                className="mt-1 w-full rounded border px-2 py-1.5 text-sm"
                value={startDate}
                onChange={(e) => {
                  setStartDate(e.target.value);
                  setPage(0);
                }}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700">End Date</label>
              <input
                type="date"
                className="mt-1 w-full rounded border px-2 py-1.5 text-sm"
                value={endDate}
                onChange={(e) => {
                  setEndDate(e.target.value);
                  setPage(0);
                }}
              />
            </div>
          </div>
        </div>
      )}

      {isLoading && (
        <div className="flex items-center justify-center p-12 text-slate-500">
          <Clock className="mr-2 h-5 w-5 animate-spin" />
          Loading history...
        </div>
      )}

      {error && (
        <div className="rounded border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          Failed to load history: {error instanceof Error ? error.message : "Unknown error"}
        </div>
      )}

      {!isLoading && !error && data && (
        <>
          {data.entries.length === 0 ? (
            <div className="rounded border border-slate-200 bg-slate-50 p-12 text-center text-sm text-slate-600">
              No history entries found.
            </div>
          ) : (
            <>
              <div className="rounded-lg border border-slate-200 bg-white shadow-sm">
                <ul className="divide-y divide-slate-100">
                  {data.entries.map((entry) => {
                    const Icon = actionIcons[entry.action];
                    return (
                      <li key={entry.id} className="p-4 hover:bg-slate-50">
                        <div className="flex gap-3">
                          <div
                            className={
                              "flex h-10 w-10 shrink-0 items-center justify-center rounded-full border " +
                              actionColors[entry.action]
                            }
                          >
                            <Icon className="h-5 w-5" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-start justify-between gap-2">
                              <div>
                                <p className="text-sm font-medium text-slate-900">
                                  {actionLabels[entry.action]} {formatEntityType(entry.entityType)}
                                  <span className="ml-1 text-slate-600">
                                    "{displayEntityLabel(entry)}"
                                  </span>
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
                              <div className="mt-2 rounded border border-slate-100 bg-slate-50 p-2 text-xs">
                                <p className="mb-1 font-medium text-slate-700">
                                  {Object.keys(entry.diff.fields as Record<string, unknown>).length} field(s) changed
                                </p>
                              </div>
                            )}
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </div>

              {totalPages > 1 && (
                <div className="flex items-center justify-between border-t border-slate-200 bg-white px-4 py-3 sm:px-6">
                  <div className="flex flex-1 justify-between sm:hidden">
                    <button
                      type="button"
                      disabled={page === 0}
                      onClick={() => setPage(page - 1)}
                      className="relative inline-flex items-center rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-40"
                    >
                      Previous
                    </button>
                    <button
                      type="button"
                      disabled={page >= totalPages - 1}
                      onClick={() => setPage(page + 1)}
                      className="relative ml-3 inline-flex items-center rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-40"
                    >
                      Next
                    </button>
                  </div>
                  <div className="hidden sm:flex sm:flex-1 sm:items-center sm:justify-between">
                    <div>
                      <p className="text-sm text-gray-700">
                        Showing{" "}
                        <span className="font-medium">{page * limit + 1}</span> to{" "}
                        <span className="font-medium">
                          {Math.min((page + 1) * limit, data.total)}
                        </span>{" "}
                        of <span className="font-medium">{data.total}</span> results
                      </p>
                    </div>
                    <div>
                      <nav
                        className="isolate inline-flex -space-x-px rounded-md shadow-sm"
                        aria-label="Pagination"
                      >
                        <button
                          type="button"
                          disabled={page === 0}
                          onClick={() => setPage(page - 1)}
                          className="relative inline-flex items-center rounded-l-md border border-gray-300 bg-white px-2 py-2 text-sm font-medium text-gray-500 hover:bg-gray-50 disabled:opacity-40"
                        >
                          <span className="sr-only">Previous</span>
                          <ChevronLeft className="h-5 w-5" aria-hidden="true" />
                        </button>
                        <span className="relative inline-flex items-center border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700">
                          Page {page + 1} of {totalPages}
                        </span>
                        <button
                          type="button"
                          disabled={page >= totalPages - 1}
                          onClick={() => setPage(page + 1)}
                          className="relative inline-flex items-center rounded-r-md border border-gray-300 bg-white px-2 py-2 text-sm font-medium text-gray-500 hover:bg-gray-50 disabled:opacity-40"
                        >
                          <span className="sr-only">Next</span>
                          <ChevronRight className="h-5 w-5" aria-hidden="true" />
                        </button>
                      </nav>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}
