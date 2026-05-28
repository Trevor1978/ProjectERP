import { useEffect, useId, useMemo, useRef, useState } from "react";
import { columnFilterOptions, filterColumnSuggestions } from "../lib/columnFilterSuggestions";

type RowLike = { sort: (string | number | null)[] };

export function ColumnFilterInput({
  columnIndex,
  columnLabel,
  rows,
  value,
  onChange,
}: {
  columnIndex: number;
  columnLabel: string;
  rows: RowLike[];
  value: string;
  onChange: (value: string) => void;
}) {
  const listId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);

  const options = useMemo(
    () => columnFilterOptions(rows, columnIndex),
    [rows, columnIndex],
  );

  const suggestions = useMemo(
    () => filterColumnSuggestions(options, value),
    [options, value],
  );

  const showList = open && suggestions.length > 0;

  useEffect(() => {
    setHighlight(0);
  }, [value, suggestions.length]);

  useEffect(() => {
    if (!open) return;
    function onDocPointer(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocPointer);
    return () => document.removeEventListener("mousedown", onDocPointer);
  }, [open]);

  function pick(option: string) {
    onChange(option);
    setOpen(false);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!showList) {
      if (e.key === "ArrowDown" && suggestions.length > 0) {
        e.preventDefault();
        setOpen(true);
      }
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlight((h) => Math.min(h + 1, suggestions.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const opt = suggestions[highlight];
      if (opt) pick(opt);
    } else if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
    }
  }

  return (
    <div ref={rootRef} className="relative min-w-[4rem]">
      <input
        className="w-full rounded border border-tesla-border px-1.5 py-0.5 text-xs font-normal"
        placeholder={`Filter ${columnLabel}`}
        value={value}
        role="combobox"
        aria-expanded={showList}
        aria-controls={showList ? listId : undefined}
        aria-autocomplete="list"
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
      />
      {showList ? (
        <ul
          id={listId}
          role="listbox"
          className="absolute left-0 top-full z-20 mt-0.5 max-h-48 min-w-full overflow-auto rounded-sm border border-tesla-border bg-white py-0.5 text-xs shadow-md"
        >
          {suggestions.map((opt, i) => (
            <li key={opt} role="presentation">
              <button
                type="button"
                role="option"
                aria-selected={i === highlight}
                className={
                  "block w-full px-2 py-1 text-left hover:bg-tesla-muted " +
                  (i === highlight ? "bg-tesla-muted font-medium" : "")
                }
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pick(opt)}
                onMouseEnter={() => setHighlight(i)}
              >
                {opt}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
