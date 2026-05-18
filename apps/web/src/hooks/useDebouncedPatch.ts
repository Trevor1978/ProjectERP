import { useCallback, useEffect, useRef } from "react";

/** Debounced PATCH — skips when `enabled` is false or payload unchanged since last success. */
export function useDebouncedPatch<T>({
  delayMs = 500,
  enabled,
  payload,
  save,
  onVersion,
}: {
  delayMs?: number;
  enabled: boolean;
  payload: T;
  save: (payload: T) => Promise<{ version?: number }>;
  onVersion?: (version: number) => void;
}) {
  const lastSaved = useRef<string>("");
  const saving = useRef(false);

  const flush = useCallback(async () => {
    if (!enabled || saving.current) return;
    const key = JSON.stringify(payload);
    if (key === lastSaved.current) return;
    saving.current = true;
    try {
      const res = await save(payload);
      const savedKey =
        res.version != null
          ? JSON.stringify({ ...(payload as object), version: res.version })
          : key;
      lastSaved.current = savedKey;
      if (res.version != null) onVersion?.(res.version);
    } finally {
      saving.current = false;
    }
  }, [enabled, payload, save, onVersion]);

  useEffect(() => {
    if (!enabled) return;
    const t = window.setTimeout(() => void flush(), delayMs);
    return () => window.clearTimeout(t);
  }, [enabled, flush, delayMs, payload]);

  return { flushNow: flush };
}
