import { z } from "zod";

const email = z.string().email();
const name = z.string().min(1).max(255);
const id = z.string().uuid();
const version = z.number().int().nonnegative();

export const registerBody = z.object({
  email,
  password: z.string().min(8).max(128),
  name,
  organizationName: z.string().min(1).max(255),
});

export const loginBody = z.object({
  email,
  password: z.string().min(1).max(128),
});

export const profileUpdate = z
  .object({
    name: z.string().trim().min(1).max(255),
    email: z.string().trim().toLowerCase().email(),
  })
  .strict();

export const orgCreate = z.object({ name: z.string().min(1).max(255) });

export const clientCreate = z.object({
  organizationId: id,
  name: z.string().min(1).max(255),
  code: z.string().max(32).optional(),
});
export const clientPatch = clientCreate
  .partial()
  .required({ name: true })
  .extend({ id, version: version.optional() });

export const supplierCreate = z.object({
  organizationId: id,
  name: z.string().min(1).max(255),
  code: z.string().max(32).optional(),
  notes: z.string().max(2000).optional().nullable(),
});
export const supplierPatch = supplierCreate
  .partial()
  .required({ name: true })
  .extend({ id, version: version.optional() });

export const projectCreate = z.object({
  organizationId: id,
  clientId: id,
  name: z.string().min(1).max(255),
  code: z.string().max(64).optional(),
  status: z
    .enum(["draft", "active", "on_hold", "closed"])
    .default("active"),
  startAt: z.coerce.date().optional().nullable(),
  endAt: z.coerce.date().optional().nullable(),
});

export const projectPatch = z
  .object({
    name: z.string().min(1).max(255).optional(),
    code: z.string().max(64).optional().nullable(),
    clientId: id.optional(),
    status: z
      .enum(["draft", "active", "on_hold", "closed"])
      .optional(),
    startAt: z.coerce.date().optional().nullable(),
    endAt: z.coerce.date().optional().nullable(),
    version,
  })
  .strict();

export const milestoneCreate = z.object({
  projectId: id,
  name: name,
  startAt: z.coerce.date().optional().nullable(),
  endAt: z.coerce.date().optional().nullable(),
  orderIndex: z.number().int().min(0).default(0),
});
export const milestonePatch = z
  .object({
    name: z.string().min(1).max(255).optional(),
    startAt: z.coerce.date().optional().nullable(),
    endAt: z.coerce.date().optional().nullable(),
    orderIndex: z.number().int().min(0).optional(),
    version,
  })
  .strict();

export const taskCreate = z.object({
  projectId: id,
  milestoneId: id,
  title: z.string().min(1).max(500),
  description: z.string().max(10000).optional().nullable(),
  startAt: z.coerce.date().optional().nullable(),
  endAt: z.coerce.date().optional().nullable(),
  estDays: z.coerce.number().nonnegative().optional().nullable(),
  percentComplete: z.number().min(0).max(100).default(0),
  useDerivedPercent: z.boolean().default(true),
  orderIndex: z.number().int().min(0).default(0),
  assigneeId: id.nullable().optional(),
});

export const taskPatch = z
  .object({
    milestoneId: id.optional(),
    title: z.string().min(1).max(500).optional(),
    description: z.string().max(10000).optional().nullable(),
    startAt: z.coerce.date().optional().nullable(),
    endAt: z.coerce.date().optional().nullable(),
    estDays: z.coerce.number().nonnegative().optional().nullable(),
    actualHours: z.coerce.number().nonnegative().optional().nullable(),
    percentComplete: z.number().min(0).max(100).optional(),
    useDerivedPercent: z.boolean().optional(),
    orderIndex: z.number().int().min(0).optional(),
    assigneeId: id.nullable().optional(),
    version,
  })
  .strict();

export const todoCreate = z.object({
  taskId: id,
  title: z.string().min(1).max(500),
  description: z.string().max(10000).optional().nullable(),
  status: z
    .enum(["backlog", "in_progress", "blocked", "testing", "done"])
    .default("backlog"),
  dueAt: z.coerce.date().optional().nullable(),
  priority: z.enum(["low", "normal", "high", "urgent"]).default("normal"),
  orderIndex: z.number().int().min(0).default(0),
  assigneeId: id.nullable().optional(),
});

export const todoPatch = z
  .object({
    title: z.string().min(1).max(500).optional(),
    description: z.string().max(10000).optional().nullable(),
    status: z
      .enum(["backlog", "in_progress", "blocked", "testing", "done"])
      .optional(),
    dueAt: z.coerce.date().optional().nullable(),
    priority: z
      .enum(["low", "normal", "high", "urgent"])
      .optional(),
    orderIndex: z.number().int().min(0).optional(),
    assigneeId: id.nullable().optional(),
    version,
  })
  .strict();

export const timeEntryCreate = z.object({
  taskId: id,
  todoId: id.optional().nullable(),
  startedAt: z.coerce.date().optional().nullable(),
  endedAt: z.coerce.date().optional().nullable(),
  durationMinutes: z.number().int().positive().optional().nullable(),
  note: z.string().max(5000).optional().nullable(),
});
export const timeEntryPatch = z
  .object({
    startedAt: z.coerce.date().optional().nullable(),
    endedAt: z.coerce.date().optional().nullable(),
    durationMinutes: z.number().int().positive().optional().nullable(),
    note: z.string().max(5000).optional().nullable(),
    version,
  })
  .strict();

const rfqStatus = z.enum([
  "draft",
  "rfq_sent",
  "quoted",
  "ordered",
  "partially_received",
  "closed",
  "cancelled",
]);

export const procurementCreate = z.object({
  supplierId: id.nullable().optional(),
  title: z.string().min(1).max(500),
  status: rfqStatus.default("draft"),
  needBy: z.coerce.date().optional().nullable(),
  sapPoNumber: z.string().max(32).optional().nullable(),
  fullyReceivedOverride: z.boolean().optional().default(false),
});
export const procurementPatch = z
  .object({
    supplierId: id.nullable().optional(),
    title: z.string().min(1).max(500).optional(),
    status: rfqStatus.optional(),
    needBy: z.coerce.date().optional().nullable(),
    sapPoNumber: z.string().max(32).optional().nullable(),
    fullyReceivedOverride: z.boolean().optional(),
    version,
  })
  .strict();

const procurementQty = z
  .union([z.string().regex(/^\d*\.?\d+$/), z.number().nonnegative()])
  .transform((v) => String(v));

export const projectItemKind = z.enum(["hardware", "software"]);
export const projectItemStatus = z.enum([
  "specified",
  "on_order",
  "partial",
  "received",
  "cancelled",
]);

export const projectItemCreate = z.object({
  projectId: id,
  kind: projectItemKind.default("hardware"),
  partNumber: z.string().max(256).optional().nullable(),
  description: z.string().min(1).max(2000),
  quantity: procurementQty,
  unit: z.string().max(32).optional().nullable(),
  status: projectItemStatus.default("specified"),
  notes: z.string().max(4000).optional().default(""),
  orderIndex: z.number().int().min(0).default(0),
});

export const projectItemPatch = z
  .object({
    kind: projectItemKind.optional(),
    partNumber: z.string().max(256).optional().nullable(),
    description: z.string().min(1).max(2000).optional(),
    quantity: procurementQty.optional(),
    unit: z.string().max(32).optional().nullable(),
    status: projectItemStatus.optional(),
    notes: z.string().max(4000).optional(),
    orderIndex: z.number().int().min(0).optional(),
    version,
  })
  .strict();

export const procurementLineCreate = z.object({
  procurementId: id,
  projectId: id,
  projectItemId: id.optional().nullable(),
  partNumber: z.string().max(256).optional().nullable(),
  description: z.string().min(1).max(2000),
  quantity: procurementQty,
  orderedQty: procurementQty.optional().nullable(),
  unit: z.string().max(32).optional().nullable(),
  estUnitPrice: z
    .union([z.string(), z.number().nonnegative()])
    .optional()
    .nullable(),
  orderIndex: z.number().int().min(0).default(0),
  receivedQty: z.number().int().min(0).optional().default(0),
  /** When true and projectItemId omitted, creates a linked project item from the line. Default true. */
  createProjectItem: z.boolean().optional().default(true),
});
export const procurementLinePatch = z
  .object({
    projectId: id.optional(),
    projectItemId: id.nullable().optional(),
    partNumber: z.string().max(256).optional().nullable(),
    description: z.string().min(1).max(2000).optional(),
    quantity: procurementQty.optional(),
    orderedQty: procurementQty.optional().nullable(),
    unit: z.string().max(32).optional().nullable(),
    estUnitPrice: z
      .union([z.string(), z.number().nonnegative()])
      .optional()
      .nullable(),
    orderIndex: z.number().int().min(0).optional(),
    receivedQty: z.number().int().min(0).optional(),
    version,
  })
  .strict();

/** First id is the kept procurement; remaining ids are merged into it. */
export const assetCreate = z.object({
  name: z.string().min(1).max(500),
  site: z.string().min(1).max(200),
  line: z.string().min(1).max(200),
  serial: z.string().max(200).optional().nullable(),
  clientId: id.optional().nullable(),
});

export const assetPatch = z
  .object({
    name: z.string().min(1).max(500).optional(),
    site: z.string().min(1).max(200).optional(),
    line: z.string().min(1).max(200).optional(),
    serial: z.string().max(200).optional().nullable(),
    clientId: id.optional().nullable(),
    version,
  })
  .strict();

export const assetServiceLogCreate = z.object({
  assetId: id,
  title: z.string().min(1).max(500),
  description: z.string().max(10000).optional().nullable(),
  performedAt: z.coerce.date().optional(),
  technicianName: z.string().max(200).optional().nullable(),
});

export const assetServiceLogPatch = z
  .object({
    title: z.string().min(1).max(500).optional(),
    description: z.string().max(10000).optional().nullable(),
    performedAt: z.coerce.date().optional(),
    technicianName: z.string().max(200).optional().nullable(),
    version,
  })
  .strict();

export const workCompleteWorkType = z.enum(["machine", "customer_service"]);

export const workCompleteParse = z.object({
  workType: workCompleteWorkType,
  notes: z.string().min(1).max(50000),
  clientId: id.optional().nullable(),
  assetId: id.optional().nullable(),
});

export const workCompleteConfirm = z.object({
  workType: workCompleteWorkType,
  rawNotes: z.string().max(50000).optional().nullable(),
  clientId: id.optional().nullable(),
  assetId: id,
  projectId: id,
  taskId: id.optional().nullable(),
  newTask: z
    .object({
      title: z.string().min(1).max(500),
      milestoneId: id.optional().nullable(),
    })
    .optional()
    .nullable(),
  timeEntry: z.object({
    startedAt: z.coerce.date().optional().nullable(),
    endedAt: z.coerce.date().optional().nullable(),
    durationMinutes: z.number().int().positive().optional().nullable(),
    note: z.string().max(5000).optional().nullable(),
  }),
  serviceLog: z.object({
    title: z.string().min(1).max(500),
    description: z.string().max(10000).optional().nullable(),
    performedAt: z.coerce.date().optional().nullable(),
    technicianName: z.string().max(200).optional().nullable(),
  }),
  reportMarkdown: z.string().min(1).max(200000),
});

export const procurementMerge = z.object({
  ids: z.array(id).min(2),
});

export const procurementAiDocumentType = z.enum(["po", "tax_invoice", "other"]);

/** AI parse result returned to the client for review (projectId may be null until confirm). */
export const procurementAiDraftLine = z.object({
  partNumber: z.string().max(256).optional().nullable(),
  description: z.string().min(1).max(2000),
  quantity: procurementQty.optional().default("1"),
  orderedQty: procurementQty.optional().nullable(),
  unit: z.string().max(32).optional().nullable(),
  estUnitPrice: z
    .union([z.string(), z.number().nonnegative()])
    .optional()
    .nullable(),
  projectId: id.optional().nullable(),
});

export const procurementAiDraft = z.object({
  documentType: procurementAiDocumentType.optional().default("other"),
  title: z.string().min(1).max(500),
  supplierId: id.optional().nullable(),
  supplierNameRaw: z.string().max(500).optional().nullable(),
  status: rfqStatus.optional().default("draft"),
  needBy: z.coerce.date().optional().nullable(),
  sapPoNumber: z.string().max(32).optional().nullable(),
  confidenceNotes: z.string().max(4000).optional().nullable(),
  lines: z.array(procurementAiDraftLine).min(0).max(500),
});

/** Confirm body: every line must have a projectId. */
export const procurementAiConfirmLine = z.object({
  partNumber: z.string().max(256).optional().nullable(),
  description: z.string().min(1).max(2000),
  quantity: procurementQty,
  orderedQty: procurementQty.optional().nullable(),
  unit: z.string().max(32).optional().nullable(),
  estUnitPrice: z
    .union([z.string(), z.number().nonnegative()])
    .optional()
    .nullable(),
  projectId: id,
});

export const procurementAiConfirm = z.object({
  title: z.string().min(1).max(500),
  supplierId: id.optional().nullable(),
  status: rfqStatus.optional().default("draft"),
  needBy: z.coerce.date().optional().nullable(),
  sapPoNumber: z.string().max(32).optional().nullable(),
  lines: z.array(procurementAiConfirmLine).min(1).max(500),
  createProjectItems: z.boolean().optional().default(true),
});

export const projectMemberAdd = z.object({
  userId: id,
  role: z.enum(["viewer", "member", "pm", "admin"]).default("member"),
});
export const projectMemberPatch = z.object({
  role: z.enum(["viewer", "member", "pm", "admin"]),
});

export const taskDependencyCreate = z.object({
  taskId: id,
  predecessorTaskId: id,
  type: z.enum(["FS", "SS", "FF", "SF"]).default("FS"),
});

export const savedFilterCreate = z.object({
  name: z.string().min(1).max(255),
  projectId: id.nullable().optional(),
  kind: z.enum([
    "tasks",
    "todos",
    "time",
    "rfq",
    "projects",
  ]).default("todos"),
  filterJson: z.string().min(0).max(20000).default("{}"),
  isDefault: z.boolean().default(false),
});
export const savedFilterPatch = z
  .object({
    name: z.string().min(1).max(255).optional(),
    filterJson: z.string().min(0).max(20000).optional(),
    isDefault: z.boolean().optional(),
    version,
  })
  .strict();

export const documentLinkCreate = z.object({
  projectId: id,
  kind: z
    .enum([
      "drawing",
      "program",
      "photo",
      "other",
    ])
    .default("other"),
  label: z.string().min(1).max(500),
  url: z.string().url().max(2000),
});
export const documentLinkPatch = z
  .object({
    kind: z
      .enum(["drawing", "program", "photo", "other"])
      .optional(),
    label: z.string().min(1).max(500).optional(),
    url: z.string().url().max(2000).optional(),
    version,
  })
  .strict();

export const handoverCreate = z.object({
  projectId: id,
  asBuilt: z.string().max(20000).optional().nullable(),
  spares: z.string().max(20000).optional().nullable(),
  supportNotes: z.string().max(20000).optional().nullable(),
});
export const handoverPatch = z
  .object({
    asBuilt: z.string().max(20000).optional().nullable(),
    spares: z.string().max(20000).optional().nullable(),
    supportNotes: z.string().max(20000).optional().nullable(),
    version,
  })
  .strict();

export const commentCreate = z.object({
  body: z.string().min(1).max(10000),
  parentType: z.enum([
    "project",
    "task",
    "todo",
    "procurement",
  ]),
  parentId: z.string().uuid(),
});

export const orgUserInvite = z.object({
  email: email,
  name: name,
  projectRole: z
    .enum(["viewer", "member", "pm", "admin"])
    .default("member"),
  globalRole: z
    .enum(["member", "org_admin"])
    .default("member"),
});
