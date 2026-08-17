import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api } from "../../lib/api";
import { downloadServiceReport } from "../../lib/serviceReportDownload";
import { isoToLocal, localToIso } from "../../workspace/workspaceDates";
import { WorkspaceDetailChrome } from "./WorkspaceDetailChrome";
import { DeleteConfirmModal } from "../../components/DeleteConfirmModal";

const inputClass =
  "mt-1 w-full rounded-sm border border-tesla-border px-2 py-1.5 text-sm";
const labelClass = "block text-xs font-medium text-tesla-text-secondary";

type ServiceLog = {
  id: string;
  assetId: string;
  title: string;
  description: string | null;
  performedAt: string;
  technicianName: string | null;
  reportMarkdownStorage: string | null;
  reportPdfStorage: string | null;
  assetName?: string;
  version: number;
};

export function WorkspaceServiceHistoryDetailPage() {
  const { logId } = useParams<{ logId: string }>();
  const nav = useNavigate();
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["asset-service-log", logId],
    queryFn: () => api<{ log: ServiceLog }>(`/api/asset-service-logs/${logId}`),
    enabled: Boolean(logId),
  });

  const log = data?.log;
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [performedAt, setPerformedAt] = useState("");
  const [technicianName, setTechnicianName] = useState("");
  const [reportMarkdown, setReportMarkdown] = useState("");
  const [originalMarkdown, setOriginalMarkdown] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [dlErr, setDlErr] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const { data: markdownData, isLoading: markdownLoading } = useQuery({
    queryKey: ["asset-service-log-markdown", logId],
    queryFn: () =>
      api<{ markdown: string | null }>(
        `/api/asset-service-logs/${logId}/report-markdown`,
      ),
    enabled: Boolean(logId),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  useEffect(() => {
    if (!log) return;
    setTitle(log.title);
    setDescription(log.description ?? "");
    setPerformedAt(isoToLocal(log.performedAt));
    setTechnicianName(log.technicianName ?? "");
  }, [log]);

  useEffect(() => {
    if (markdownData === undefined) return;
    const md = markdownData.markdown ?? "";
    setReportMarkdown(md);
    setOriginalMarkdown(md);
  }, [markdownData]);

  if (!logId) return null;
  if (isLoading) return <p className="text-tesla-text-secondary">Loading…</p>;
  if (!log) {
    return (
      <WorkspaceDetailChrome
        backTo="/workspace/service-history"
        backLabel="← Service history"
        title="Not found"
      >
        <p>Service entry not found.</p>
      </WorkspaceDetailChrome>
    );
  }

  return (
    <WorkspaceDetailChrome
      backTo="/workspace/service-history"
      backLabel="← Service history"
      title={log.title}
    >
      <p className="mb-4 text-sm text-tesla-text-secondary">
        Machine:{" "}
        <Link
          to={`/workspace/machines/${log.assetId}`}
          className="text-blue-700 underline"
        >
          {log.assetName ?? log.assetId}
        </Link>
      </p>

      {err && <p className="mb-2 text-sm text-red-600">{err}</p>}
      {dlErr && <p className="mb-2 text-sm text-red-600">{dlErr}</p>}

      <div className="mb-4 flex flex-wrap gap-2">
        {log.reportMarkdownStorage ? (
          <button
            type="button"
            className="rounded-sm border border-tesla-border bg-white px-3 py-1.5 text-sm"
            onClick={() => {
              setDlErr(null);
              void downloadServiceReport(log.id, "md").catch((e: Error) =>
                setDlErr(e.message),
              );
            }}
          >
            Download MD
          </button>
        ) : null}
        {log.reportPdfStorage ? (
          <button
            type="button"
            className="rounded-sm border border-tesla-border bg-white px-3 py-1.5 text-sm"
            onClick={() => {
              setDlErr(null);
              void downloadServiceReport(log.id, "pdf").catch((e: Error) =>
                setDlErr(e.message),
              );
            }}
          >
            Download PDF
          </button>
        ) : null}
      </div>

      <div className="grid max-w-3xl gap-3 rounded-sm border border-tesla-border bg-white p-4">
        <div>
          <label className={labelClass}>Title</label>
          <input
            className={inputClass}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </div>
        <div>
          <label className={labelClass}>Work performed</label>
          <textarea
            className={inputClass}
            rows={5}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>
        <div>
          <label className={labelClass}>Performed at</label>
          <input
            type="datetime-local"
            className={inputClass}
            value={performedAt}
            onChange={(e) => setPerformedAt(e.target.value)}
          />
        </div>
        <div>
          <label className={labelClass}>Technician</label>
          <input
            className={inputClass}
            value={technicianName}
            onChange={(e) => setTechnicianName(e.target.value)}
          />
        </div>
        <div>
          <label className={labelClass}>Service report (markdown)</label>
          <p className="mt-1 text-xs text-tesla-text-secondary">
            Edit the Spantec report here. Saving regenerates the PDF from this
            markdown.
          </p>
          {markdownLoading ? (
            <p className="mt-2 text-sm text-tesla-text-secondary">
              Loading report…
            </p>
          ) : (
            <textarea
              className={inputClass + " font-mono text-xs"}
              rows={18}
              disabled={saving}
              value={reportMarkdown}
              onChange={(e) => setReportMarkdown(e.target.value)}
            />
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={saving || !title.trim() || markdownLoading}
            className="rounded-sm bg-tesla-text px-3 py-1.5 text-sm text-white disabled:opacity-50"
            onClick={() => {
              setErr(null);
              const markdownChanged = reportMarkdown !== originalMarkdown;
              if (markdownChanged && !reportMarkdown.trim()) {
                setErr("Report markdown cannot be empty");
                return;
              }
              setSaving(true);
              void api(`/api/asset-service-logs/${log.id}`, {
                method: "PATCH",
                body: JSON.stringify({
                  title: title.trim(),
                  description: description.trim() || null,
                  performedAt: localToIso(performedAt) ?? undefined,
                  technicianName: technicianName.trim() || null,
                  version: log.version,
                  ...(markdownChanged
                    ? { reportMarkdown: reportMarkdown }
                    : {}),
                }),
              })
                .then(async () => {
                  if (markdownChanged) {
                    setOriginalMarkdown(reportMarkdown);
                  }
                  await qc.invalidateQueries({
                    queryKey: ["asset-service-log", logId],
                  });
                  await qc.invalidateQueries({
                    queryKey: ["asset-service-log-markdown", logId],
                  });
                  await qc.invalidateQueries({ queryKey: ["asset-service-logs"] });
                  await qc.invalidateQueries({
                    queryKey: ["asset-service-logs", log.assetId],
                  });
                })
                .catch((e: Error) => setErr(e.message))
                .finally(() => setSaving(false));
            }}
          >
            {saving ? "Saving…" : "Save"}
          </button>
          <button
            type="button"
            className="rounded-sm border border-red-300 px-3 py-1.5 text-sm text-red-700"
            onClick={() => setConfirmDelete(true)}
          >
            Delete
          </button>
        </div>
      </div>

      <DeleteConfirmModal
        open={confirmDelete}
        recordTitle={log.title}
        previewPath={`/api/asset-service-logs/${log.id}/delete-preview`}
        deletePath={`/api/asset-service-logs/${log.id}`}
        onClose={() => setConfirmDelete(false)}
        onDeleted={async () => {
          await qc.invalidateQueries({ queryKey: ["asset-service-logs"] });
          nav("/workspace/service-history");
        }}
      />
    </WorkspaceDetailChrome>
  );
}
