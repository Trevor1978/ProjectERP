/** Unique display values per column for filter autocomplete (from table rows). */
export function columnFilterOptions(
  rows: { sort: (string | number | null)[] }[],
  col: number,
): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const r of rows) {
    const display = String(r.sort[col] ?? "").trim();
    if (!display || seen.has(display)) continue;
    seen.add(display);
    out.push(display);
  }
  return out.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
}

/** Suggestions shown while typing; prefers prefix matches, then substring. */
export function filterColumnSuggestions(
  options: string[],
  query: string,
  limit = 15,
): string[] {
  const q = query.trim().toLowerCase();
  if (!q) return options.slice(0, limit);

  const prefix: string[] = [];
  const contains: string[] = [];
  for (const opt of options) {
    const lower = opt.toLowerCase();
    if (lower.startsWith(q)) prefix.push(opt);
    else if (lower.includes(q)) contains.push(opt);
  }
  return [...prefix, ...contains].slice(0, limit);
}
