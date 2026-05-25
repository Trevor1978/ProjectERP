export type ProjectItemKind = "hardware" | "software";
export type ProjectItemStatus =
  | "specified"
  | "on_order"
  | "partial"
  | "received"
  | "cancelled";

export type ProjectItem = {
  id: string;
  projectId: string;
  kind: ProjectItemKind;
  partNumber: string | null;
  description: string;
  quantity: string;
  unit: string | null;
  status: ProjectItemStatus;
  notes: string;
  orderIndex: number;
  version: number;
  createdAt: string;
  updatedAt: string;
  linkedLineCount?: number;
  orderedTotal?: number;
  receivedTotal?: number;
};

export const PROJECT_ITEM_KINDS: ProjectItemKind[] = ["hardware", "software"];
export const PROJECT_ITEM_STATUSES: ProjectItemStatus[] = [
  "specified",
  "on_order",
  "partial",
  "received",
  "cancelled",
];

export function projectItemStatusLabel(s: ProjectItemStatus): string {
  switch (s) {
    case "specified":
      return "Specified";
    case "on_order":
      return "On order";
    case "partial":
      return "Partial";
    case "received":
      return "Received";
    case "cancelled":
      return "Cancelled";
  }
}
