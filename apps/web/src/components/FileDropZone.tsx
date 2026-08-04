import { useId, useRef, useState, type DragEvent, type ReactNode } from "react";

function acceptMatches(file: File, accept?: string): boolean {
  if (!accept?.trim()) return true;
  const tokens = accept.split(",").map((t) => t.trim().toLowerCase()).filter(Boolean);
  if (tokens.length === 0) return true;
  const name = file.name.toLowerCase();
  const type = (file.type || "").toLowerCase();
  return tokens.some((token) => {
    if (token.startsWith(".")) {
      return name.endsWith(token);
    }
    if (token.endsWith("/*")) {
      const prefix = token.slice(0, -1); // e.g. "image/"
      return type.startsWith(prefix);
    }
    return type === token || name.endsWith(`.${token}`);
  });
}

function filterAccepted(files: FileList | File[], accept?: string): File[] {
  return Array.from(files).filter((f) => acceptMatches(f, accept));
}

export type FileDropZoneProps = {
  accept?: string;
  multiple?: boolean;
  disabled?: boolean;
  onFiles: (files: File[]) => void;
  /** Shown above the drop area (block variant). */
  label?: string;
  /** Hint under the main prompt. */
  hint?: string;
  /** Optional content inside the zone (e.g. selected file name). */
  children?: ReactNode;
  className?: string;
  /** block = large drop area; compact = toolbar-sized control. */
  variant?: "block" | "compact";
  id?: string;
  /** Override default prompt text. */
  prompt?: string;
};

export function FileDropZone({
  accept,
  multiple = false,
  disabled = false,
  onFiles,
  label,
  hint,
  children,
  className = "",
  variant = "block",
  id: idProp,
  prompt,
}: FileDropZoneProps) {
  const autoId = useId();
  const inputId = idProp ?? autoId;
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const dragDepth = useRef(0);

  function emit(files: FileList | File[] | null) {
    if (!files || disabled) return;
    const accepted = filterAccepted(files, accept);
    if (accepted.length === 0) return;
    onFiles(multiple ? accepted : accepted.slice(0, 1));
    if (inputRef.current) inputRef.current.value = "";
  }

  function onDragEnter(e: DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (disabled) return;
    dragDepth.current += 1;
    setDragging(true);
  }

  function onDragLeave(e: DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    dragDepth.current = Math.max(0, dragDepth.current - 1);
    if (dragDepth.current === 0) setDragging(false);
  }

  function onDragOver(e: DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (disabled) return;
    e.dataTransfer.dropEffect = "copy";
  }

  function onDrop(e: DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    dragDepth.current = 0;
    setDragging(false);
    if (disabled) return;
    emit(e.dataTransfer.files);
  }

  const defaultPrompt =
    prompt ??
    (multiple
      ? "Drop files here, or click to browse"
      : "Drop a file here, or click to browse");

  if (variant === "compact") {
    return (
      <div className={`inline-flex flex-col gap-0.5 ${className}`}>
        {label ? (
          <span className="text-xs font-medium text-slate-600">{label}</span>
        ) : null}
        <button
          type="button"
          disabled={disabled}
          onClick={() => inputRef.current?.click()}
          onDragEnter={onDragEnter}
          onDragLeave={onDragLeave}
          onDragOver={onDragOver}
          onDrop={onDrop}
          className={
            "rounded-sm border border-dashed px-2.5 py-1 text-xs font-medium transition-colors disabled:opacity-50 " +
            (dragging
              ? "border-slate-800 bg-slate-100 text-slate-900"
              : "border-tesla-border bg-white text-tesla-text hover:bg-tesla-muted")
          }
        >
          {dragging ? "Drop to upload" : defaultPrompt}
        </button>
        <input
          ref={inputRef}
          id={inputId}
          type="file"
          accept={accept}
          multiple={multiple}
          disabled={disabled}
          className="sr-only"
          onChange={(e) => emit(e.target.files)}
        />
        {children}
      </div>
    );
  }

  return (
    <div className={className}>
      {label ? (
        <label htmlFor={inputId} className="mb-1 block text-xs font-medium text-slate-600">
          {label}
        </label>
      ) : null}
      <div
        role="button"
        tabIndex={disabled ? -1 : 0}
        aria-disabled={disabled}
        onClick={() => {
          if (!disabled) inputRef.current?.click();
        }}
        onKeyDown={(e) => {
          if (disabled) return;
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            inputRef.current?.click();
          }
        }}
        onDragEnter={onDragEnter}
        onDragLeave={onDragLeave}
        onDragOver={onDragOver}
        onDrop={onDrop}
        className={
          "flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed px-4 py-8 text-center transition-colors " +
          (disabled ? "cursor-not-allowed opacity-50 " : "") +
          (dragging
            ? "border-slate-800 bg-slate-100"
            : "border-slate-300 bg-slate-50 hover:border-slate-400 hover:bg-slate-100/80")
        }
      >
        <p className="text-sm font-medium text-slate-800">
          {dragging ? "Drop to upload" : defaultPrompt}
        </p>
        {hint ? <p className="mt-1 text-xs text-slate-500">{hint}</p> : null}
        {children}
      </div>
      <input
        ref={inputRef}
        id={inputId}
        type="file"
        accept={accept}
        multiple={multiple}
        disabled={disabled}
        className="sr-only"
        onChange={(e) => emit(e.target.files)}
      />
    </div>
  );
}
