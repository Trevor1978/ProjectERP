import { randomUUID } from "node:crypto";
import {
  pgTable,
  text,
  timestamp,
  integer,
  boolean,
  doublePrecision,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";

/* --- Auth / org --- */

export const organization = pgTable("organization", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => randomUUID()),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const user = pgTable(
  "user",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => randomUUID()),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    passwordHash: text("password_hash").notNull(),
    name: text("name").notNull(),
    globalRole: text("global_role", {
      enum: ["member", "org_admin"],
    })
      .notNull()
      .default("member"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("user_org_email").on(t.organizationId, t.email),
  ],
);

export const session = pgTable("session", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => randomUUID()),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

/* --- CRM / work --- */

export const client = pgTable("client", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => randomUUID()),
  organizationId: text("organization_id")
    .notNull()
    .references(() => organization.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  code: text("code"),
  version: integer("version").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const supplier = pgTable("supplier", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => randomUUID()),
  organizationId: text("organization_id")
    .notNull()
    .references(() => organization.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  code: text("code"),
  notes: text("notes"),
  version: integer("version").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const project = pgTable("project", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => randomUUID()),
  organizationId: text("organization_id")
    .notNull()
    .references(() => organization.id, { onDelete: "cascade" }),
  clientId: text("client_id")
    .notNull()
    .references(() => client.id, { onDelete: "restrict" }),
  name: text("name").notNull(),
  code: text("code"),
  status: text("status", {
    enum: ["draft", "active", "on_hold", "closed"],
  })
    .notNull()
    .default("active"),
  startAt: timestamp("start_at", { withTimezone: true }),
  endAt: timestamp("end_at", { withTimezone: true }),
  version: integer("version").notNull().default(0),
  createdById: text("created_by_id").references(() => user.id, {
    onDelete: "set null",
  }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const projectMember = pgTable(
  "project_member",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => randomUUID()),
    projectId: text("project_id")
      .notNull()
      .references(() => project.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    role: text("role", {
      enum: ["viewer", "member", "pm", "admin"],
    })
      .notNull()
      .default("member"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [uniqueIndex("pm_project_user").on(t.projectId, t.userId)],
);

export const milestone = pgTable("milestone", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => randomUUID()),
  projectId: text("project_id")
    .notNull()
    .references(() => project.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  startAt: timestamp("start_at", { withTimezone: true }),
  endAt: timestamp("end_at", { withTimezone: true }),
  orderIndex: integer("order_index").notNull().default(0),
  version: integer("version").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const task = pgTable(
  "task",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => randomUUID()),
    projectId: text("project_id")
      .notNull()
      .references(() => project.id, { onDelete: "cascade" }),
    milestoneId: text("milestone_id")
      .notNull()
      .references(() => milestone.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    description: text("description"),
    startAt: timestamp("start_at", { withTimezone: true }),
    endAt: timestamp("end_at", { withTimezone: true }),
    estHours: doublePrecision("est_hours"),
    actualHours: doublePrecision("actual_hours").default(0),
    percentComplete: doublePrecision("percent_complete")
      .notNull()
      .default(0),
    useDerivedPercent: boolean("use_derived_percent")
      .notNull()
      .default(true),
    orderIndex: integer("order_index").notNull().default(0),
    assigneeId: text("assignee_id").references(() => user.id, {
      onDelete: "set null",
    }),
    version: integer("version").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("task_project").on(t.projectId)],
);

export const taskDependency = pgTable(
  "task_dependency",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => randomUUID()),
    taskId: text("task_id")
      .notNull()
      .references(() => task.id, { onDelete: "cascade" }),
    predecessorTaskId: text("predecessor_task_id")
      .notNull()
      .references(() => task.id, { onDelete: "cascade" }),
    type: text("type", {
      enum: ["FS", "SS", "FF", "SF"],
    })
      .notNull()
      .default("FS"),
  },
  (t) => [
    uniqueIndex("dep_task_pred").on(t.taskId, t.predecessorTaskId),
  ],
);

export const todo = pgTable(
  "todo",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => randomUUID()),
    taskId: text("task_id")
      .notNull()
      .references(() => task.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    status: text("status", {
      enum: ["backlog", "in_progress", "blocked", "done"],
    })
      .notNull()
      .default("backlog"),
    dueAt: timestamp("due_at", { withTimezone: true }),
    priority: text("priority", {
      enum: ["low", "normal", "high", "urgent"],
    })
      .notNull()
      .default("normal"),
    orderIndex: integer("order_index").notNull().default(0),
    assigneeId: text("assignee_id").references(() => user.id, {
      onDelete: "set null",
    }),
    version: integer("version").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("todo_task").on(t.taskId)],
);

export const timeEntry = pgTable("time_entry", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => randomUUID()),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  taskId: text("task_id")
    .notNull()
    .references(() => task.id, { onDelete: "cascade" }),
  todoId: text("todo_id").references(() => todo.id, { onDelete: "set null" }),
  startedAt: timestamp("started_at", { withTimezone: true }),
  endedAt: timestamp("ended_at", { withTimezone: true }),
  durationMinutes: integer("duration_minutes"),
  note: text("note"),
  version: integer("version").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const userRate = pgTable(
  "user_rate",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => randomUUID()),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    hourlyRate: doublePrecision("hourly_rate").notNull(),
    effectiveFrom: timestamp("effective_from", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("user_rate_user").on(t.userId)],
);

export const projectBudget = pgTable(
  "project_budget",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => randomUUID()),
    projectId: text("project_id")
      .notNull()
      .references(() => project.id, { onDelete: "cascade" }),
    labour: doublePrecision("labour").notNull().default(0),
    material: doublePrecision("material").notNull().default(0),
    other: doublePrecision("other").notNull().default(0),
    currency: text("currency").notNull().default("USD"),
    version: integer("version").notNull().default(0),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [uniqueIndex("project_budget_one").on(t.projectId)],
);

/* --- Procurement + SAP cache --- */

export const procurementRequest = pgTable("procurement_request", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => randomUUID()),
  organizationId: text("organization_id")
    .notNull()
    .references(() => organization.id, { onDelete: "cascade" }),
  supplierId: text("supplier_id").references(() => supplier.id, {
    onDelete: "set null",
  }),
  title: text("title").notNull(),
  status: text("status", {
    enum: [
      "draft",
      "rfq_sent",
      "quoted",
      "ordered",
      "partially_received",
      "closed",
      "cancelled",
    ],
  })
    .notNull()
    .default("draft"),
  /** When true, procurement is treated as fully received (closed) regardless of line quantities. */
  fullyReceivedOverride: boolean("fully_received_override")
    .notNull()
    .default(false),
  needBy: timestamp("need_by", { withTimezone: true }),
  sapPoNumber: text("sap_po_number"),
  sapLineCache: text("sap_line_cache"), // JSON
  lastSapSyncAt: timestamp("last_sap_sync_at", { withTimezone: true }),
  version: integer("version").notNull().default(0),
  createdById: text("created_by_id").references(() => user.id, {
    onDelete: "set null",
  }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const procurementRequestLine = pgTable(
  "procurement_request_line",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => randomUUID()),
    procurementId: text("procurement_id")
      .notNull()
      .references(() => procurementRequest.id, { onDelete: "cascade" }),
    projectId: text("project_id")
      .notNull()
      .references(() => project.id, { onDelete: "cascade" }),
    partNumber: text("part_number"),
    description: text("description").notNull(),
    quantity: text("quantity").notNull().default("1"), // string for large decimals
    unit: text("unit"),
    estUnitPrice: doublePrecision("est_unit_price"),
    orderIndex: integer("order_index").notNull().default(0),
    /** Integer units received; line is fully received when this equals ordered quantity (numeric). */
    receivedQty: integer("received_qty").notNull().default(0),
    version: integer("version").notNull().default(0),
  },
  (t) => [index("prline_proc").on(t.procurementId)],
);

/* --- filters, docs, handover, comments, assets --- */

export const savedFilter = pgTable("saved_filter", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => randomUUID()),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  organizationId: text("organization_id")
    .notNull()
    .references(() => organization.id, { onDelete: "cascade" }),
  projectId: text("project_id").references(() => project.id, {
    onDelete: "cascade",
  }),
  name: text("name").notNull(),
  kind: text("kind", {
    enum: ["tasks", "todos", "time", "rfq", "projects"],
  })
    .notNull()
    .default("todos"),
  filterJson: text("filter_json").notNull().default("{}"),
  isDefault: boolean("is_default").notNull().default(false),
  version: integer("version").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const notification = pgTable(
  "notification",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => randomUUID()),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    kind: text("kind", {
      enum: ["task_assigned", "todo_assigned", "due_soon", "comment", "rfq"],
    }).notNull(),
    title: text("title").notNull(),
    body: text("body"),
    readAt: timestamp("read_at", { withTimezone: true }),
    dataJson: text("data_json"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("notif_user_unread").on(t.userId)],
);

export const documentLink = pgTable("document_link", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => randomUUID()),
  projectId: text("project_id")
    .notNull()
    .references(() => project.id, { onDelete: "cascade" }),
  kind: text("kind", {
    enum: ["drawing", "program", "photo", "other"],
  })
    .notNull()
    .default("other"),
  label: text("label").notNull(),
  url: text("url").notNull(),
  version: integer("version").notNull().default(0),
  createdById: text("created_by_id").references(() => user.id, {
    onDelete: "set null",
  }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const handover = pgTable(
  "handover",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => randomUUID()),
    projectId: text("project_id")
      .notNull()
      .references(() => project.id, { onDelete: "cascade" }),
    asBuilt: text("as_built"),
    spares: text("spares"),
    supportNotes: text("support_notes"),
    version: integer("version").notNull().default(0),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [uniqueIndex("handover_project").on(t.projectId)],
);

export const comment = pgTable("comment", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => randomUUID()),
  authorId: text("author_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  body: text("body").notNull(),
  parentType: text("parent_type", {
    enum: ["project", "task", "todo", "procurement"],
  }).notNull(),
  parentId: text("parent_id").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const asset = pgTable("asset", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => randomUUID()),
  organizationId: text("organization_id")
    .notNull()
    .references(() => organization.id, { onDelete: "cascade" }),
  site: text("site").notNull(),
  line: text("line").notNull(),
  serial: text("serial"),
  name: text("name").notNull(),
  version: integer("version").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const projectAsset = pgTable(
  "project_asset",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => randomUUID()),
    projectId: text("project_id")
      .notNull()
      .references(() => project.id, { onDelete: "cascade" }),
    assetId: text("asset_id")
      .notNull()
      .references(() => asset.id, { onDelete: "cascade" }),
  },
  (t) => [uniqueIndex("pa_proj_asset").on(t.projectId, t.assetId)],
);

export const auditLog = pgTable("audit_log", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => randomUUID()),
  organizationId: text("organization_id").references(() => organization.id, {
    onDelete: "cascade",
  }),
  actorId: text("actor_id").references(() => user.id, { onDelete: "set null" }),
  action: text("action").notNull(),
  entityType: text("entity_type").notNull(),
  entityId: text("entity_id").notNull(),
  diffJson: text("diff_json"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
