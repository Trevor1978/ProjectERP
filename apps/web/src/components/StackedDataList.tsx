import type { ReactNode } from "react";

export function formatStackedDateTime(value: string | Date | null | undefined): string {
  if (value == null || value === "") return "—";
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

const badgeTone: Record<string, string> = {
  slate: "bg-slate-200 text-slate-700",
  amber: "bg-amber-100 text-amber-900",
  blue: "bg-blue-100 text-blue-900",
  emerald: "bg-emerald-100 text-emerald-900",
};

export function StackedTypeBadge({
  children,
  tone = "slate",
}: {
  children: ReactNode;
  tone?: keyof typeof badgeTone;
}) {
  return (
    <span
      className={
        "shrink-0 rounded-sm px-1 py-0.5 text-[10px] font-semibold uppercase leading-none tracking-wide " +
        (badgeTone[tone] ?? badgeTone.slate)
      }
    >
      {children}
    </span>
  );
}

export function StackedListShell({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={
        "overflow-hidden rounded-sm border border-tesla-border bg-white " + className
      }
    >
      {children}
    </div>
  );
}

export function StackedListEmpty({
  children,
}: {
  children: ReactNode;
}) {
  return <p className="px-2 py-3 text-sm text-tesla-text-secondary">{children}</p>;
}

export function StackedList({
  children,
}: {
  children: ReactNode;
}) {
  return <ul className="divide-y divide-tesla-border">{children}</ul>;
}

export function StackedListRow({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <li
      className={
        "px-2 py-1.5 hover:bg-tesla-muted/40 md:flex md:flex-col md:gap-0.5 md:py-1 " +
        className
      }
    >
      {children}
    </li>
  );
}

export function StackedListHeading({
  badge,
  title,
  actions,
}: {
  badge?: ReactNode;
  title: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-2 md:min-h-[1.25rem]">
      <div className="flex min-w-0 flex-1 items-center gap-1.5">
        {badge}
        <div className="min-w-0 flex-1 truncate text-sm font-semibold leading-tight text-tesla-text">
          {title}
        </div>
      </div>
      {actions ? <div className="shrink-0 text-xs">{actions}</div> : null}
    </div>
  );
}

/** Wrap display values so long text ellipsizes on laptop (use title for full string). */
export function StackedMetaValue({
  children,
  title,
}: {
  children: ReactNode;
  title?: string;
}) {
  return (
    <span
      className="block min-w-0 truncate md:max-w-[12rem] lg:max-w-[16rem]"
      title={title}
    >
      {children}
    </span>
  );
}

export function StackedMetaGrid({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <dl
      className={
        "mt-1 grid grid-cols-2 gap-x-2 gap-y-1 text-xs sm:grid-cols-2 " +
        "md:mt-0 md:flex md:flex-wrap md:items-center md:gap-x-2 md:gap-y-1 lg:gap-x-3 " +
        className
      }
    >
      {children}
    </dl>
  );
}

export function StackedMetaItem({
  label,
  children,
  className = "",
  title,
}: {
  label: string;
  children: ReactNode;
  className?: string;
  /** Tooltip for truncated value (plain text). */
  title?: string;
}) {
  return (
    <div
      className={
        "min-w-0 md:flex md:max-w-full md:items-baseline md:gap-1 " + className
      }
    >
      <dt className="shrink-0 text-[10px] font-medium uppercase tracking-wide text-tesla-text-secondary md:text-[11px] md:normal-case md:tracking-normal md:text-slate-500">
        <span className="md:after:content-[':']">{label}</span>
      </dt>
      <dd className="mt-0.5 min-w-0 text-tesla-text md:mt-0 md:flex-1">
        {title ? (
          <StackedMetaValue title={title}>{children}</StackedMetaValue>
        ) : (
          <span className="block min-w-0 truncate md:max-w-[12rem] lg:max-w-[16rem]">
            {children}
          </span>
        )}
      </dd>
    </div>
  );
}

/** Editable field block inside a stacked row (label above control on phone; inline on laptop). */
/** Narrow numeric inputs (qty / ordered / received, up to ~4 digits). */
export const stackedNumericInputClass =
  "w-14 max-w-[4.5rem] min-w-[3.25rem] tabular-nums";

export function StackedMetaField({
  label,
  children,
  className = "",
  narrow,
}: {
  label: string;
  children: ReactNode;
  className?: string;
  /** Short numeric field — no grow on md+. */
  narrow?: boolean;
}) {
  return (
    <div
      className={
        "min-w-0 " +
        (narrow
          ? "md:flex md:flex-none md:items-center md:gap-1"
          : "md:flex md:max-w-[9.5rem] md:flex-none md:items-center md:gap-1.5 lg:max-w-[11rem]") +
        " " +
        className
      }
    >
      <label className="block shrink-0 text-[10px] font-medium uppercase tracking-wide text-tesla-text-secondary md:text-[11px] md:normal-case md:tracking-normal md:text-slate-500">
        <span className="md:after:content-[':']">{label}</span>
      </label>
      <div className={"mt-0.5 min-w-0 md:mt-0 " + (narrow ? "" : "md:min-w-0 md:flex-1")}>
        {children}
      </div>
    </div>
  );
}