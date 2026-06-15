import { useEffect, useMemo, useState } from "react";
import { useQuickCreateOptional } from "./QuickCreateProvider";
import {
  entityLabel,
  fieldsForEntity,
  initialFormValues,
} from "../lib/quickCreate/fields";
import type {
  QuickCreateDefaults,
  QuickCreateEntity,
  QuickCreateFilter,
} from "../lib/quickCreate/types";
import { QUICK_CREATE_VALUE } from "../lib/quickCreate/types";

type BaseProps = {
  entity: QuickCreateEntity;
  value: string;
  className?: string;
  disabled?: boolean;
  allowEmpty?: boolean;
  emptyLabel?: string;
  filter?: QuickCreateFilter;
  defaults?: QuickCreateDefaults;
  /** Options rendered before catalog entries (e.g. "All projects"). */
  prependOptions?: { value: string; label: string }[];
  /** Manual options when provider unavailable (e.g. tests). */
  options?: { value: string; label: string }[];
  enableCreate?: boolean;
};

type ChangeProps = BaseProps & {
  onChange: (value: string) => void;
  onSave?: never;
};

type SaveProps = BaseProps & {
  onSave: (value: string) => void | Promise<void>;
  onChange?: never;
};

export type QuickCreateSelectProps = ChangeProps | SaveProps;

export function QuickCreateSelect(props: QuickCreateSelectProps) {
  const ctx = useQuickCreateOptional();
  const {
    entity,
    value,
    className = "w-full rounded border px-2 py-1",
    disabled,
    allowEmpty,
    emptyLabel = "(none)",
    filter,
    defaults,
    prependOptions,
    options: manualOptions,
    enableCreate = true,
  } = props;

  const catalogOptions = ctx?.getOptions(entity, filter) ?? manualOptions ?? [];
  const options = useMemo(() => {
    const list = [...catalogOptions];
    if (value && !list.some((o) => o.value === value)) {
      list.unshift({ value, label: `${value.slice(0, 8)}…` });
    }
    return list;
  }, [catalogOptions, value]);

  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const fields = useMemo(() => fieldsForEntity(entity, filter, defaults), [entity, filter, defaults]);

  useEffect(() => {
    if (creating) {
      setForm(initialFormValues(entity, filter, defaults));
      setErr(null);
    }
  }, [creating, entity, filter, defaults]);

  const applyValue = (next: string) => {
    if ("onSave" in props && props.onSave) {
      void props.onSave(next);
    } else if ("onChange" in props && props.onChange) {
      props.onChange(next);
    }
  };

  const onSelectChange = (next: string) => {
    if (next === QUICK_CREATE_VALUE) {
      setCreating(true);
      return;
    }
    applyValue(next);
  };

  const submitCreate = async () => {
    if (!ctx) {
      setErr("Quick create is not available");
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      for (const f of fields) {
        if (f.type === "text" && f.required && !form[f.key]?.trim()) {
          throw new Error(`${f.label} is required`);
        }
        if (f.type === "entity" && f.required && !form[f.key]?.trim()) {
          throw new Error(`${f.label} is required`);
        }
      }
      const id = await ctx.createEntity(entity, form);
      setCreating(false);
      applyValue(id);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Create failed");
    } finally {
      setBusy(false);
    }
  };

  const canCreate = enableCreate && ctx != null;

  return (
    <div className="min-w-0">
      <select
        className={className}
        value={creating ? QUICK_CREATE_VALUE : value}
        disabled={disabled || busy}
        onChange={(e) => onSelectChange(e.target.value)}
      >
        {allowEmpty && <option value="">{emptyLabel}</option>}
        {prependOptions?.map((o) => (
          <option key={`prepend-${o.value}`} value={o.value}>
            {o.label}
          </option>
        ))}
        {options.length === 0 && !allowEmpty && !canCreate && !prependOptions?.length && (
          <option value="">Nothing available</option>
        )}
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
        {canCreate && (
          <option value={QUICK_CREATE_VALUE}>+ Create new {entityLabel(entity)}…</option>
        )}
      </select>

      {creating && canCreate && (
        <div className="mt-2 rounded border border-slate-200 bg-slate-50 p-2 text-sm shadow-sm">
          <p className="mb-2 font-medium text-slate-800">New {entityLabel(entity)}</p>
          <div className="grid gap-2">
            {fields.map((field) =>
              field.type === "text" ? (
                <div key={field.key}>
                  <label className="block text-xs font-medium text-slate-600">{field.label}</label>
                  <input
                    className="mt-0.5 w-full rounded border border-slate-300 bg-white px-2 py-1 text-sm"
                    value={form[field.key] ?? ""}
                    placeholder={field.placeholder}
                    onChange={(e) => setForm((f) => ({ ...f, [field.key]: e.target.value }))}
                  />
                </div>
              ) : (
                <div key={field.key}>
                  <label className="block text-xs font-medium text-slate-600">{field.label}</label>
                  <QuickCreateSelect
                    entity={field.entity}
                    value={form[field.key] ?? ""}
                    onChange={(v) =>
                      setForm((f) => {
                        const next = { ...f, [field.key]: v };
                        if (field.key === "projectId") {
                          delete next.milestoneId;
                          delete next.taskId;
                        }
                        return next;
                      })
                    }
                    filter={
                      field.key === "milestoneId" && form.projectId
                        ? { projectId: form.projectId }
                        : field.filter
                    }
                    defaults={defaults}
                    className="mt-0.5 w-full rounded border border-slate-300 bg-white px-2 py-1 text-sm"
                    enableCreate
                  />
                </div>
              ),
            )}
          </div>
          {err && <p className="mt-2 text-xs text-red-600">{err}</p>}
          <div className="mt-2 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy}
              className="rounded bg-slate-900 px-2 py-1 text-xs text-white disabled:opacity-50"
              onClick={() => void submitCreate()}
            >
              {busy ? "Creating…" : "Create & select"}
            </button>
            <button
              type="button"
              disabled={busy}
              className="rounded border border-slate-300 px-2 py-1 text-xs text-slate-700"
              onClick={() => {
                setCreating(false);
                setErr(null);
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/** Inline table / form helper matching former InlineSelect + quick create. */
export function EntitySelect({
  entity,
  value,
  onSave,
  filter,
  defaults,
  allowEmpty,
  emptyLabel,
  className,
  prependOptions,
}: {
  entity: QuickCreateEntity;
  value: string;
  onSave: (value: string) => void | Promise<void>;
  filter?: QuickCreateFilter;
  defaults?: QuickCreateDefaults;
  allowEmpty?: boolean;
  emptyLabel?: string;
  className?: string;
  prependOptions?: { value: string; label: string }[];
}) {
  return (
    <QuickCreateSelect
      entity={entity}
      value={value}
      onSave={onSave}
      filter={filter}
      defaults={defaults}
      allowEmpty={allowEmpty}
      emptyLabel={emptyLabel}
      prependOptions={prependOptions}
      className={className ?? "w-full rounded border px-2 py-1"}
    />
  );
}

/** Plain select for enums (status, priority) — no quick create. */
export function EnumSelect({
  value,
  options,
  onSave,
  className,
}: {
  value: string;
  options: { value: string; label: string }[];
  onSave: (value: string) => void | Promise<void>;
  className?: string;
}) {
  return (
    <select
      className={className ?? "w-full rounded border px-2 py-1"}
      value={value}
      onChange={(e) => void onSave(e.target.value)}
    >
      {options.map((o) => (
        <option key={`${o.value}-${o.label}`} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}
