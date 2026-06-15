export type User = {
  id: string;
  email: string;
  name: string;
  organizationId: string;
  globalRole: "member" | "org_admin";
  org: { id: string; name: string; slug: string };
};

export type Project = {
  id: string;
  name: string;
  code: string | null;
  clientId: string;
  status: string;
  startAt: string | null;
  endAt: string | null;
  version: number;
};

export type Task = {
  id: string;
  projectId: string;
  milestoneId: string;
  title: string;
  startAt: string | null;
  endAt: string | null;
  estDays: number | null;
  actualHours: number | null;
  percentComplete: number;
  useDerivedPercent: boolean;
  version: number;
};

export type Todo = {
  id: string;
  taskId: string;
  title: string;
  status: "backlog" | "in_progress" | "blocked" | "done";
  orderIndex: number;
  version: number;
};

export type Client = { id: string; name: string; code: string | null; version: number };
export type Milestone = { id: string; projectId: string; name: string; orderIndex: number; version: number };
export type Procurement = {
  id: string;
  projectId: string;
  title: string;
  status: string;
  supplierId: string | null;
  sapPoNumber: string | null;
  version: number;
};

export type Schedule = {
  project: Project;
  milestones: Milestone[];
  tasks: Task[];
  taskDependencies: {
    id: string;
    taskId: string;
    predecessorTaskId: string;
    type: string;
  }[];
  todos: Todo[];
  /** Set by GET /projects/:id/schedule — whether current user can PATCH the project */
  canEditProject?: boolean;
};
