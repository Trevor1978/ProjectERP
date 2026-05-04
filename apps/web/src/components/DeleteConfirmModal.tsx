import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { api } from "../lib/api";

export type DeletePreview = {
  canDelete: boolean;
  blockedReason: string | null;
  bullets: string[];
  recordLabel: string;
};

function getModalPortalTarget(): HTMLElement {
  if (typeof document === "undefined") {
    throw new Error("No document");
  }
  const id = "modal-portal-root";
  let el = document.getElementById(id);
  if (!el) {
    el = document.createElement("div");
    el.id = id;
    document.body.appendChild(el);
  }
  return el;
}

export function DeleteConfirmModal({
  open,
  recordTitle,
  previewPath,
  deletePath,
  onClose,
  onDeleted,
}: {
  open: boolean;
  recordTitle: string;
  previewPath: string;
  deletePath: string;
  onClose: () => void;
  onDeleted: () => Promise<void>;
}) {
  const [loading, setLoading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [preview, setPreview] = useState<DeletePreview | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setPreview(null);
      setLoadErr(null);
      setLoading(false);
      setDeleting(false);
      return;
    }
    setLoading(true);
    setLoadErr(null);
    void api<{ preview: DeletePreview }>(previewPath)
      .then((res) => {
        setPreview(res.preview);
      })
      .catch((e: Error) => {
        setLoadErr(e.message);
        setPreview(null);
      })
      .finally(() => setLoading(false));
  }, [open, previewPath]);

  if (!open) {
    return null;
  }

  const node = (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true">
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-lg border border-slate-200 bg-white p-5 shadow-xl">
        <h2 className="text-lg font-semibold text-slate-900">Delete confirmation</h2>
        <p className="mt-1 text-sm text-slate-600">
          You are about to delete: <span className="font-medium text-slate-800">{recordTitle}</span>
          {preview?.recordLabel && preview.recordLabel !== recordTitle ? (
            <span className="text-slate-500"> ({preview.recordLabel})</span>
          ) : null}
        </p>

        {loading && <p className="mt-4 text-sm text-slate-500">Loading impact summary…</p>}
        {loadErr && (
          <p className="mt-4 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{loadErr}</p>
        )}
        {!loading && !loadErr && preview && (
          <div className="mt-4 space-y-3">
            {preview.blockedReason && (
              <p className="rounded border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                {preview.blockedReason}
              </p>
            )}
            {preview.bullets.length > 0 && (
              <div>
                <p className="text-sm font-medium text-slate-800">Impact</p>
                <ul className="mt-1 list-none space-y-1.5 pl-0 text-sm text-slate-700">
                  {preview.bullets.map((b, i) => (
                    <li key={i} className="pl-0">
                      {b}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <p className="text-xs text-slate-500">This action cannot be undone.</p>
          </div>
        )}

        <div className="mt-6 flex flex-wrap justify-end gap-2">
          <button
            type="button"
            className="rounded border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-800 hover:bg-slate-50"
            onClick={onClose}
            disabled={deleting}
          >
            Cancel
          </button>
          <button
            type="button"
            className="rounded border border-red-800 bg-red-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-800 disabled:opacity-40"
            disabled={loading || !!loadErr || !preview?.canDelete || deleting}
            onClick={() => {
              setDeleting(true);
              void api(deletePath, { method: "DELETE" })
                .then(() => onDeleted())
                .then(() => onClose())
                .catch((e: Error) => setLoadErr(e.message))
                .finally(() => setDeleting(false));
            }}
          >
            {deleting ? "Deleting…" : "Delete permanently"}
          </button>
        </div>
      </div>
    </div>
  );

  return createPortal(node, getModalPortalTarget());
}
