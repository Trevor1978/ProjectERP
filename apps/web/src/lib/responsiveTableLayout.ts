/** Column indices hidden below lg (768–1023px tablet); shown on lg+ unless mobile card mode. */
export const TABLET_HIDDEN_COLUMN_INDICES: Record<string, number[]> = {
  customers: [],
  suppliers: [2],
  projects: [4, 5],
  milestones: [2, 3, 4],
  tasks: [3, 4, 5, 6],
  todos: [3, 7, 8],
  timeEntries: [3, 4, 6],
  procurement: [4],
  procurementLines: [2, 5, 6, 7, 8],
};

export function isColumnHiddenOnTablet(layoutKey: string | undefined, columnIndex: number): boolean {
  if (!layoutKey) return false;
  return (TABLET_HIDDEN_COLUMN_INDICES[layoutKey] ?? []).includes(columnIndex);
}

/** Primary label column for mobile cards (defaults to first column). */
export const MOBILE_PRIMARY_COLUMN: Record<string, number> = {
  customers: 0,
  suppliers: 0,
  projects: 0,
  milestones: 1,
  tasks: 2,
  todos: 2,
  timeEntries: 0,
  procurement: 1,
  procurementLines: 3,
};

export function primaryColumnIndex(layoutKey: string | undefined): number {
  if (!layoutKey) return 0;
  return MOBILE_PRIMARY_COLUMN[layoutKey] ?? 0;
}

const APPEND_LABELS: Record<string, string> = {
  customers: "Add customer",
  suppliers: "Add supplier",
  projects: "Add project",
  milestones: "Add milestone",
  tasks: "Add task",
  todos: "Add todo",
  timeEntries: "Add time entry",
  procurement: "Add purchasing record",
  procurementLines: "Add line",
};

export function appendRowButtonLabel(layoutKey: string | undefined): string {
  if (!layoutKey) return "Add row";
  return APPEND_LABELS[layoutKey] ?? "Add row";
}
