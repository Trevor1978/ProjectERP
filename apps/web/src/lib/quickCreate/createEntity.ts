import { api } from "../api";
import type { QuickCreateEntity } from "./types";

export async function createQuickCreateEntity(
  entity: QuickCreateEntity,
  values: Record<string, string>,
  organizationId: string,
): Promise<string> {
  switch (entity) {
    case "client": {
      const name = values.name?.trim();
      if (!name) throw new Error("Name is required");
      const res = await api<{ client: { id: string } }>("/api/clients", {
        method: "POST",
        body: JSON.stringify({ organizationId, name }),
      });
      return res.client.id;
    }
    case "supplier": {
      const name = values.name?.trim();
      if (!name) throw new Error("Name is required");
      const res = await api<{ supplier: { id: string } }>("/api/suppliers", {
        method: "POST",
        body: JSON.stringify({ organizationId, name }),
      });
      return res.supplier.id;
    }
    case "project": {
      const name = values.name?.trim();
      const clientId = values.clientId?.trim();
      if (!name) throw new Error("Name is required");
      if (!clientId) throw new Error("Customer is required");
      const res = await api<{ project: { id: string } }>("/api/projects", {
        method: "POST",
        body: JSON.stringify({ organizationId, clientId, name, status: "active" }),
      });
      return res.project.id;
    }
    case "milestone": {
      const name = values.name?.trim();
      const projectId = values.projectId?.trim();
      if (!name) throw new Error("Name is required");
      if (!projectId) throw new Error("Project is required");
      const res = await api<{ milestone: { id: string } }>("/api/milestones", {
        method: "POST",
        body: JSON.stringify({ projectId, name, orderIndex: 0 }),
      });
      return res.milestone.id;
    }
    case "task": {
      const title = values.title?.trim();
      const projectId = values.projectId?.trim();
      const milestoneId = values.milestoneId?.trim();
      if (!title) throw new Error("Title is required");
      if (!projectId) throw new Error("Project is required");
      if (!milestoneId) throw new Error("Milestone is required");
      const res = await api<{ task: { id: string } }>("/api/tasks", {
        method: "POST",
        body: JSON.stringify({
          projectId,
          milestoneId,
          title,
          percentComplete: 0,
          useDerivedPercent: true,
          orderIndex: 0,
        }),
      });
      return res.task.id;
    }
    case "todo": {
      const title = values.title?.trim();
      const taskId = values.taskId?.trim();
      if (!title) throw new Error("Title is required");
      if (!taskId) throw new Error("Task is required");
      const res = await api<{ todo: { id: string } }>("/api/todos", {
        method: "POST",
        body: JSON.stringify({ taskId, title }),
      });
      return res.todo.id;
    }
    case "procurement": {
      const title = values.title?.trim();
      if (!title) throw new Error("Title is required");
      const res = await api<{ procurement: { id: string } }>("/api/procurement", {
        method: "POST",
        body: JSON.stringify({ title, status: "draft" }),
      });
      return res.procurement.id;
    }
  }
}
