import { useEffect, type ReactNode } from "react";
import { createPortal } from "react-dom";

function getPortalTarget(): HTMLElement {
  return document.getElementById("modal-root") ?? document.body;
}

export function BottomSheet({
  title,
  onClose,
  children,
  footer,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
}) {
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  const node = (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="bottom-sheet-title"
      className="fixed inset-0 z-[2147483646] flex flex-col justify-end bg-slate-900/50"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="max-h-[min(92vh,48rem)] overflow-auto rounded-t-xl border border-slate-200 bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 z-10 flex items-center justify-between gap-2 border-b border-slate-100 bg-white px-4 py-3">
          <h2 id="bottom-sheet-title" className="text-base font-semibold text-slate-900">
            {title}
          </h2>
          <button
            type="button"
            className="rounded border border-slate-200 px-2.5 py-1 text-sm text-slate-700"
            onClick={onClose}
          >
            Close
          </button>
        </div>
        <div className="px-4 py-3">{children}</div>
        {footer ? <div className="border-t border-slate-100 px-4 py-3">{footer}</div> : null}
      </div>
    </div>
  );

  return createPortal(node, getPortalTarget());
}

/** Renders a table append row (`<tr>`) as a vertical form inside a bottom sheet. */
export function MobileTableAppendForm({ children }: { children: ReactNode }) {
  return (
    <div
      className={
        "[&_table]:block [&_tbody]:block [&_tr]:flex [&_tr]:flex-col [&_tr]:gap-3 [&_tr]:border-0 [&_tr]:bg-transparent " +
        "[&_td]:block [&_td]:w-full [&_td]:border-0 [&_td]:p-0 [&_td]:align-top " +
        "[&_input]:w-full [&_select]:w-full [&_textarea]:w-full"
      }
    >
      <table className="w-full">
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}
