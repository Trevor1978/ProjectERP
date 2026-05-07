/** Org-wide CRUD entities shown in the workspace sidebar (URL slug ↔ tab id). */

export type WorkspaceTableSlug =
  | "customers"
  | "suppliers"
  | "projects"
  | "milestones"
  | "tasks"
  | "todos"
  | "time-entries"
  | "procurement"
  | "procurement-lines";

export type WorkspaceTab =
  | "customers"
  | "suppliers"
  | "projects"
  | "milestones"
  | "tasks"
  | "todos"
  | "timeEntries"
  | "procurement"
  | "procurementLines";

export const WORKSPACE_NAV_ITEMS: { slug: WorkspaceTableSlug; label: string }[] = [
  { slug: "customers", label: "Customers" },
  { slug: "suppliers", label: "Suppliers" },
  { slug: "projects", label: "Projects" },
  { slug: "milestones", label: "Milestones" },
  { slug: "tasks", label: "Tasks" },
  { slug: "todos", label: "Todos" },
  { slug: "time-entries", label: "Time entries" },
  { slug: "procurement", label: "Procurement" },
  { slug: "procurement-lines", label: "Procurement lines" },
];

export function workspaceSlugToTab(slug: string): WorkspaceTab | null {
  switch (slug) {
    case "customers":
      return "customers";
    case "suppliers":
      return "suppliers";
    case "projects":
      return "projects";
    case "milestones":
      return "milestones";
    case "tasks":
      return "tasks";
    case "todos":
      return "todos";
    case "time-entries":
      return "timeEntries";
    case "procurement":
      return "procurement";
    case "procurement-lines":
      return "procurementLines";
    default:
      return null;
  }
}

export function workspaceTabToSlug(tab: WorkspaceTab): WorkspaceTableSlug {
  switch (tab) {
    case "timeEntries":
      return "time-entries";
    case "procurementLines":
      return "procurement-lines";
    default:
      return tab as WorkspaceTableSlug;
  }
}
