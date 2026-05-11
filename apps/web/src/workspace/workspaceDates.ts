export const isoToLocal = (v: string | null | undefined) =>
  v ? new Date(v).toISOString().slice(0, 16) : "";
export const localToIso = (v: string) => (v.trim() ? new Date(v).toISOString() : null);
