export type QuickCreateEntity =
  | "client"
  | "supplier"
  | "project"
  | "milestone"
  | "task"
  | "todo"
  | "procurement";

export type QuickCreateFilter = {
  projectId?: string;
  milestoneId?: string;
  taskId?: string;
};

export type QuickCreateDefaults = {
  clientId?: string;
  projectId?: string;
  milestoneId?: string;
  taskId?: string;
  supplierId?: string;
};

export const QUICK_CREATE_VALUE = "__quick_create__";

export type QuickCreateFieldDef =
  | {
      type: "text";
      key: string;
      label: string;
      required?: boolean;
      placeholder?: string;
    }
  | {
      type: "entity";
      key: string;
      label: string;
      entity: QuickCreateEntity;
      required?: boolean;
      filter?: QuickCreateFilter;
    };
