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
        "shrink-0 rounded-sm px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide " +
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
  return <p className="px-3 py-4 text-sm text-tesla-text-secondary">{children}</p>;
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
    <li className={"px-3 py-3 hover:bg-tesla-muted/40 " + className}>{children}</li>
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
    <div className="flex flex-wrap items-start justify-between gap-2">
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
        {badge}
        <div className="min-w-0 flex-1 text-sm font-medium leading-snug text-tesla-text">
          {title}
        </div>
      </div>
      {actions ? <div className="shrink-0">{actions}</div> : null}
    </div>
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
        "mt-2 grid gap-x-4 gap-y-2 text-sm sm:grid-cols-2 lg:grid-cols-3 " + className
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
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={"min-w-0 " + className}>
      <dt className="text-[11px] font-medium uppercase tracking-wide text-tesla-text-secondary">
        {label}
      </dt>
      <dd className="mt-0.5 min-w-0 break-words text-tesla-text">{children}</dd>
    </div>
  );
}

/** Editable field block inside a stacked row (label above control). */
export function StackedMetaField({
  label,
  children,
  className = "",
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={"min-w-0 " + className}>
      <label className="text-[11px] font-medium uppercase tracking-wide text-tesla-text-secondary">
        {label}
      </label>
      <div className="mt-0.5 min-w-0">{children}</div>
    </div>
  );
}