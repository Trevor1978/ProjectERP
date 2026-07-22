/** Org-wide CRUD entities shown in the workspace sidebar (URL slug ↔ tab id). */

export type WorkspaceTableSlug =
  | "customers"
  | "suppliers"
  | "projects"
  | "milestones"
  | "tasks"
  | "todos"
  | "time-entries"
  | "purchasing"
  | "purchasing-lines"
  | "machines"
  | "work-complete";

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
  { slug: "work-complete", label: "Log work" },
  { slug: "customers", label: "Customers" },
  { slug: "suppliers", label: "Suppliers" },
  { slug: "projects", label: "Projects" },
  { slug: "milestones", label: "Milestones" },
  { slug: "tasks", label: "Tasks" },
  { slug: "todos", label: "Todos" },
  { slug: "time-entries", label: "Time entries" },
  { slug: "purchasing", label: "Purchasing" },
  { slug: "purchasing-lines", label: "Purchasing lines" },
  { slug: "machines", label: "Machines" },
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
    case "purchasing":
    case "procurement":
      return "procurement";
    case "purchasing-lines":
    case "procurement-lines":
      return "procurementLines";
    case "machines":
    case "work-complete":
      return null;
    default:
      return null;
  }
}

export function workspaceTabToSlug(tab: WorkspaceTab): WorkspaceTableSlug {
  switch (tab) {
    case "timeEntries":
      return "time-entries";
    case "procurementLines":
      return "purchasing-lines";
    case "procurement":
      return "purchasing";
    default:
      return tab as WorkspaceTableSlug;
  }
}
