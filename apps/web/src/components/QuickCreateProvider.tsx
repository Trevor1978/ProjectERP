import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  type ReactNode,
} from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import { useMe } from "../hooks/useMe";
import { createQuickCreateEntity } from "../lib/quickCreate/createEntity";
import type {
  QuickCreateEntity,
  QuickCreateFilter,
} from "../lib/quickCreate/types";
import { PROC_ALL_QUERY_KEY, type ProcAllData } from "../workspace/procurementCache";

type Client = { id: string; name: string };
type Supplier = { id: string; name: string };
type Project = { id: string; name: string; clientId: string };
type Milestone = { id: string; name: string; projectId: string };
type Task = { id: string; title: string; projectId: string; milestoneId: string };
type Todo = { id: string; title: string; taskId: string };
type Procurement = { id: string; title: string };

type QuickCreateContextValue = {
  organizationId: string;
  getOptions: (
    entity: QuickCreateEntity,
    filter?: QuickCreateFilter,
  ) => { value: string; label: string }[];
  createEntity: (
    entity: QuickCreateEntity,
    values: Record<string, string>,
  ) => Promise<string>;
  refreshEntity: (entity: QuickCreateEntity) => Promise<void>;
};

const QuickCreateContext = createContext<QuickCreateContextValue | null>(null);

export function QuickCreateProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const { data: meData } = useMe();
  const organizationId = meData?.user?.organizationId ?? "";

  const { data: clientsData } = useQuery({
    queryKey: ["clients"],
    queryFn: () => api<{ clients: Client[] }>("/api/clients"),
    enabled: Boolean(organizationId),
  });
  const { data: suppliersData } = useQuery({
    queryKey: ["suppliers"],
    queryFn: () => api<{ suppliers: Supplier[] }>("/api/suppliers"),
    enabled: Boolean(organizationId),
  });
  const { data: projectsData } = useQuery({
    queryKey: ["projects"],
    queryFn: () => api<{ projects: Project[] }>("/api/projects"),
    enabled: Boolean(organizationId),
  });
  const { data: milestonesData } = useQuery({
    queryKey: ["milestones-all"],
    queryFn: () => api<{ milestones: Milestone[] }>("/api/milestones"),
    enabled: Boolean(organizationId),
  });
  const { data: tasksData } = useQuery({
    queryKey: ["tasks-all"],
    queryFn: () => api<{ tasks: Task[] }>("/api/tasks"),
    enabled: Boolean(organizationId),
  });
  const { data: todosData } = useQuery({
    queryKey: ["todos-all"],
    queryFn: () => api<{ todos: Todo[] }>("/api/todos"),
    enabled: Boolean(organizationId),
  });
  const { data: procData } = useQuery({
    queryKey: PROC_ALL_QUERY_KEY,
    queryFn: () => api<ProcAllData>("/api/procurement"),
    enabled: Boolean(organizationId),
  });

  const clients = clientsData?.clients ?? [];
  const suppliers = suppliersData?.suppliers ?? [];
  const projects = projectsData?.projects ?? [];
  const milestones = milestonesData?.milestones ?? [];
  const tasks = tasksData?.tasks ?? [];
  const todos = todosData?.todos ?? [];
  const procurement = procData?.procurement ?? [];

  const getOptions = useCallback(
    (entity: QuickCreateEntity, filter?: QuickCreateFilter) => {
      switch (entity) {
        case "client":
          return clients.map((c) => ({ value: c.id, label: c.name }));
        case "supplier":
          return suppliers.map((s) => ({ value: s.id, label: s.name }));
        case "project":
          return projects.map((p) => ({ value: p.id, label: p.name }));
        case "milestone":
          return milestones
            .filter((m) => !filter?.projectId || m.projectId === filter.projectId)
            .map((m) => ({ value: m.id, label: m.name }));
        case "task":
          return tasks
            .filter(
              (t) =>
                (!filter?.projectId || t.projectId === filter.projectId) &&
                (!filter?.milestoneId || t.milestoneId === filter.milestoneId),
            )
            .map((t) => ({ value: t.id, label: t.title }));
        case "todo":
          return todos
            .filter((td) => {
              if (!filter?.taskId) return true;
              return td.taskId === filter.taskId;
            })
            .map((td) => ({ value: td.id, label: td.title }));
        case "procurement":
          return procurement.map((p) => ({ value: p.id, label: p.title }));
      }
    },
    [clients, suppliers, projects, milestones, tasks, todos, procurement],
  );

  const refreshEntity = useCallback(
    async (entity: QuickCreateEntity) => {
      switch (entity) {
        case "client":
          await qc.invalidateQueries({ queryKey: ["clients"] });
          break;
        case "supplier":
          await qc.invalidateQueries({ queryKey: ["suppliers"] });
          break;
        case "project":
          await qc.invalidateQueries({ queryKey: ["projects"] });
          break;
        case "milestone":
          await qc.invalidateQueries({ queryKey: ["milestones-all"] });
          break;
        case "task":
          await qc.invalidateQueries({ queryKey: ["tasks-all"] });
          break;
        case "todo":
          await qc.invalidateQueries({ queryKey: ["todos-all"] });
          break;
        case "procurement":
          await qc.invalidateQueries({ queryKey: PROC_ALL_QUERY_KEY });
          break;
      }
    },
    [qc],
  );

  const createEntity = useCallback(
    async (entity: QuickCreateEntity, values: Record<string, string>) => {
      if (!organizationId) throw new Error("Not signed in");
      const id = await createQuickCreateEntity(entity, values, organizationId);
      await refreshEntity(entity);
      if (entity === "milestone" || entity === "task") {
        await refreshEntity("milestone");
        await refreshEntity("task");
      }
      if (entity === "task" || entity === "todo") {
        await refreshEntity("task");
        await refreshEntity("todo");
      }
      if (entity === "project") {
        await refreshEntity("milestone");
      }
      return id;
    },
    [organizationId, refreshEntity],
  );

  const value = useMemo(
    () => ({
      organizationId,
      getOptions,
      createEntity,
      refreshEntity,
    }),
    [organizationId, getOptions, createEntity, refreshEntity],
  );

  if (!organizationId) {
    return <>{children}</>;
  }

  return <QuickCreateContext.Provider value={value}>{children}</QuickCreateContext.Provider>;
}

export function useQuickCreate() {
  const ctx = useContext(QuickCreateContext);
  if (!ctx) {
    throw new Error("useQuickCreate must be used within QuickCreateProvider");
  }
  return ctx;
}

export function useQuickCreateOptional() {
  return useContext(QuickCreateContext);
}
