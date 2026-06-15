import type { QuickCreateDefaults, QuickCreateEntity, QuickCreateFieldDef, QuickCreateFilter } from "./types";

export function fieldsForEntity(
  entity: QuickCreateEntity,
  filter?: QuickCreateFilter,
  defaults?: QuickCreateDefaults,
): QuickCreateFieldDef[] {
  switch (entity) {
    case "client":
      return [{ type: "text", key: "name", label: "Name", required: true, placeholder: "Customer name" }];
    case "supplier":
      return [{ type: "text", key: "name", label: "Name", required: true, placeholder: "Supplier name" }];
    case "project":
      return [
        { type: "text", key: "name", label: "Name", required: true, placeholder: "Project name" },
        {
          type: "entity",
          key: "clientId",
          label: "Customer",
          entity: "client",
          required: true,
        },
      ];
    case "milestone":
      return [
        {
          type: "entity",
          key: "projectId",
          label: "Project",
          entity: "project",
          required: true,
          filter: filter?.projectId ? { projectId: filter.projectId } : undefined,
        },
        { type: "text", key: "name", label: "Name", required: true, placeholder: "Milestone name" },
      ];
    case "task":
      return [
        {
          type: "entity",
          key: "projectId",
          label: "Project",
          entity: "project",
          required: true,
          filter: filter?.projectId ? { projectId: filter.projectId } : undefined,
        },
        {
          type: "entity",
          key: "milestoneId",
          label: "Milestone",
          entity: "milestone",
          required: true,
        },
        { type: "text", key: "title", label: "Title", required: true, placeholder: "Task title" },
      ];
    case "todo":
      return [
        {
          type: "entity",
          key: "taskId",
          label: "Task",
          entity: "task",
          required: true,
          filter: filter?.projectId ? { projectId: filter.projectId } : undefined,
        },
        { type: "text", key: "title", label: "Title", required: true, placeholder: "Todo title" },
      ];
    case "procurement":
      return [
        { type: "text", key: "title", label: "Title", required: true, placeholder: "RFQ / PO title" },
      ];
    default:
      return [];
  }
}

export function initialFormValues(
  entity: QuickCreateEntity,
  filter?: QuickCreateFilter,
  defaults?: QuickCreateDefaults,
): Record<string, string> {
  const out: Record<string, string> = {};
  if (entity === "project" && defaults?.clientId) out.clientId = defaults.clientId;
  if ((entity === "milestone" || entity === "task") && (filter?.projectId || defaults?.projectId)) {
    out.projectId = filter?.projectId ?? defaults?.projectId ?? "";
  }
  if (entity === "task" && (filter?.milestoneId || defaults?.milestoneId)) {
    out.milestoneId = filter?.milestoneId ?? defaults?.milestoneId ?? "";
  }
  if (entity === "todo" && (filter?.taskId || defaults?.taskId)) {
    out.taskId = filter?.taskId ?? defaults?.taskId ?? "";
  }
  return out;
}

export function entityLabel(entity: QuickCreateEntity): string {
  switch (entity) {
    case "client":
      return "customer";
    case "supplier":
      return "supplier";
    case "project":
      return "project";
    case "milestone":
      return "milestone";
    case "task":
      return "task";
    case "todo":
      return "todo";
    case "procurement":
      return "purchasing record";
  }
}
