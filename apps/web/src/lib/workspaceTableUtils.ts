/** Canonical filter tokens per column (pipe-separated). Used for exact value matching in table filters. */
export function filterCell(...parts: (string | number | null | undefined)[]): string {
  const seen = new Set<string>();
  for (const p of parts) {
    if (p == null) continue;
    const t = String(p).trim().toLowerCase();
    if (t) seen.add(t);
  }
  return [...seen].join("|");
}

export function columnFilterMatches(cellFilterValue: string, userFilter: string): boolean {
  const fv = userFilter.trim().toLowerCase();
  if (!fv) return true;
  const tokens = cellFilterValue
    .split("|")
    .map((t) => t.trim())
    .filter(Boolean);
  if (tokens.length === 0) return false;
  return tokens.some((t) => t === fv);
}

export type CompletedTab =
  | "projects"
  | "tasks"
  | "todos"
  | "procurement";

export function isCompletedStatus(tab: CompletedTab, status: string): boolean {
  switch (tab) {
    case "projects":
      return status === "closed";
    case "tasks":
      return false;
    case "todos":
      return status === "done" || status === "cancelled";
    case "procurement":
      return status === "closed" || status === "cancelled";
    default:
      return false;
  }
}

export const TABS_WITH_COMPLETED: CompletedTab[] = ["projects", "tasks", "todos", "procurement"];
