import { useRef, useState } from "react";
import { csvRecordsFromFile, downloadCsv, rowsToCsv } from "../lib/csvTable";

export type CsvImportHandler = (records: Record<string, string>[]) => Promise<{ ok: number; failed: string[] }>;

export function WorkspaceCsvToolbar({
  tableLabel,
  headers,
  exportDataRows,
  onImport,
}: {
  tableLabel: string;
  headers: string[];
  exportDataRows?: string[][];
  onImport?: CsvImportHandler;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const safeName = tableLabel.replace(/[^\w.-]+/g, "-").toLowerCase() || "table";

  function exportTemplate() {
    downloadCsv(`${safeName}-template.csv`, rowsToCsv(headers, []));
    setMsg("Template downloaded.");
  }

  function exportCurrent() {
    if (!exportDataRows?.length) {
      setMsg("No rows to export.");
      return;
    }
    downloadCsv(`${safeName}-export.csv`, rowsToCsv(headers, exportDataRows));
    setMsg(`Exported ${exportDataRows.length} row(s).`);
  }

  async function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !onImport) return;
    setBusy(true);
    setMsg(null);
    try {
      const text = await file.text();
      const { headers: fileHeaders, records } = csvRecordsFromFile(text);
      if (fileHeaders.length === 0) {
        setMsg("CSV is empty.");
        return;
      }
      const missing = headers.filter((h) => !fileHeaders.includes(h));
      if (missing.length) {
        setMsg(`Missing columns: ${missing.join(", ")}. Use “CSV template” for headings.`);
        return;
      }
      if (!window.confirm(`Import ${records.length} row(s) into ${tableLabel}?`)) return;
      const { ok, failed } = await onImport(records);
      setMsg(
        failed.length
          ? `Imported ${ok}; ${failed.length} failed. ${failed.slice(0, 3).join(" · ")}${failed.length > 3 ? "…" : ""}`
          : `Imported ${ok} row(s).`,
      );
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Import failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <button
        type="button"
        className="rounded-sm border border-tesla-border bg-white px-2.5 py-1 text-xs font-medium text-tesla-text hover:bg-tesla-muted"
        onClick={exportTemplate}
      >
        CSV template
      </button>
      {exportDataRows != null && (
        <button
          type="button"
          className="rounded-sm border border-tesla-border bg-white px-2.5 py-1 text-xs font-medium text-tesla-text hover:bg-tesla-muted"
          onClick={exportCurrent}
        >
          Export CSV
        </button>
      )}
      {onImport && (
        <>
          <input
            ref={inputRef}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={(e) => void onFileChange(e)}
          />
          <button
            type="button"
            disabled={busy}
            className="rounded-sm border border-tesla-border bg-white px-2.5 py-1 text-xs font-medium text-tesla-text hover:bg-tesla-muted disabled:opacity-50"
            onClick={() => inputRef.current?.click()}
          >
            {busy ? "Importing…" : "Import CSV"}
          </button>
        </>
      )}
      {msg && <span className="text-xs text-tesla-text-secondary">{msg}</span>}
    </div>
  );
}
