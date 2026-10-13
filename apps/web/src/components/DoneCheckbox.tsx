export function DoneCheckbox({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  /** Visible caption. The checkbox always has an accessible name. */
  label?: string;
}) {
  return (
    <label className="inline-flex cursor-pointer items-center gap-1.5 text-sm text-slate-700">
      <input
        type="checkbox"
        checked={checked}
        aria-label={label ? undefined : "Done"}
        onChange={(e) => onChange(e.target.checked)}
        className="rounded border-slate-300"
      />
      {label ? <span>{label}</span> : null}
    </label>
  );
}
