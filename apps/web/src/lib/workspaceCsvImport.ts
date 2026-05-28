import { api } from "./api";
import type { CsvImportHandler } from "../components/WorkspaceCsvToolbar";

type Tab =
  | "customers"
  | "suppliers"
  | "projects"
  | "milestones"
  | "tasks"
  | "todos"
  | "timeEntries"
  | "procurement"
  | "procurementLines";

export function buildCsvImportHandler(
  tab: Tab,
  ctx: {
    organizationId: string;
    clients: { id: string; name: string }[];
    suppliers: { id: string; name: string }[];
    projects: { id: string; name: string }[];
    milestones: { id: string; name: string; projectId: string }[];
    tasks: { id: string; title: string }[];
    procurement: { id: string; title: string }[];
    onDone: () => Promise<void>;
  },
): CsvImportHandler | undefined {
  const byName = <T extends { id: string; name: string }>(list: T[], label: string) => {
    const m = new Map(list.map((x) => [x.name.trim().toLowerCase(), x.id]));
    return (name: string) => {
      const id = m.get(name.trim().toLowerCase());
      if (!id) throw new Error(`${label} not found: ${name}`);
      return id;
    };
  };

  const resolveProject = byName(ctx.projects, "Project");
  const resolveClient = byName(ctx.clients, "Client");
  const resolveSupplier = byName(ctx.suppliers, "Supplier");
  const resolveTask = (title: string) => {
    const m = new Map(ctx.tasks.map((t) => [t.title.trim().toLowerCase(), t.id]));
    const id = m.get(title.trim().toLowerCase());
    if (!id) throw new Error(`Task not found: ${title}`);
    return id;
  };
  const resolveMilestone = (name: string, projectId: string) => {
    const m = new Map(
      ctx.milestones
        .filter((ms) => ms.projectId === projectId)
        .map((ms) => [ms.name.trim().toLowerCase(), ms.id]),
    );
    const id = m.get(name.trim().toLowerCase());
    if (!id) throw new Error(`Milestone not found: ${name}`);
    return id;
  };
  const resolveProcurement = (title: string) => {
    const m = new Map(ctx.procurement.map((p) => [p.title.trim().toLowerCase(), p.id]));
    const id = m.get(title.trim().toLowerCase());
    if (!id) throw new Error(`Purchasing not found: ${title}`);
    return id;
  };

  async function run(
    records: Record<string, string>[],
    fn: (rec: Record<string, string>) => Promise<void>,
  ): Promise<{ ok: number; failed: string[] }> {
    let ok = 0;
    const failed: string[] = [];
    for (const rec of records) {
      try {
        await fn(rec);
        ok++;
      } catch (e) {
        failed.push(e instanceof Error ? e.message : "Row failed");
      }
    }
    await ctx.onDone();
    return { ok, failed };
  }

  switch (tab) {
    case "customers":
      return (records) =>
        run(records, async (rec) => {
          const name = rec.Name?.trim();
          if (!name) throw new Error("Name is required");
          await api("/api/clients", {
            method: "POST",
            body: JSON.stringify({
              organizationId: ctx.organizationId,
              name,
              code: rec.Code?.trim() || null,
            }),
          });
        });
    case "suppliers":
      return (records) =>
        run(records, async (rec) => {
          const name = rec.Name?.trim();
          if (!name) throw new Error("Name is required");
          await api("/api/suppliers", {
            method: "POST",
            body: JSON.stringify({
              organizationId: ctx.organizationId,
              name,
              code: rec.Code?.trim() || null,
              notes: rec.Notes?.trim() || null,
            }),
          });
        });
    case "projects":
      return (records) =>
        run(records, async (rec) => {
          const name = rec.Name?.trim();
          if (!name) throw new Error("Name is required");
          const clientName = rec.Client?.trim();
          if (!clientName) throw new Error("Client is required");
          await api("/api/projects", {
            method: "POST",
            body: JSON.stringify({
              organizationId: ctx.organizationId,
              name,
              code: rec.Code?.trim() || null,
              clientId: resolveClient(clientName),
              status: rec.Status?.trim() || "draft",
            }),
          });
        });
    case "milestones":
      return (records) =>
        run(records, async (rec) => {
          const name = rec.Name?.trim();
          const projectName = rec.Project?.trim();
          if (!name || !projectName) throw new Error("Name and Project are required");
          const projectId = resolveProject(projectName);
          await api("/api/milestones", {
            method: "POST",
            body: JSON.stringify({
              projectId,
              name,
              orderIndex: Number(rec.Order || 0) || 0,
            }),
          });
        });
    case "tasks":
      return (records) =>
        run(records, async (rec) => {
          const title = rec.Title?.trim();
          const projectName = rec.Project?.trim();
          const milestoneName = rec.Milestone?.trim();
          if (!title || !projectName || !milestoneName) {
            throw new Error("Title, Project, and Milestone are required");
          }
          const projectId = resolveProject(projectName);
          await api("/api/tasks", {
            method: "POST",
            body: JSON.stringify({
              projectId,
              milestoneId: resolveMilestone(milestoneName, projectId),
              title,
              orderIndex: Number(rec.Order || 0) || 0,
            }),
          });
        });
    case "todos":
      return (records) =>
        run(records, async (rec) => {
          const title = rec.Title?.trim();
          const taskTitle = rec.Task?.trim();
          if (!title || !taskTitle) throw new Error("Title and Task are required");
          await api("/api/todos", {
            method: "POST",
            body: JSON.stringify({
              taskId: resolveTask(taskTitle),
              title,
              description: rec.Description?.trim() || null,
              status: rec.Status?.trim() || "backlog",
              priority: rec.Priority?.trim() || "medium",
              orderIndex: Number(rec.Order || 0) || 0,
            }),
          });
        });
    case "procurement":
      return (records) =>
        run(records, async (rec) => {
          const title = rec.Title?.trim();
          if (!title) throw new Error("Title is required");
          const supplierName = rec.Supplier?.trim();
          await api("/api/procurement", {
            method: "POST",
            body: JSON.stringify({
              title,
              status: rec.Status?.trim() || "draft",
              supplierId: supplierName ? resolveSupplier(supplierName) : null,
            }),
          });
        });
    case "procurementLines":
      return (records) =>
        run(records, async (rec) => {
          const description = rec.Description?.trim();
          const purchasingTitle = rec.Purchasing?.trim();
          const projectName = rec.Project?.trim();
          if (!description || !purchasingTitle || !projectName) {
            throw new Error("Description, Purchasing, and Project are required");
          }
          await api("/api/procurement-lines", {
            method: "POST",
            body: JSON.stringify({
              procurementId: resolveProcurement(purchasingTitle),
              projectId: resolveProject(projectName),
              partNumber: rec["Part #"]?.trim() || null,
              description,
              quantity: rec.Qty?.trim() || "1",
              orderedQty: rec.Ordered?.trim() || null,
              orderIndex: Number(rec["Order index"] || 0) || 0,
            }),
          });
        });
    default:
      return undefined;
  }
}
