import { useEffect, useMemo, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import { useMe } from "../hooks/useMe";
import type { User } from "../types";
import { TodoKanban } from "./TodoKanban";

type Client = { id: string; name: string; code: string | null; version: number };
type Project = {
  id: string;
  name: string;
  code: string | null;
  clientId: string;
  status: "draft" | "active" | "on_hold" | "closed";
  startAt: string | null;
  endAt: string | null;
  version: number;
};
type Milestone = {
  id: string;
  projectId: string;
  name: string;
  startAt: string | null;
  endAt: string | null;
  orderIndex: number;
  version: number;
};
type Task = {
  id: string;
  projectId: string;
  milestoneId: string;
  title: string;
  description: string | null;
  startAt: string | null;
  endAt: string | null;
  estHours: number | null;
  actualHours: number | null;
  percentComplete: number;
  useDerivedPercent: boolean;
  orderIndex: number;
  assigneeId: string | null;
  version: number;
};
type Todo = {
  id: string;
  taskId: string;
  title: string;
  status: "backlog" | "in_progress" | "blocked" | "done";
  dueAt: string | null;
  priority: "low" | "normal" | "high" | "urgent";
  orderIndex: number;
  assigneeId: string | null;
  version: number;
};
type TimeEntry = {
  id: string;
  userId: string;
  taskId: string;
  todoId: string | null;
  startedAt: string | null;
  endedAt: string | null;
  durationMinutes: number | null;
  note: string | null;
  version: number;
};
type Procurement = {
  id: string;
  projectId: string;
  taskId: string | null;
  title: string;
  status: "draft" | "rfq_sent" | "quoted" | "ordered" | "closed" | "cancelled";
  needBy: string | null;
  sapPoNumber: string | null;
  version: number;
};
type ProcurementLine = {
  id: string;
  procurementId: string;
  description: string;
  quantity: string;
  unit: string | null;
  estUnitPrice: number | null;
  orderIndex: number;
  version: number;
};
type OrgUser = { id: string; name: string };

type Tab =
  | "customers"
  | "projects"
  | "milestones"
  | "tasks"
  | "todos"
  | "todoKanban"
  | "timeEntries"
  | "procurement"
  | "procurementLines";

const TABS: Tab[] = [
  "customers",
  "projects",
  "milestones",
  "tasks",
  "todos",
  "todoKanban",
  "timeEntries",
  "procurement",
  "procurementLines",
];

const LABEL: Record<Tab, string> = {
  customers: "Customers",
  projects: "Projects",
  milestones: "Milestones",
  tasks: "Tasks",
  todos: "Todos",
  todoKanban: "Todo Kanban",
  timeEntries: "Time entries",
  procurement: "Procurement",
  procurementLines: "Procurement lines",
};

const STATUS_OPTS = ["draft", "active", "on_hold", "closed"] as const;
const TODO_STATUS = ["backlog", "in_progress", "blocked", "done"] as const;
const TODO_PRIORITY = ["low", "normal", "high", "urgent"] as const;
const PROC_STATUS = ["draft", "rfq_sent", "quoted", "ordered", "closed", "cancelled"] as const;

const isoToLocal = (v: string | null | undefined) =>
  v ? new Date(v).toISOString().slice(0, 16) : "";
const localToIso = (v: string) => (v.trim() ? new Date(v).toISOString() : null);

type TableRow = {
  key: string;
  cells: React.ReactNode[];
  action: React.ReactNode;
  search: string;
  sort: (string | number | null)[];
};

type EditTarget = { tab: Tab; id: string } | null;

const newRowInputClass = "w-full min-w-[6rem] rounded border border-dashed border-slate-300 bg-white px-2 py-1.5 text-sm placeholder:text-slate-400";

export function CrudWorkspace() {
  const qc = useQueryClient();
  const { data: meRes } = useMe();
  const me = meRes?.user ?? null;
  const [tab, setTab] = useState<Tab>("projects");
  const [editTarget, setEditTarget] = useState<EditTarget>(null);

  const { data: clientsData } = useQuery({
    queryKey: ["clients"],
    queryFn: () => api<{ clients: Client[] }>("/api/clients"),
  });
  const { data: projectsData } = useQuery({
    queryKey: ["projects"],
    queryFn: () => api<{ projects: Project[] }>("/api/projects"),
  });
  const { data: milestonesData } = useQuery({
    queryKey: ["milestones-all"],
    queryFn: () => api<{ milestones: Milestone[] }>("/api/milestones"),
  });
  const { data: tasksData } = useQuery({
    queryKey: ["tasks-all"],
    queryFn: () => api<{ tasks: Task[] }>("/api/tasks"),
  });
  const { data: todosData } = useQuery({
    queryKey: ["todos-all"],
    queryFn: () => api<{ todos: Todo[] }>("/api/todos"),
  });
  const { data: timeData } = useQuery({
    queryKey: ["time-all"],
    queryFn: () => api<{ timeEntries: TimeEntry[] }>("/api/time-entries"),
  });
  const { data: procData } = useQuery({
    queryKey: ["proc-all"],
    queryFn: () =>
      api<{ procurement: Procurement[]; lines: ProcurementLine[] }>("/api/procurement"),
  });
  const { data: orgUsersData } = useQuery({
    queryKey: ["org-users"],
    queryFn: () => api<{ users: OrgUser[] }>("/api/org/users"),
    retry: false,
  });

  const clients = clientsData?.clients ?? [];
  const projects = projectsData?.projects ?? [];
  const milestones = milestonesData?.milestones ?? [];
  const tasks = tasksData?.tasks ?? [];
  const todos = todosData?.todos ?? [];
  const timeEntries = timeData?.timeEntries ?? [];
  const procurement = procData?.procurement ?? [];
  const procLines = procData?.lines ?? [];
  const orgUsers = orgUsersData?.users ?? [];

  const projectName = useMemo(() => new Map(projects.map((p) => [p.id, p.name] as const)), [projects]);
  const clientName = useMemo(() => new Map(clients.map((c) => [c.id, c.name] as const)), [clients]);
  const milestoneName = useMemo(() => new Map(milestones.map((m) => [m.id, m.name] as const)), [milestones]);
  const taskName = useMemo(() => new Map(tasks.map((t) => [t.id, t.title] as const)), [tasks]);
  const procName = useMemo(() => new Map(procurement.map((p) => [p.id, p.title] as const)), [procurement]);
  const userName = useMemo(() => new Map(orgUsers.map((u) => [u.id, u.name] as const)), [orgUsers]);

  async function refreshClients() {
    await qc.invalidateQueries({ queryKey: ["clients"] });
  }
  async function refreshProjects() {
    await qc.invalidateQueries({ queryKey: ["projects"] });
  }
  async function refreshSchedule() {
    await qc.invalidateQueries({ queryKey: ["milestones-all"] });
    await qc.invalidateQueries({ queryKey: ["tasks-all"] });
    await qc.invalidateQueries({ queryKey: ["todos-all"] });
  }
  async function refreshTime() {
    await qc.invalidateQueries({ queryKey: ["time-all"] });
  }
  async function refreshProcurement() {
    await qc.invalidateQueries({ queryKey: ["proc-all"] });
  }

  const editBtn = (t: Tab, id: string) => (
    <button
      type="button"
      className="rounded border border-blue-200 bg-blue-50 px-2 py-1 text-sm font-medium text-blue-800 hover:bg-blue-100 whitespace-nowrap"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        setEditTarget({ tab: t, id });
      }}
    >
      Edit
    </button>
  );

  const assigneeOptions = useMemo(
    () => [{ value: "", label: "(unassigned)" }, ...orgUsers.map((u) => ({ value: u.id, label: u.name }))],
    [orgUsers],
  );
  const [kanbanProjectId, setKanbanProjectId] = useState("all");
  const [kanbanTaskId, setKanbanTaskId] = useState("all");
  const [kanbanAssigneeId, setKanbanAssigneeId] = useState("all");
  const [kanbanStatus, setKanbanStatus] = useState("all");
  const [kanbanSearch, setKanbanSearch] = useState("");

  const kanbanTasks = useMemo(
    () =>
      tasks.filter((t) =>
        kanbanProjectId === "all" ? true : t.projectId === kanbanProjectId,
      ),
    [tasks, kanbanProjectId],
  );

  useEffect(() => {
    if (kanbanTaskId !== "all" && !kanbanTasks.some((t) => t.id === kanbanTaskId)) {
      setKanbanTaskId("all");
    }
  }, [kanbanTaskId, kanbanTasks]);

  const kanbanTodos = useMemo(() => {
    const needle = kanbanSearch.trim().toLowerCase();
    const taskLookup = new Map(tasks.map((t) => [t.id, t] as const));
    return todos.filter((td) => {
      const task = taskLookup.get(td.taskId);
      if (!task) return false;
      if (kanbanProjectId !== "all" && task.projectId !== kanbanProjectId) return false;
      if (kanbanTaskId !== "all" && td.taskId !== kanbanTaskId) return false;
      if (kanbanAssigneeId !== "all" && (td.assigneeId ?? "") !== kanbanAssigneeId) return false;
      if (kanbanStatus !== "all" && td.status !== kanbanStatus) return false;
      if (!needle) return true;
      const projectLabel = projectName.get(task.projectId) ?? "";
      const assigneeLabel = userName.get(td.assigneeId ?? "") ?? "";
      return `${td.title} ${task.title} ${projectLabel} ${assigneeLabel} ${td.status}`
        .toLowerCase()
        .includes(needle);
    });
  }, [
    todos,
    tasks,
    kanbanProjectId,
    kanbanTaskId,
    kanbanAssigneeId,
    kanbanStatus,
    kanbanSearch,
    projectName,
    userName,
  ]);

  const rowsByTab: Record<Tab, { dataHeaders: string[]; rows: TableRow[] }> = {
    customers: {
      dataHeaders: ["Name", "Code"],
      rows: clients.map((c) => ({
        key: c.id,
        action: editBtn("customers", c.id),
        cells: [
          <InlineText
            key="n"
            value={c.name}
            onSave={(v) =>
              api("/api/clients/" + c.id, {
                method: "PATCH",
                body: JSON.stringify({ name: v, version: c.version }),
              }).then(refreshClients)
            }
          />,
          <InlineText
            key="code"
            value={c.code ?? ""}
            onSave={(v) =>
              api("/api/clients/" + c.id, {
                method: "PATCH",
                body: JSON.stringify({ code: v || null, version: c.version }),
              }).then(refreshClients)
            }
          />,
        ],
        search: `${c.name} ${c.code ?? ""}`,
        sort: [c.name, c.code ?? ""],
      })),
    },
    projects: {
      dataHeaders: ["Name", "Code", "Customer", "Status", "Start", "End", "Open"],
      rows: projects.map((p) => ({
        key: p.id,
        action: editBtn("projects", p.id),
        cells: [
          <InlineText
            key="n"
            value={p.name}
            onSave={(v) =>
              api("/api/projects/" + p.id, {
                method: "PATCH",
                body: JSON.stringify({ name: v, version: p.version }),
              }).then(refreshProjects)
            }
          />,
          <InlineText
            key="code"
            value={p.code ?? ""}
            onSave={(v) =>
              api("/api/projects/" + p.id, {
                method: "PATCH",
                body: JSON.stringify({ code: v || null, version: p.version }),
              }).then(refreshProjects)
            }
          />,
          <InlineSelect
            key="cl"
            value={p.clientId}
            options={clients.map((cl) => ({ value: cl.id, label: cl.name }))}
            onSave={(v) =>
              api("/api/projects/" + p.id, {
                method: "PATCH",
                body: JSON.stringify({ clientId: v, version: p.version }),
              }).then(refreshProjects)
            }
          />,
          <InlineSelect
            key="st"
            value={p.status}
            options={STATUS_OPTS.map((s) => ({ value: s, label: s }))}
            onSave={(v) =>
              api("/api/projects/" + p.id, {
                method: "PATCH",
                body: JSON.stringify({ status: v, version: p.version }),
              }).then(refreshProjects)
            }
          />,
          <InlineDateTime
            key="s"
            value={p.startAt}
            onSave={(v) =>
              api("/api/projects/" + p.id, {
                method: "PATCH",
                body: JSON.stringify({ startAt: v, version: p.version }),
              }).then(refreshProjects)
            }
          />,
          <InlineDateTime
            key="e"
            value={p.endAt}
            onSave={(v) =>
              api("/api/projects/" + p.id, {
                method: "PATCH",
                body: JSON.stringify({ endAt: v, version: p.version }),
              }).then(refreshProjects)
            }
          />,
          <Link key="o" to={`/p/${p.id}`} className="text-blue-700 hover:underline">
            Open
          </Link>,
        ],
        search: `${p.name} ${p.code ?? ""} ${clientName.get(p.clientId) ?? ""} ${p.status}`,
        sort: [p.name, p.code ?? "", clientName.get(p.clientId) ?? "", p.status, p.startAt ?? "", p.endAt ?? ""],
      })),
    },
    milestones: {
      dataHeaders: ["Project", "Name", "Start", "End", "Order"],
      rows: milestones.map((m) => ({
        key: m.id,
        action: editBtn("milestones", m.id),
        cells: [
          <span key="p">{projectName.get(m.projectId) ?? m.projectId}</span>,
          <InlineText
            key="n"
            value={m.name}
            onSave={(v) =>
              api("/api/milestones/" + m.id, {
                method: "PATCH",
                body: JSON.stringify({ name: v, version: m.version }),
              }).then(refreshSchedule)
            }
          />,
          <InlineDateTime
            key="s"
            value={m.startAt}
            onSave={(v) =>
              api("/api/milestones/" + m.id, {
                method: "PATCH",
                body: JSON.stringify({ startAt: v, version: m.version }),
              }).then(refreshSchedule)
            }
          />,
          <InlineDateTime
            key="e"
            value={m.endAt}
            onSave={(v) =>
              api("/api/milestones/" + m.id, {
                method: "PATCH",
                body: JSON.stringify({ endAt: v, version: m.version }),
              }).then(refreshSchedule)
            }
          />,
          <InlineNumber
            key="o"
            value={m.orderIndex}
            onSave={(v) =>
              api("/api/milestones/" + m.id, {
                method: "PATCH",
                body: JSON.stringify({ orderIndex: v, version: m.version }),
              }).then(refreshSchedule)
            }
          />,
        ],
        search: `${projectName.get(m.projectId) ?? ""} ${m.name}`,
        sort: [projectName.get(m.projectId) ?? "", m.name, m.startAt ?? "", m.endAt ?? "", m.orderIndex],
      })),
    },
    tasks: {
      dataHeaders: ["Project", "Milestone", "Title", "%", "Order", "Derived", "Assignee"],
      rows: tasks.map((t) => {
        const msForProject = milestones.filter((x) => x.projectId === t.projectId);
        return {
          key: t.id,
          action: editBtn("tasks", t.id),
          cells: [
            <span key="p">{projectName.get(t.projectId) ?? t.projectId}</span>,
            <InlineSelect
              key="m"
              value={t.milestoneId}
              options={msForProject.map((m) => ({ value: m.id, label: m.name }))}
              onSave={(v) =>
                api("/api/tasks/" + t.id, {
                  method: "PATCH",
                  body: JSON.stringify({ milestoneId: v, version: t.version }),
                }).then(refreshSchedule)
              }
            />,
            <InlineText
              key="ti"
              value={t.title}
              onSave={(v) =>
                api("/api/tasks/" + t.id, {
                  method: "PATCH",
                  body: JSON.stringify({ title: v, version: t.version }),
                }).then(refreshSchedule)
              }
            />,
            <InlineNumber
              key="pc"
              value={t.percentComplete}
              min={0}
              max={100}
              onSave={(v) =>
                api("/api/tasks/" + t.id, {
                  method: "PATCH",
                  body: JSON.stringify({ percentComplete: v, version: t.version }),
                }).then(refreshSchedule)
              }
            />,
            <InlineNumber
              key="ord"
              value={t.orderIndex}
              onSave={(v) =>
                api("/api/tasks/" + t.id, {
                  method: "PATCH",
                  body: JSON.stringify({ orderIndex: v, version: t.version }),
                }).then(refreshSchedule)
              }
            />,
            <InlineCheckbox
              key="der"
              value={t.useDerivedPercent}
              onSave={(v) =>
                api("/api/tasks/" + t.id, {
                  method: "PATCH",
                  body: JSON.stringify({ useDerivedPercent: v, version: t.version }),
                }).then(refreshSchedule)
              }
            />,
            <InlineSelect
              key="as"
              value={t.assigneeId ?? ""}
              options={assigneeOptions}
              onSave={(v) =>
                api("/api/tasks/" + t.id, {
                  method: "PATCH",
                  body: JSON.stringify({ assigneeId: v || null, version: t.version }),
                }).then(refreshSchedule)
              }
            />,
          ],
          search: `${projectName.get(t.projectId) ?? ""} ${milestoneName.get(t.milestoneId) ?? ""} ${t.title}`,
          sort: [
            projectName.get(t.projectId) ?? "",
            milestoneName.get(t.milestoneId) ?? "",
            t.title,
            t.percentComplete,
            t.orderIndex,
            t.useDerivedPercent ? 1 : 0,
            userName.get(t.assigneeId ?? "") ?? "",
          ],
        };
      }),
    },
    todos: {
      dataHeaders: ["Task", "Title", "Status", "Due", "Priority", "Order", "Assignee"],
      rows: todos.map((td) => ({
        key: td.id,
        action: editBtn("todos", td.id),
        cells: [
          <span key="tk">{taskName.get(td.taskId) ?? td.taskId}</span>,
          <InlineText
            key="ti"
            value={td.title}
            onSave={(v) =>
              api("/api/todos/" + td.id, {
                method: "PATCH",
                body: JSON.stringify({ title: v, version: td.version }),
              }).then(refreshSchedule)
            }
          />,
          <InlineSelect
            key="st"
            value={td.status}
            options={TODO_STATUS.map((s) => ({ value: s, label: s }))}
            onSave={(v) =>
              api("/api/todos/" + td.id, {
                method: "PATCH",
                body: JSON.stringify({ status: v, version: td.version }),
              }).then(refreshSchedule)
            }
          />,
          <InlineDateTime
            key="due"
            value={td.dueAt}
            onSave={(v) =>
              api("/api/todos/" + td.id, {
                method: "PATCH",
                body: JSON.stringify({ dueAt: v, version: td.version }),
              }).then(refreshSchedule)
            }
          />,
          <InlineSelect
            key="pr"
            value={td.priority}
            options={TODO_PRIORITY.map((s) => ({ value: s, label: s }))}
            onSave={(v) =>
              api("/api/todos/" + td.id, {
                method: "PATCH",
                body: JSON.stringify({ priority: v, version: td.version }),
              }).then(refreshSchedule)
            }
          />,
          <InlineNumber
            key="ord"
            value={td.orderIndex}
            onSave={(v) =>
              api("/api/todos/" + td.id, {
                method: "PATCH",
                body: JSON.stringify({ orderIndex: v, version: td.version }),
              }).then(refreshSchedule)
            }
          />,
          <InlineSelect
            key="as"
            value={td.assigneeId ?? ""}
            options={assigneeOptions}
            onSave={(v) =>
              api("/api/todos/" + td.id, {
                method: "PATCH",
                body: JSON.stringify({ assigneeId: v || null, version: td.version }),
              }).then(refreshSchedule)
            }
          />,
        ],
        search: `${taskName.get(td.taskId) ?? ""} ${td.title} ${td.status} ${td.priority}`,
        sort: [
          taskName.get(td.taskId) ?? "",
          td.title,
          td.status,
          td.dueAt ?? "",
          td.priority,
          td.orderIndex,
          userName.get(td.assigneeId ?? "") ?? "",
        ],
      })),
    },
    todoKanban: {
      dataHeaders: [],
      rows: [],
    },
    timeEntries: {
      dataHeaders: ["Task", "Todo", "Minutes", "Start", "End", "User", "Note"],
      rows: timeEntries.map((te) => ({
        key: te.id,
        action: editBtn("timeEntries", te.id),
        cells: [
          <span key="tk">{taskName.get(te.taskId) ?? te.taskId}</span>,
          <span key="td">
            {te.todoId ? todos.find((x) => x.id === te.todoId)?.title ?? te.todoId : "—"}
          </span>,
          <InlineNumberNullable
            key="min"
            value={te.durationMinutes}
            int
            onSave={(v) =>
              api("/api/time-entries/" + te.id, {
                method: "PATCH",
                body: JSON.stringify({ durationMinutes: v, version: te.version }),
              }).then(refreshTime)
            }
          />,
          <InlineDateTime
            key="s"
            value={te.startedAt}
            onSave={(v) =>
              api("/api/time-entries/" + te.id, {
                method: "PATCH",
                body: JSON.stringify({ startedAt: v, version: te.version }),
              }).then(refreshTime)
            }
          />,
          <InlineDateTime
            key="e"
            value={te.endedAt}
            onSave={(v) =>
              api("/api/time-entries/" + te.id, {
                method: "PATCH",
                body: JSON.stringify({ endedAt: v, version: te.version }),
              }).then(refreshTime)
            }
          />,
          <span key="u">{userName.get(te.userId) ?? te.userId.slice(0, 8)}</span>,
          <InlineText
            key="note"
            value={te.note ?? ""}
            onSave={(v) =>
              api("/api/time-entries/" + te.id, {
                method: "PATCH",
                body: JSON.stringify({ note: v || null, version: te.version }),
              }).then(refreshTime)
            }
          />,
        ],
        search: `${taskName.get(te.taskId) ?? ""} ${te.note ?? ""} ${userName.get(te.userId) ?? ""}`,
        sort: [
          taskName.get(te.taskId) ?? "",
          te.durationMinutes ?? 0,
          te.startedAt ?? "",
          te.endedAt ?? "",
          userName.get(te.userId) ?? "",
          te.note ?? "",
        ],
      })),
    },
    procurement: {
      dataHeaders: ["Project", "Task", "Title", "Status", "Need by", "SAP PO"],
      rows: procurement.map((p) => {
        const tasksForProject = tasks.filter((x) => x.projectId === p.projectId);
        return {
          key: p.id,
          action: editBtn("procurement", p.id),
          cells: [
            <span key="pr">{projectName.get(p.projectId) ?? p.projectId}</span>,
            <InlineSelect
              key="tk"
              value={p.taskId ?? ""}
              options={[{ value: "", label: "(none)" }, ...tasksForProject.map((t) => ({ value: t.id, label: t.title }))]}
              onSave={(v) =>
                api("/api/procurement/" + p.id, {
                  method: "PATCH",
                  body: JSON.stringify({ taskId: v || null, version: p.version }),
                }).then(refreshProcurement)
              }
            />,
            <InlineText
              key="ti"
              value={p.title}
              onSave={(v) =>
                api("/api/procurement/" + p.id, {
                  method: "PATCH",
                  body: JSON.stringify({ title: v, version: p.version }),
                }).then(refreshProcurement)
              }
            />,
            <InlineSelect
              key="st"
              value={p.status}
              options={PROC_STATUS.map((s) => ({ value: s, label: s }))}
              onSave={(v) =>
                api("/api/procurement/" + p.id, {
                  method: "PATCH",
                  body: JSON.stringify({ status: v, version: p.version }),
                }).then(refreshProcurement)
              }
            />,
            <InlineDateTime
              key="nb"
              value={p.needBy}
              onSave={(v) =>
                api("/api/procurement/" + p.id, {
                  method: "PATCH",
                  body: JSON.stringify({ needBy: v, version: p.version }),
                }).then(refreshProcurement)
              }
            />,
            <InlineText
              key="sap"
              value={p.sapPoNumber ?? ""}
              onSave={(v) =>
                api("/api/procurement/" + p.id, {
                  method: "PATCH",
                  body: JSON.stringify({ sapPoNumber: v || null, version: p.version }),
                }).then(refreshProcurement)
              }
            />,
          ],
          search: `${projectName.get(p.projectId) ?? ""} ${p.title} ${p.status}`,
          sort: [
            projectName.get(p.projectId) ?? "",
            taskName.get(p.taskId ?? "") ?? "",
            p.title,
            p.status,
            p.needBy ?? "",
            p.sapPoNumber ?? "",
          ],
        };
      }),
    },
    procurementLines: {
      dataHeaders: ["Procurement", "Description", "Qty", "Unit", "Est price", "Order"],
      rows: procLines.map((l) => ({
        key: l.id,
        action: editBtn("procurementLines", l.id),
        cells: [
          <span key="pr">{procName.get(l.procurementId) ?? l.procurementId}</span>,
          <InlineText
            key="d"
            value={l.description}
            onSave={(v) =>
              api("/api/procurement-lines/" + l.id, {
                method: "PATCH",
                body: JSON.stringify({ description: v, version: l.version }),
              }).then(refreshProcurement)
            }
          />,
          <InlineText
            key="q"
            value={l.quantity}
            onSave={(v) =>
              api("/api/procurement-lines/" + l.id, {
                method: "PATCH",
                body: JSON.stringify({ quantity: v, version: l.version }),
              }).then(refreshProcurement)
            }
          />,
          <InlineText
            key="u"
            value={l.unit ?? ""}
            onSave={(v) =>
              api("/api/procurement-lines/" + l.id, {
                method: "PATCH",
                body: JSON.stringify({ unit: v || null, version: l.version }),
              }).then(refreshProcurement)
            }
          />,
          <InlineNumberNullable
            key="price"
            value={l.estUnitPrice}
            onSave={(v) =>
              api("/api/procurement-lines/" + l.id, {
                method: "PATCH",
                body: JSON.stringify({ estUnitPrice: v, version: l.version }),
              }).then(refreshProcurement)
            }
          />,
          <InlineNumber
            key="ord"
            value={l.orderIndex}
            onSave={(v) =>
              api("/api/procurement-lines/" + l.id, {
                method: "PATCH",
                body: JSON.stringify({ orderIndex: v, version: l.version }),
              }).then(refreshProcurement)
            }
          />,
        ],
        search: `${procName.get(l.procurementId) ?? ""} ${l.description} ${l.quantity}`,
        sort: [
          procName.get(l.procurementId) ?? "",
          l.description,
          l.quantity,
          l.unit ?? "",
          l.estUnitPrice ?? 0,
          l.orderIndex,
        ],
      })),
    },
  };

  const current = rowsByTab[tab];

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">CRUD workspace (org-wide)</h1>
      <nav className="flex flex-wrap gap-1 border-b border-slate-200">
        {TABS.map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => setTab(k)}
            className={
              "px-3 py-2 text-sm -mb-px " +
              (tab === k ? "border-b-2 border-slate-900 font-medium" : "text-slate-500 hover:text-slate-800")
            }
          >
            {LABEL[k]}
          </button>
        ))}
      </nav>
      {tab === "todoKanban" ? (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <select
              className="rounded border px-2 py-1 text-sm"
              value={kanbanProjectId}
              onChange={(e) => setKanbanProjectId(e.target.value)}
            >
              <option value="all">All projects</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            <select
              className="rounded border px-2 py-1 text-sm"
              value={kanbanTaskId}
              onChange={(e) => setKanbanTaskId(e.target.value)}
            >
              <option value="all">All tasks</option>
              {kanbanTasks.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.title}
                </option>
              ))}
            </select>
            <select
              className="rounded border px-2 py-1 text-sm"
              value={kanbanAssigneeId}
              onChange={(e) => setKanbanAssigneeId(e.target.value)}
            >
              <option value="all">All assignees</option>
              <option value="">Unassigned</option>
              {orgUsers.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </select>
            <select
              className="rounded border px-2 py-1 text-sm"
              value={kanbanStatus}
              onChange={(e) => setKanbanStatus(e.target.value)}
            >
              <option value="all">All status</option>
              {TODO_STATUS.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
            <input
              className="min-w-64 rounded border px-2 py-1 text-sm"
              placeholder="Search todos/task/project/assignee..."
              value={kanbanSearch}
              onChange={(e) => setKanbanSearch(e.target.value)}
            />
            <span className="text-xs text-slate-500">{kanbanTodos.length} matching todos</span>
          </div>
          <TodoKanban
            projectId={kanbanProjectId === "all" ? "" : kanbanProjectId}
            tasks={tasks}
            todos={kanbanTodos}
            onUpdate={refreshSchedule}
          />
        </div>
      ) : (
        <FilterSortTable
          key={tab}
          dataHeaders={current.dataHeaders}
          rows={current.rows}
          appendRow={
            <CrudAppendRow
              tab={tab}
              totalColumns={current.dataHeaders.length + 1}
              me={me}
              clients={clients}
              projects={projects}
              milestones={milestones}
              tasks={tasks}
              todos={todos}
              procurement={procurement}
              refreshClients={refreshClients}
              refreshProjects={refreshProjects}
              refreshSchedule={refreshSchedule}
              refreshTime={refreshTime}
              refreshProcurement={refreshProcurement}
            />
          }
        />
      )}
      <p className="text-xs text-slate-500">
        Use the dashed <strong>new row</strong> at the bottom of each table to create records, click a cell to edit inline, or use <strong>Edit</strong> for all fields in a form. Time entries: you can only change your own unless you are an org admin.
      </p>

      {editTarget && (
        <EditDetailModal
          target={editTarget}
          onClose={() => setEditTarget(null)}
          clients={clients}
          projects={projects}
          milestones={milestones}
          tasks={tasks}
          todos={todos}
          timeEntries={timeEntries}
          procurement={procurement}
          lines={procLines}
          orgUsers={orgUsers}
          onSaved={async () => {
            await qc.invalidateQueries();
            setEditTarget(null);
          }}
        />
      )}
    </div>
  );
}

const PAGE_SIZE_OPTIONS = [
  { value: "20", label: "20" },
  { value: "50", label: "50" },
  { value: "100", label: "100" },
  { value: "all", label: "All" },
] as const;

function CrudAppendRow({
  tab,
  totalColumns,
  me,
  clients,
  projects,
  milestones,
  tasks,
  todos,
  procurement,
  refreshClients,
  refreshProjects,
  refreshSchedule,
  refreshTime,
  refreshProcurement,
}: {
  tab: Tab;
  totalColumns: number;
  me: User | null;
  clients: Client[];
  projects: Project[];
  milestones: Milestone[];
  tasks: Task[];
  todos: Todo[];
  procurement: Procurement[];
  refreshClients: () => Promise<void>;
  refreshProjects: () => Promise<void>;
  refreshSchedule: () => Promise<void>;
  refreshTime: () => Promise<void>;
  refreshProcurement: () => Promise<void>;
}) {
  const [err, setErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [custName, setCustName] = useState("");
  const [custCode, setCustCode] = useState("");

  const [projClientId, setProjClientId] = useState(clients[0]?.id ?? "");
  const [projName, setProjName] = useState("");
  const [projCode, setProjCode] = useState("");
  useEffect(() => {
    if (clients.length && !clients.some((c) => c.id === projClientId)) {
      setProjClientId(clients[0]!.id);
    }
  }, [clients, projClientId]);

  const [msProjectId, setMsProjectId] = useState(projects[0]?.id ?? "");
  const [msName, setMsName] = useState("");

  const [tkProjectId, setTkProjectId] = useState(projects[0]?.id ?? "");
  const msForTkProject = useMemo(
    () => milestones.filter((m) => m.projectId === tkProjectId),
    [milestones, tkProjectId],
  );
  const [tkMilestoneId, setTkMilestoneId] = useState(msForTkProject[0]?.id ?? "");
  const [tkTitle, setTkTitle] = useState("");
  useEffect(() => {
    if (msForTkProject.length && !msForTkProject.some((m) => m.id === tkMilestoneId)) {
      setTkMilestoneId(msForTkProject[0]!.id);
    }
  }, [msForTkProject, tkMilestoneId]);

  const [tdTaskId, setTdTaskId] = useState(tasks[0]?.id ?? "");
  const [tdTitle, setTdTitle] = useState("");

  const [teTaskId, setTeTaskId] = useState(tasks[0]?.id ?? "");

  const [prProjectId, setPrProjectId] = useState(projects[0]?.id ?? "");
  const [prTitle, setPrTitle] = useState("");

  const [lnProcId, setLnProcId] = useState(procurement[0]?.id ?? "");
  const [lnDesc, setLnDesc] = useState("");
  const [lnQty, setLnQty] = useState("1");
  useEffect(() => {
    if (procurement.length && !procurement.some((p) => p.id === lnProcId)) {
      setLnProcId(procurement[0]!.id);
    }
  }, [procurement, lnProcId]);

  useEffect(() => {
    setErr(null);
  }, [tab]);

  if (tab === "todoKanban" || !me) return null;

  const stickyActionsTd =
    "sticky right-0 z-[1] border-l border-slate-100 bg-slate-50 p-2 align-top shadow-[inset_1px_0_0_0_rgb(241_245_249)]";

  const createBtn = (onClick: () => void, disabled: boolean) => (
    <button
      type="button"
      disabled={disabled || saving}
      className="rounded border border-slate-800 bg-slate-900 px-2.5 py-1 text-xs font-medium text-white hover:bg-slate-800 disabled:opacity-40"
      onClick={() => {
        setErr(null);
        setSaving(true);
        void Promise.resolve(onClick())
          .catch((e: Error) => setErr(e.message))
          .finally(() => setSaving(false));
      }}
    >
      {saving ? "…" : "Create"}
    </button>
  );

  if (tab === "customers") {
    if (me.globalRole !== "org_admin") {
      return (
        <tr className="border-t bg-slate-50/90">
          <td colSpan={totalColumns} className="p-2 text-xs text-slate-500">
            Only <strong>org admins</strong> can add customers. Ask an admin or use an existing customer for new projects.
          </td>
        </tr>
      );
    }
    return (
      <tr className="border-t bg-slate-50/90">
        <td className="p-2 align-top">
          <input
            className={newRowInputClass}
            placeholder="New customer name"
            value={custName}
            onChange={(e) => setCustName(e.target.value)}
          />
        </td>
        <td className="p-2 align-top">
          <input
            className={newRowInputClass}
            placeholder="Code (optional)"
            value={custCode}
            onChange={(e) => setCustCode(e.target.value)}
          />
        </td>
        <td className={stickyActionsTd}>
          {createBtn(async () => {
            const name = custName.trim();
            if (!name) throw new Error("Name is required");
            await api("/api/clients", {
              method: "POST",
              body: JSON.stringify({
                organizationId: me.organizationId,
                name,
                code: custCode.trim() || undefined,
              }),
            });
            setCustName("");
            setCustCode("");
            await refreshClients();
          }, !custName.trim())}
          {err && <p className="mt-1 text-xs text-red-600">{err}</p>}
        </td>
      </tr>
    );
  }

  if (tab === "projects") {
    return (
      <tr className="border-t bg-slate-50/90">
        <td className="p-2 align-top">
          <input
            className={newRowInputClass}
            placeholder="Project name"
            value={projName}
            onChange={(e) => setProjName(e.target.value)}
          />
        </td>
        <td className="p-2 align-top">
          <input
            className={newRowInputClass}
            placeholder="Code (optional)"
            value={projCode}
            onChange={(e) => setProjCode(e.target.value)}
          />
        </td>
        <td className="p-2 align-top">
          <select
            className={newRowInputClass}
            value={projClientId}
            onChange={(e) => setProjClientId(e.target.value)}
          >
            {clients.length === 0 ? (
              <option value="">No customers — add one first</option>
            ) : (
              clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))
            )}
          </select>
        </td>
        <td colSpan={4} className="p-2 align-middle text-xs text-slate-500">
          Status defaults to <strong>active</strong>; edit dates inline after create.
        </td>
        <td className={stickyActionsTd}>
          {createBtn(async () => {
            const name = projName.trim();
            if (!name) throw new Error("Name is required");
            if (!projClientId) throw new Error("Select a customer");
            await api("/api/projects", {
              method: "POST",
              body: JSON.stringify({
                organizationId: me.organizationId,
                clientId: projClientId,
                name,
                code: projCode.trim() || undefined,
                status: "active",
              }),
            });
            setProjName("");
            setProjCode("");
            await refreshProjects();
          }, !projName.trim() || !projClientId)}
          {err && <p className="mt-1 text-xs text-red-600">{err}</p>}
        </td>
      </tr>
    );
  }

  if (tab === "milestones") {
    return (
      <tr className="border-t bg-slate-50/90">
        <td className="p-2 align-top">
          <select
            className={newRowInputClass}
            value={msProjectId}
            onChange={(e) => setMsProjectId(e.target.value)}
          >
            {projects.length === 0 ? (
              <option value="">No projects</option>
            ) : (
              projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))
            )}
          </select>
        </td>
        <td className="p-2 align-top">
          <input
            className={newRowInputClass}
            placeholder="Milestone name"
            value={msName}
            onChange={(e) => setMsName(e.target.value)}
          />
        </td>
        <td colSpan={3} className="p-2 align-middle text-xs text-slate-500">
          Dates/order: edit inline after create.
        </td>
        <td className={stickyActionsTd}>
          {createBtn(async () => {
            const name = msName.trim();
            if (!name) throw new Error("Name is required");
            if (!msProjectId) throw new Error("Select a project");
            await api("/api/milestones", {
              method: "POST",
              body: JSON.stringify({ projectId: msProjectId, name, orderIndex: 0 }),
            });
            setMsName("");
            await refreshSchedule();
          }, !msName.trim() || !msProjectId)}
          {err && <p className="mt-1 text-xs text-red-600">{err}</p>}
        </td>
      </tr>
    );
  }

  if (tab === "tasks") {
    return (
      <tr className="border-t bg-slate-50/90">
        <td className="p-2 align-top">
          <select
            className={newRowInputClass}
            value={tkProjectId}
            onChange={(e) => setTkProjectId(e.target.value)}
          >
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </td>
        <td className="p-2 align-top">
          <select
            className={newRowInputClass}
            value={tkMilestoneId}
            onChange={(e) => setTkMilestoneId(e.target.value)}
          >
            {msForTkProject.length === 0 ? (
              <option value="">Add a milestone first</option>
            ) : (
              msForTkProject.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))
            )}
          </select>
        </td>
        <td className="p-2 align-top">
          <input
            className={newRowInputClass}
            placeholder="Task title"
            value={tkTitle}
            onChange={(e) => setTkTitle(e.target.value)}
          />
        </td>
        <td colSpan={4} className="p-2 align-middle text-xs text-slate-500">
          % / assignee: edit after create.
        </td>
        <td className={stickyActionsTd}>
          {createBtn(async () => {
            const title = tkTitle.trim();
            if (!title) throw new Error("Title is required");
            if (!tkMilestoneId) throw new Error("Pick a milestone");
            await api("/api/tasks", {
              method: "POST",
              body: JSON.stringify({
                projectId: tkProjectId,
                milestoneId: tkMilestoneId,
                title,
                percentComplete: 0,
                useDerivedPercent: true,
                orderIndex: 0,
              }),
            });
            setTkTitle("");
            await refreshSchedule();
          }, !tkTitle.trim() || !tkMilestoneId || projects.length === 0)}
          {err && <p className="mt-1 text-xs text-red-600">{err}</p>}
        </td>
      </tr>
    );
  }

  if (tab === "todos") {
    return (
      <tr className="border-t bg-slate-50/90">
        <td className="p-2 align-top">
          <select
            className={newRowInputClass}
            value={tdTaskId}
            onChange={(e) => setTdTaskId(e.target.value)}
          >
            {tasks.length === 0 ? (
              <option value="">No tasks</option>
            ) : (
              tasks.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.title}
                </option>
              ))
            )}
          </select>
        </td>
        <td className="p-2 align-top">
          <input
            className={newRowInputClass}
            placeholder="Todo title"
            value={tdTitle}
            onChange={(e) => setTdTitle(e.target.value)}
          />
        </td>
        <td colSpan={5} className="p-2 align-middle text-xs text-slate-500">
          Status defaults to <strong>backlog</strong>.
        </td>
        <td className={stickyActionsTd}>
          {createBtn(async () => {
            const title = tdTitle.trim();
            if (!title) throw new Error("Title is required");
            if (!tdTaskId) throw new Error("Select a task");
            await api("/api/todos", {
              method: "POST",
              body: JSON.stringify({ taskId: tdTaskId, title }),
            });
            setTdTitle("");
            await refreshSchedule();
          }, !tdTitle.trim() || !tdTaskId)}
          {err && <p className="mt-1 text-xs text-red-600">{err}</p>}
        </td>
      </tr>
    );
  }

  if (tab === "timeEntries") {
    return (
      <tr className="border-t bg-slate-50/90">
        <td className="p-2 align-top">
          <select
            className={newRowInputClass}
            value={teTaskId}
            onChange={(e) => setTeTaskId(e.target.value)}
          >
            {tasks.length === 0 ? (
              <option value="">No tasks</option>
            ) : (
              tasks.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.title}
                </option>
              ))
            )}
          </select>
        </td>
        <td colSpan={6} className="p-2 align-middle text-xs text-slate-500">
          Log time on a task; add minutes and notes inline after create.
        </td>
        <td className={stickyActionsTd}>
          {createBtn(async () => {
            if (!teTaskId) throw new Error("Select a task");
            await api("/api/time-entries", {
              method: "POST",
              body: JSON.stringify({ taskId: teTaskId }),
            });
            await refreshTime();
          }, !teTaskId)}
          {err && <p className="mt-1 text-xs text-red-600">{err}</p>}
        </td>
      </tr>
    );
  }

  if (tab === "procurement") {
    return (
      <tr className="border-t bg-slate-50/90">
        <td className="p-2 align-top">
          <select
            className={newRowInputClass}
            value={prProjectId}
            onChange={(e) => setPrProjectId(e.target.value)}
          >
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </td>
        <td colSpan={1} className="p-2 align-top text-xs text-slate-400">
          —
        </td>
        <td className="p-2 align-top">
          <input
            className={newRowInputClass}
            placeholder="RFQ / procurement title"
            value={prTitle}
            onChange={(e) => setPrTitle(e.target.value)}
          />
        </td>
        <td colSpan={3} className="p-2 align-middle text-xs text-slate-500">
          Status <strong>draft</strong>; link a task after create.
        </td>
        <td className={stickyActionsTd}>
          {createBtn(async () => {
            const title = prTitle.trim();
            if (!title) throw new Error("Title is required");
            if (!prProjectId) throw new Error("Select a project");
            await api("/api/procurement", {
              method: "POST",
              body: JSON.stringify({ projectId: prProjectId, title, status: "draft" }),
            });
            setPrTitle("");
            await refreshProcurement();
          }, !prTitle.trim() || !prProjectId)}
          {err && <p className="mt-1 text-xs text-red-600">{err}</p>}
        </td>
      </tr>
    );
  }

  if (tab === "procurementLines") {
    return (
      <tr className="border-t bg-slate-50/90">
        <td className="p-2 align-top">
          <select
            className={newRowInputClass}
            value={lnProcId}
            onChange={(e) => setLnProcId(e.target.value)}
          >
            {procurement.length === 0 ? (
              <option value="">No procurement records</option>
            ) : (
              procurement.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.title}
                </option>
              ))
            )}
          </select>
        </td>
        <td className="p-2 align-top">
          <input
            className={newRowInputClass}
            placeholder="Description"
            value={lnDesc}
            onChange={(e) => setLnDesc(e.target.value)}
          />
        </td>
        <td className="p-2 align-top">
          <input
            className={newRowInputClass}
            placeholder="Qty"
            value={lnQty}
            onChange={(e) => setLnQty(e.target.value)}
          />
        </td>
        <td colSpan={3} className="p-2 align-middle text-xs text-slate-500">
          Unit/price/order: edit inline after create.
        </td>
        <td className={stickyActionsTd}>
          {createBtn(async () => {
            const description = lnDesc.trim();
            if (!description) throw new Error("Description is required");
            const qty = lnQty.trim() || "1";
            if (!lnProcId) throw new Error("Select procurement");
            await api("/api/procurement-lines", {
              method: "POST",
              body: JSON.stringify({
                procurementId: lnProcId,
                description,
                quantity: qty,
                orderIndex: 0,
              }),
            });
            setLnDesc("");
            setLnQty("1");
            await refreshProcurement();
          }, !lnDesc.trim() || !lnProcId)}
          {err && <p className="mt-1 text-xs text-red-600">{err}</p>}
        </td>
      </tr>
    );
  }

  return null;
}

function FilterSortTable({
  dataHeaders,
  rows,
  appendRow,
}: {
  dataHeaders: string[];
  rows: TableRow[];
  appendRow?: ReactNode;
}) {
  const [q, setQ] = useState("");
  const [sortCol, setSortCol] = useState(0);
  const [desc, setDesc] = useState(false);
  const [pageSize, setPageSize] = useState<string>("100");
  const [page, setPage] = useState(1);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const hit = rows.filter((r) => !needle || r.search.toLowerCase().includes(needle));
    return [...hit].sort((a, b) => {
      const av = a.sort[sortCol];
      const bv = b.sort[sortCol];
      const cmp =
        typeof av === "number" && typeof bv === "number"
          ? av - bv
          : String(av ?? "").localeCompare(String(bv ?? ""));
      return desc ? -cmp : cmp;
    });
  }, [rows, q, sortCol, desc]);

  const total = filtered.length;
  const pageSizeNum = pageSize === "all" ? null : Number(pageSize);
  const totalPages =
    pageSizeNum == null || total === 0 ? 1 : Math.max(1, Math.ceil(total / pageSizeNum));
  const safePage = Math.min(Math.max(1, page), totalPages);

  useEffect(() => {
    setPage(1);
  }, [q, pageSize]);

  useEffect(() => {
    setPage((p) => Math.min(Math.max(1, p), totalPages));
  }, [total, totalPages]);

  const paginatedRows = useMemo(() => {
    if (pageSize === "all" || total === 0) return filtered;
    const ps = Number(pageSize);
    const start = (safePage - 1) * ps;
    return filtered.slice(start, start + ps);
  }, [filtered, pageSize, safePage, total]);

  const showingFrom = total === 0 ? 0 : pageSize === "all" ? 1 : (safePage - 1) * Number(pageSize) + 1;
  const showingTo =
    total === 0 ? 0 : pageSize === "all" ? total : Math.min(safePage * Number(pageSize), total);

  function onHeaderClick(colIdx: number) {
    if (colIdx === sortCol) {
      setDesc((d) => !d);
    } else {
      setSortCol(colIdx);
      setDesc(false);
    }
  }

  const stickyActionsTh =
    "sticky right-0 z-[2] border-l border-slate-200 bg-slate-100 shadow-[inset_1px_0_0_0_rgb(226_232_240)]";

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <input
          className="border rounded px-2 py-1 text-sm min-w-64"
          placeholder="Filter rows..."
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <span className="text-xs text-slate-500">{total} matching</span>
        <label className="flex items-center gap-1.5 text-sm text-slate-600">
          <span>Rows per page</span>
          <select
            className="rounded border px-2 py-1 text-sm"
            value={pageSize}
            onChange={(e) => setPageSize(e.target.value)}
          >
            {PAGE_SIZE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        <span className="text-xs text-slate-400">Click column headers to sort</span>
      </div>
      <div className="overflow-hidden rounded border border-slate-200 bg-white">
        <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-100 text-left">
            <tr>
              {dataHeaders.map((h, idx) => (
                <th
                  key={`${h}-${idx}`}
                  scope="col"
                  className="p-0 font-medium"
                  aria-sort={sortCol === idx ? (desc ? "descending" : "ascending") : "none"}
                >
                  <button
                    type="button"
                    className={
                      "flex w-full min-w-[4.5rem] items-center justify-between gap-1 px-2 py-2 text-left hover:bg-slate-200/90 " +
                      (sortCol === idx ? "text-slate-900" : "text-slate-700")
                    }
                    onClick={() => onHeaderClick(idx)}
                  >
                    <span className="truncate">{h}</span>
                    <span
                      className={
                        "inline-flex shrink-0 flex-col items-center justify-center leading-none " +
                        (sortCol === idx ? "text-slate-900" : "text-slate-400")
                      }
                      aria-hidden
                    >
                      <span
                        className={
                          sortCol === idx && !desc ? "font-semibold" : sortCol === idx ? "opacity-35" : "opacity-45"
                        }
                      >
                        ↑
                      </span>
                      <span
                        className={
                          "-mt-px " +
                          (sortCol === idx && desc ? "font-semibold" : sortCol === idx ? "opacity-35" : "opacity-45")
                        }
                      >
                        ↓
                      </span>
                    </span>
                  </button>
                </th>
              ))}
              <th scope="col" className={"p-2 " + stickyActionsTh}>
                Actions
              </th>
            </tr>
          </thead>
          <tbody>
            {paginatedRows.map((r) => (
              <tr key={r.key} className="border-t">
                {r.cells.map((c, ci) => (
                  <td key={ci} className="p-2 align-top">
                    {c}
                  </td>
                ))}
                <td className="sticky right-0 z-[1] border-l border-slate-100 bg-white p-2 align-top shadow-[inset_1px_0_0_0_rgb(241_245_249)]">
                  {r.action}
                </td>
              </tr>
            ))}
            {appendRow}
          </tbody>
        </table>
        </div>
      {pageSize !== "all" && total > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
          <span className="text-xs text-slate-600">
            Showing <span className="font-medium tabular-nums">{showingFrom}</span>
            {"–"}
            <span className="font-medium tabular-nums">{showingTo}</span> of{" "}
            <span className="font-medium tabular-nums">{total}</span>
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="rounded border bg-white px-2 py-1 text-xs disabled:opacity-40"
              disabled={safePage <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              Previous
            </button>
            <span className="text-xs tabular-nums text-slate-600">
              Page {safePage} of {totalPages}
            </span>
            <button
              type="button"
              className="rounded border bg-white px-2 py-1 text-xs disabled:opacity-40"
              disabled={safePage >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            >
              Next
            </button>
          </div>
        </div>
      )}
      {pageSize === "all" && total > 0 && (
        <div className="flex flex-wrap items-center border-t border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
          Showing all <span className="mx-1 font-medium tabular-nums">{total}</span> rows
        </div>
      )}
      </div>
    </div>
  );
}

function getModalPortalTarget(): HTMLElement {
  return document.getElementById("modal-root") ?? document.body;
}

function ModalShell({
  title,
  onClose,
  children,
  footer,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  const node = (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="crud-modal-title"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 2147483647,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "1rem",
        backgroundColor: "rgba(15, 23, 42, 0.55)",
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: "32rem",
          maxHeight: "90vh",
          overflow: "auto",
          borderRadius: "0.5rem",
          border: "1px solid rgb(226 232 240)",
          backgroundColor: "#ffffff",
          padding: "1rem",
          boxShadow: "0 25px 50px -12px rgb(0 0 0 / 0.25)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 id="crud-modal-title" className="text-lg font-semibold">
            {title}
          </h2>
          <button type="button" className="rounded border px-2 py-1 text-sm" onClick={onClose}>
            Close
          </button>
        </div>
        {children}
        {footer}
      </div>
    </div>
  );

  return createPortal(node, getModalPortalTarget());
}

function EditDetailModal({
  target,
  onClose,
  clients,
  projects,
  milestones,
  tasks,
  todos,
  timeEntries,
  procurement,
  lines,
  orgUsers,
  onSaved,
}: {
  target: NonNullable<EditTarget>;
  onClose: () => void;
  clients: Client[];
  projects: Project[];
  milestones: Milestone[];
  tasks: Task[];
  todos: Todo[];
  timeEntries: TimeEntry[];
  procurement: Procurement[];
  lines: ProcurementLine[];
  orgUsers: OrgUser[];
  onSaved: () => Promise<void>;
}) {
  const c = clients.find((x) => x.id === target.id);
  const p = projects.find((x) => x.id === target.id);
  const m = milestones.find((x) => x.id === target.id);
  const t = tasks.find((x) => x.id === target.id);
  const td = todos.find((x) => x.id === target.id);
  const te = timeEntries.find((x) => x.id === target.id);
  const pr = procurement.find((x) => x.id === target.id);
  const ln = lines.find((x) => x.id === target.id);

  if (target.tab === "customers" && c) {
    return <CustomerEditModal client={c} onClose={onClose} onSaved={onSaved} />;
  }
  if (target.tab === "projects" && p) {
    return <ProjectEditModal project={p} clients={clients} onClose={onClose} onSaved={onSaved} />;
  }
  if (target.tab === "milestones" && m) {
    const pn = projects.find((x) => x.id === m.projectId)?.name ?? m.projectId;
    return <MilestoneEditModal milestone={m} projectLabel={pn} onClose={onClose} onSaved={onSaved} />;
  }
  if (target.tab === "tasks" && t) {
    const pl = projects.find((x) => x.id === t.projectId)?.name ?? t.projectId;
    return (
      <TaskEditModal
        task={t}
        projectLabel={pl}
        milestones={milestones.filter((x) => x.projectId === t.projectId)}
        orgUsers={orgUsers}
        onClose={onClose}
        onSaved={onSaved}
      />
    );
  }
  if (target.tab === "todos" && td) {
    const tl = tasks.find((x) => x.id === td.taskId)?.title ?? td.taskId;
    return <TodoEditModal todo={td} taskLabel={tl} orgUsers={orgUsers} onClose={onClose} onSaved={onSaved} />;
  }
  if (target.tab === "timeEntries" && te) {
    const tk = tasks.find((x) => x.id === te.taskId)?.title ?? te.taskId;
    const todoLabel = te.todoId ? todos.find((x) => x.id === te.todoId)?.title ?? te.todoId : null;
    return (
      <TimeEntryEditModal entry={te} taskLabel={tk} todoLabel={todoLabel} onClose={onClose} onSaved={onSaved} />
    );
  }
  if (target.tab === "procurement" && pr) {
    const pl = projects.find((x) => x.id === pr.projectId)?.name ?? pr.projectId;
    return (
      <ProcurementEditModal
        row={pr}
        projectLabel={pl}
        tasks={tasks.filter((x) => x.projectId === pr.projectId)}
        onClose={onClose}
        onSaved={onSaved}
      />
    );
  }
  if (target.tab === "procurementLines" && ln) {
    const parent = procurement.find((x) => x.id === ln.procurementId);
    const pl = parent ? projects.find((x) => x.id === parent.projectId)?.name ?? parent.projectId : ln.procurementId;
    return (
      <ProcurementLineEditModal line={ln} procurementTitle={parent?.title ?? ln.procurementId} projectLabel={pl} onClose={onClose} onSaved={onSaved} />
    );
  }

  return (
    <ModalShell title="Edit" onClose={onClose}>
      <p className="text-slate-600">Record not found or tab mismatch.</p>
    </ModalShell>
  );
}

function CustomerEditModal({ client, onClose, onSaved }: { client: Client; onClose: () => void; onSaved: () => Promise<void> }) {
  const [name, setName] = useState(client.name);
  const [code, setCode] = useState(client.code ?? "");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    setName(client.name);
    setCode(client.code ?? "");
  }, [client]);
  return (
    <ModalShell
      title="Edit customer"
      onClose={onClose}
      footer={
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            className="rounded border bg-slate-900 px-3 py-1.5 text-sm text-white disabled:opacity-50"
            disabled={saving || !name.trim()}
            onClick={() => {
              setErr(null);
              setSaving(true);
              void api("/api/clients/" + client.id, {
                method: "PATCH",
                body: JSON.stringify({ name: name.trim(), code: code.trim() || null, version: client.version }),
              })
                .then(onSaved)
                .catch((e: Error) => setErr(e.message))
                .finally(() => setSaving(false));
            }}
          >
            Save
          </button>
        </div>
      }
    >
      {err && <p className="mb-2 text-sm text-red-600">{err}</p>}
      <label className="block text-sm font-medium">Name</label>
      <input className="mb-2 w-full rounded border px-2 py-1" value={name} onChange={(e) => setName(e.target.value)} />
      <label className="block text-sm font-medium">Code</label>
      <input className="w-full rounded border px-2 py-1" value={code} onChange={(e) => setCode(e.target.value)} />
    </ModalShell>
  );
}

function ProjectEditModal({
  project,
  clients,
  onClose,
  onSaved,
}: {
  project: Project;
  clients: Client[];
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [name, setName] = useState(project.name);
  const [code, setCode] = useState(project.code ?? "");
  const [clientId, setClientId] = useState(project.clientId);
  const [status, setStatus] = useState(project.status);
  const [startAt, setStartAt] = useState(isoToLocal(project.startAt));
  const [endAt, setEndAt] = useState(isoToLocal(project.endAt));
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    setName(project.name);
    setCode(project.code ?? "");
    setClientId(project.clientId);
    setStatus(project.status);
    setStartAt(isoToLocal(project.startAt));
    setEndAt(isoToLocal(project.endAt));
  }, [project]);
  return (
    <ModalShell
      title="Edit project"
      onClose={onClose}
      footer={
        <div className="mt-4 flex gap-2">
          <button
            type="button"
            className="rounded border bg-slate-900 px-3 py-1.5 text-sm text-white disabled:opacity-50"
            disabled={saving || !name.trim()}
            onClick={() => {
              setErr(null);
              setSaving(true);
              void api("/api/projects/" + project.id, {
                method: "PATCH",
                body: JSON.stringify({
                  name: name.trim(),
                  code: code.trim() || null,
                  clientId,
                  status,
                  startAt: localToIso(startAt),
                  endAt: localToIso(endAt),
                  version: project.version,
                }),
              })
                .then(onSaved)
                .catch((e: Error) => setErr(e.message))
                .finally(() => setSaving(false));
            }}
          >
            Save
          </button>
        </div>
      }
    >
      {err && <p className="mb-2 text-sm text-red-600">{err}</p>}
      <label className="block text-sm font-medium">Name</label>
      <input className="mb-2 w-full rounded border px-2 py-1" value={name} onChange={(e) => setName(e.target.value)} />
      <label className="block text-sm font-medium">Code</label>
      <input className="mb-2 w-full rounded border px-2 py-1" value={code} onChange={(e) => setCode(e.target.value)} />
      <label className="block text-sm font-medium">Customer</label>
      <select className="mb-2 w-full rounded border px-2 py-1" value={clientId} onChange={(e) => setClientId(e.target.value)}>
        {clients.map((cl) => (
          <option key={cl.id} value={cl.id}>
            {cl.name}
          </option>
        ))}
      </select>
      <label className="block text-sm font-medium">Status</label>
      <select className="mb-2 w-full rounded border px-2 py-1" value={status} onChange={(e) => setStatus(e.target.value as Project["status"])}>
        {STATUS_OPTS.map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
      </select>
      <label className="block text-sm font-medium">Start</label>
      <input type="datetime-local" className="mb-2 w-full rounded border px-2 py-1" value={startAt} onChange={(e) => setStartAt(e.target.value)} />
      <label className="block text-sm font-medium">End</label>
      <input type="datetime-local" className="w-full rounded border px-2 py-1" value={endAt} onChange={(e) => setEndAt(e.target.value)} />
    </ModalShell>
  );
}

function MilestoneEditModal({
  milestone,
  projectLabel,
  onClose,
  onSaved,
}: {
  milestone: Milestone;
  projectLabel: string;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [name, setName] = useState(milestone.name);
  const [startAt, setStartAt] = useState(isoToLocal(milestone.startAt));
  const [endAt, setEndAt] = useState(isoToLocal(milestone.endAt));
  const [orderIndex, setOrderIndex] = useState(String(milestone.orderIndex));
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    setName(milestone.name);
    setStartAt(isoToLocal(milestone.startAt));
    setEndAt(isoToLocal(milestone.endAt));
    setOrderIndex(String(milestone.orderIndex));
  }, [milestone]);
  return (
    <ModalShell
      title="Edit milestone"
      onClose={onClose}
      footer={
        <div className="mt-4">
          <button
            type="button"
            className="rounded border bg-slate-900 px-3 py-1.5 text-sm text-white disabled:opacity-50"
            disabled={saving || !name.trim()}
            onClick={() => {
              setErr(null);
              setSaving(true);
              void api("/api/milestones/" + milestone.id, {
                method: "PATCH",
                body: JSON.stringify({
                  name: name.trim(),
                  startAt: localToIso(startAt),
                  endAt: localToIso(endAt),
                  orderIndex: Number(orderIndex) || 0,
                  version: milestone.version,
                }),
              })
                .then(onSaved)
                .catch((e: Error) => setErr(e.message))
                .finally(() => setSaving(false));
            }}
          >
            Save
          </button>
        </div>
      }
    >
      {err && <p className="mb-2 text-sm text-red-600">{err}</p>}
      <p className="mb-2 text-sm text-slate-600">Project: {projectLabel}</p>
      <label className="block text-sm font-medium">Name</label>
      <input className="mb-2 w-full rounded border px-2 py-1" value={name} onChange={(e) => setName(e.target.value)} />
      <label className="block text-sm font-medium">Start</label>
      <input type="datetime-local" className="mb-2 w-full rounded border px-2 py-1" value={startAt} onChange={(e) => setStartAt(e.target.value)} />
      <label className="block text-sm font-medium">End</label>
      <input type="datetime-local" className="mb-2 w-full rounded border px-2 py-1" value={endAt} onChange={(e) => setEndAt(e.target.value)} />
      <label className="block text-sm font-medium">Order</label>
      <input type="number" className="w-full rounded border px-2 py-1" value={orderIndex} onChange={(e) => setOrderIndex(e.target.value)} />
    </ModalShell>
  );
}

function TaskEditModal({
  task,
  projectLabel,
  milestones,
  orgUsers,
  onClose,
  onSaved,
}: {
  task: Task;
  projectLabel: string;
  milestones: Milestone[];
  orgUsers: OrgUser[];
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [title, setTitle] = useState(task.title);
  const [description, setDescription] = useState(task.description ?? "");
  const [milestoneId, setMilestoneId] = useState(task.milestoneId);
  const [startAt, setStartAt] = useState(isoToLocal(task.startAt));
  const [endAt, setEndAt] = useState(isoToLocal(task.endAt));
  const [estHours, setEstHours] = useState(task.estHours == null ? "" : String(task.estHours));
  const [actualHours, setActualHours] = useState(task.actualHours == null ? "" : String(task.actualHours));
  const [percentComplete, setPercentComplete] = useState(String(task.percentComplete));
  const [useDerived, setUseDerived] = useState(task.useDerivedPercent);
  const [orderIndex, setOrderIndex] = useState(String(task.orderIndex));
  const [assigneeId, setAssigneeId] = useState(task.assigneeId ?? "");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    setTitle(task.title);
    setDescription(task.description ?? "");
    setMilestoneId(task.milestoneId);
    setStartAt(isoToLocal(task.startAt));
    setEndAt(isoToLocal(task.endAt));
    setEstHours(task.estHours == null ? "" : String(task.estHours));
    setActualHours(task.actualHours == null ? "" : String(task.actualHours));
    setPercentComplete(String(task.percentComplete));
    setUseDerived(task.useDerivedPercent);
    setOrderIndex(String(task.orderIndex));
    setAssigneeId(task.assigneeId ?? "");
  }, [task]);
  return (
    <ModalShell
      title="Edit task"
      onClose={onClose}
      footer={
        <div className="mt-4">
          <button
            type="button"
            className="rounded border bg-slate-900 px-3 py-1.5 text-sm text-white disabled:opacity-50"
            disabled={saving || !title.trim() || !milestoneId}
            onClick={() => {
              setErr(null);
              setSaving(true);
              void api("/api/tasks/" + task.id, {
                method: "PATCH",
                body: JSON.stringify({
                  title: title.trim(),
                  description: description.trim() || null,
                  milestoneId,
                  startAt: localToIso(startAt),
                  endAt: localToIso(endAt),
                  estHours: estHours.trim() ? Number(estHours) : null,
                  actualHours: actualHours.trim() ? Number(actualHours) : null,
                  percentComplete: Number(percentComplete) || 0,
                  useDerivedPercent: useDerived,
                  orderIndex: Number(orderIndex) || 0,
                  assigneeId: assigneeId || null,
                  version: task.version,
                }),
              })
                .then(onSaved)
                .catch((e: Error) => setErr(e.message))
                .finally(() => setSaving(false));
            }}
          >
            Save
          </button>
        </div>
      }
    >
      {err && <p className="mb-2 text-sm text-red-600">{err}</p>}
      <p className="mb-2 text-sm text-slate-600">Project: {projectLabel}</p>
      <label className="block text-sm font-medium">Title</label>
      <input className="mb-2 w-full rounded border px-2 py-1" value={title} onChange={(e) => setTitle(e.target.value)} />
      <label className="block text-sm font-medium">Milestone</label>
      <select className="mb-2 w-full rounded border px-2 py-1" value={milestoneId} onChange={(e) => setMilestoneId(e.target.value)}>
        {milestones.map((m) => (
          <option key={m.id} value={m.id}>
            {m.name}
          </option>
        ))}
      </select>
      <label className="block text-sm font-medium">Description</label>
      <textarea className="mb-2 w-full rounded border px-2 py-1" rows={3} value={description} onChange={(e) => setDescription(e.target.value)} />
      <label className="block text-sm font-medium">Start</label>
      <input type="datetime-local" className="mb-2 w-full rounded border px-2 py-1" value={startAt} onChange={(e) => setStartAt(e.target.value)} />
      <label className="block text-sm font-medium">End</label>
      <input type="datetime-local" className="mb-2 w-full rounded border px-2 py-1" value={endAt} onChange={(e) => setEndAt(e.target.value)} />
      <label className="block text-sm font-medium">Est hours</label>
      <input type="number" className="mb-2 w-full rounded border px-2 py-1" value={estHours} onChange={(e) => setEstHours(e.target.value)} />
      <label className="block text-sm font-medium">Actual hours</label>
      <input type="number" className="mb-2 w-full rounded border px-2 py-1" value={actualHours} onChange={(e) => setActualHours(e.target.value)} />
      <label className="block text-sm font-medium">% complete</label>
      <input type="number" className="mb-2 w-full rounded border px-2 py-1" value={percentComplete} onChange={(e) => setPercentComplete(e.target.value)} />
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={useDerived} onChange={(e) => setUseDerived(e.target.checked)} />
        Use derived %
      </label>
      <label className="mt-2 block text-sm font-medium">Order</label>
      <input type="number" className="mb-2 w-full rounded border px-2 py-1" value={orderIndex} onChange={(e) => setOrderIndex(e.target.value)} />
      <label className="block text-sm font-medium">Assignee</label>
      <select className="w-full rounded border px-2 py-1" value={assigneeId} onChange={(e) => setAssigneeId(e.target.value)}>
        <option value="">(unassigned)</option>
        {orgUsers.map((u) => (
          <option key={u.id} value={u.id}>
            {u.name}
          </option>
        ))}
      </select>
    </ModalShell>
  );
}

function TodoEditModal({
  todo,
  taskLabel,
  orgUsers,
  onClose,
  onSaved,
}: {
  todo: Todo;
  taskLabel: string;
  orgUsers: OrgUser[];
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [title, setTitle] = useState(todo.title);
  const [status, setStatus] = useState(todo.status);
  const [dueAt, setDueAt] = useState(isoToLocal(todo.dueAt));
  const [priority, setPriority] = useState(todo.priority);
  const [orderIndex, setOrderIndex] = useState(String(todo.orderIndex));
  const [assigneeId, setAssigneeId] = useState(todo.assigneeId ?? "");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    setTitle(todo.title);
    setStatus(todo.status);
    setDueAt(isoToLocal(todo.dueAt));
    setPriority(todo.priority);
    setOrderIndex(String(todo.orderIndex));
    setAssigneeId(todo.assigneeId ?? "");
  }, [todo]);
  return (
    <ModalShell
      title="Edit todo"
      onClose={onClose}
      footer={
        <div className="mt-4">
          <button
            type="button"
            className="rounded border bg-slate-900 px-3 py-1.5 text-sm text-white disabled:opacity-50"
            disabled={saving || !title.trim()}
            onClick={() => {
              setErr(null);
              setSaving(true);
              void api("/api/todos/" + todo.id, {
                method: "PATCH",
                body: JSON.stringify({
                  title: title.trim(),
                  status,
                  dueAt: localToIso(dueAt),
                  priority,
                  orderIndex: Number(orderIndex) || 0,
                  assigneeId: assigneeId || null,
                  version: todo.version,
                }),
              })
                .then(onSaved)
                .catch((e: Error) => setErr(e.message))
                .finally(() => setSaving(false));
            }}
          >
            Save
          </button>
        </div>
      }
    >
      {err && <p className="mb-2 text-sm text-red-600">{err}</p>}
      <p className="mb-2 text-sm text-slate-600">Task: {taskLabel}</p>
      <label className="block text-sm font-medium">Title</label>
      <input className="mb-2 w-full rounded border px-2 py-1" value={title} onChange={(e) => setTitle(e.target.value)} />
      <label className="block text-sm font-medium">Status</label>
      <select className="mb-2 w-full rounded border px-2 py-1" value={status} onChange={(e) => setStatus(e.target.value as Todo["status"])}>
        {TODO_STATUS.map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
      </select>
      <label className="block text-sm font-medium">Due</label>
      <input type="datetime-local" className="mb-2 w-full rounded border px-2 py-1" value={dueAt} onChange={(e) => setDueAt(e.target.value)} />
      <label className="block text-sm font-medium">Priority</label>
      <select className="mb-2 w-full rounded border px-2 py-1" value={priority} onChange={(e) => setPriority(e.target.value as Todo["priority"])}>
        {TODO_PRIORITY.map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
      </select>
      <label className="block text-sm font-medium">Order</label>
      <input type="number" className="mb-2 w-full rounded border px-2 py-1" value={orderIndex} onChange={(e) => setOrderIndex(e.target.value)} />
      <label className="block text-sm font-medium">Assignee</label>
      <select className="w-full rounded border px-2 py-1" value={assigneeId} onChange={(e) => setAssigneeId(e.target.value)}>
        <option value="">(unassigned)</option>
        {orgUsers.map((u) => (
          <option key={u.id} value={u.id}>
            {u.name}
          </option>
        ))}
      </select>
    </ModalShell>
  );
}

function TimeEntryEditModal({
  entry,
  taskLabel,
  todoLabel,
  onClose,
  onSaved,
}: {
  entry: TimeEntry;
  taskLabel: string;
  todoLabel: string | null;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [startedAt, setStartedAt] = useState(isoToLocal(entry.startedAt));
  const [endedAt, setEndedAt] = useState(isoToLocal(entry.endedAt));
  const [durationMinutes, setDurationMinutes] = useState(entry.durationMinutes == null ? "" : String(entry.durationMinutes));
  const [note, setNote] = useState(entry.note ?? "");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    setStartedAt(isoToLocal(entry.startedAt));
    setEndedAt(isoToLocal(entry.endedAt));
    setDurationMinutes(entry.durationMinutes == null ? "" : String(entry.durationMinutes));
    setNote(entry.note ?? "");
  }, [entry]);
  return (
    <ModalShell
      title="Edit time entry"
      onClose={onClose}
      footer={
        <div className="mt-4">
          <button
            type="button"
            className="rounded border bg-slate-900 px-3 py-1.5 text-sm text-white disabled:opacity-50"
            disabled={saving}
            onClick={() => {
              setErr(null);
              setSaving(true);
              const dm = durationMinutes.trim() ? Number(durationMinutes) : null;
              void api("/api/time-entries/" + entry.id, {
                method: "PATCH",
                body: JSON.stringify({
                  startedAt: localToIso(startedAt),
                  endedAt: localToIso(endedAt),
                  durationMinutes: dm,
                  note: note.trim() || null,
                  version: entry.version,
                }),
              })
                .then(onSaved)
                .catch((e: Error) => setErr(e.message))
                .finally(() => setSaving(false));
            }}
          >
            Save
          </button>
        </div>
      }
    >
      {err && <p className="mb-2 text-sm text-red-600">{err}</p>}
      <p className="mb-2 text-sm text-slate-600">Task: {taskLabel}</p>
      {todoLabel && <p className="mb-2 text-sm text-slate-600">Todo: {todoLabel}</p>}
      <label className="block text-sm font-medium">Started</label>
      <input type="datetime-local" className="mb-2 w-full rounded border px-2 py-1" value={startedAt} onChange={(e) => setStartedAt(e.target.value)} />
      <label className="block text-sm font-medium">Ended</label>
      <input type="datetime-local" className="mb-2 w-full rounded border px-2 py-1" value={endedAt} onChange={(e) => setEndedAt(e.target.value)} />
      <label className="block text-sm font-medium">Duration (minutes)</label>
      <input type="number" className="mb-2 w-full rounded border px-2 py-1" value={durationMinutes} onChange={(e) => setDurationMinutes(e.target.value)} />
      <label className="block text-sm font-medium">Note</label>
      <textarea className="w-full rounded border px-2 py-1" rows={3} value={note} onChange={(e) => setNote(e.target.value)} />
    </ModalShell>
  );
}

function ProcurementEditModal({
  row,
  projectLabel,
  tasks,
  onClose,
  onSaved,
}: {
  row: Procurement;
  projectLabel: string;
  tasks: Task[];
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [title, setTitle] = useState(row.title);
  const [status, setStatus] = useState(row.status);
  const [taskId, setTaskId] = useState(row.taskId ?? "");
  const [needBy, setNeedBy] = useState(isoToLocal(row.needBy));
  const [sapPo, setSapPo] = useState(row.sapPoNumber ?? "");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    setTitle(row.title);
    setStatus(row.status);
    setTaskId(row.taskId ?? "");
    setNeedBy(isoToLocal(row.needBy));
    setSapPo(row.sapPoNumber ?? "");
  }, [row]);
  return (
    <ModalShell
      title="Edit procurement"
      onClose={onClose}
      footer={
        <div className="mt-4">
          <button
            type="button"
            className="rounded border bg-slate-900 px-3 py-1.5 text-sm text-white disabled:opacity-50"
            disabled={saving || !title.trim()}
            onClick={() => {
              setErr(null);
              setSaving(true);
              void api("/api/procurement/" + row.id, {
                method: "PATCH",
                body: JSON.stringify({
                  title: title.trim(),
                  status,
                  taskId: taskId || null,
                  needBy: localToIso(needBy),
                  sapPoNumber: sapPo.trim() || null,
                  version: row.version,
                }),
              })
                .then(onSaved)
                .catch((e: Error) => setErr(e.message))
                .finally(() => setSaving(false));
            }}
          >
            Save
          </button>
        </div>
      }
    >
      {err && <p className="mb-2 text-sm text-red-600">{err}</p>}
      <p className="mb-2 text-sm text-slate-600">Project: {projectLabel}</p>
      <label className="block text-sm font-medium">Title</label>
      <input className="mb-2 w-full rounded border px-2 py-1" value={title} onChange={(e) => setTitle(e.target.value)} />
      <label className="block text-sm font-medium">Task</label>
      <select className="mb-2 w-full rounded border px-2 py-1" value={taskId} onChange={(e) => setTaskId(e.target.value)}>
        <option value="">(none)</option>
        {tasks.map((t) => (
          <option key={t.id} value={t.id}>
            {t.title}
          </option>
        ))}
      </select>
      <label className="block text-sm font-medium">Status</label>
      <select className="mb-2 w-full rounded border px-2 py-1" value={status} onChange={(e) => setStatus(e.target.value as Procurement["status"])}>
        {PROC_STATUS.map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
      </select>
      <label className="block text-sm font-medium">Need by</label>
      <input type="datetime-local" className="mb-2 w-full rounded border px-2 py-1" value={needBy} onChange={(e) => setNeedBy(e.target.value)} />
      <label className="block text-sm font-medium">SAP PO</label>
      <input className="w-full rounded border px-2 py-1" value={sapPo} onChange={(e) => setSapPo(e.target.value)} />
    </ModalShell>
  );
}

function ProcurementLineEditModal({
  line,
  procurementTitle,
  projectLabel,
  onClose,
  onSaved,
}: {
  line: ProcurementLine;
  procurementTitle: string;
  projectLabel: string;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [description, setDescription] = useState(line.description);
  const [quantity, setQuantity] = useState(line.quantity);
  const [unit, setUnit] = useState(line.unit ?? "");
  const [estUnitPrice, setEstUnitPrice] = useState(line.estUnitPrice == null ? "" : String(line.estUnitPrice));
  const [orderIndex, setOrderIndex] = useState(String(line.orderIndex));
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    setDescription(line.description);
    setQuantity(line.quantity);
    setUnit(line.unit ?? "");
    setEstUnitPrice(line.estUnitPrice == null ? "" : String(line.estUnitPrice));
    setOrderIndex(String(line.orderIndex));
  }, [line]);
  return (
    <ModalShell
      title="Edit procurement line"
      onClose={onClose}
      footer={
        <div className="mt-4">
          <button
            type="button"
            className="rounded border bg-slate-900 px-3 py-1.5 text-sm text-white disabled:opacity-50"
            disabled={saving || !description.trim()}
            onClick={() => {
              setErr(null);
              setSaving(true);
              void api("/api/procurement-lines/" + line.id, {
                method: "PATCH",
                body: JSON.stringify({
                  description: description.trim(),
                  quantity: quantity || "1",
                  unit: unit.trim() || null,
                  estUnitPrice: estUnitPrice.trim() ? Number(estUnitPrice) : null,
                  orderIndex: Number(orderIndex) || 0,
                  version: line.version,
                }),
              })
                .then(onSaved)
                .catch((e: Error) => setErr(e.message))
                .finally(() => setSaving(false));
            }}
          >
            Save
          </button>
        </div>
      }
    >
      {err && <p className="mb-2 text-sm text-red-600">{err}</p>}
      <p className="mb-2 text-sm text-slate-600">Procurement: {procurementTitle}</p>
      <p className="mb-2 text-sm text-slate-600">Project: {projectLabel}</p>
      <label className="block text-sm font-medium">Description</label>
      <textarea className="mb-2 w-full rounded border px-2 py-1" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
      <label className="block text-sm font-medium">Quantity</label>
      <input className="mb-2 w-full rounded border px-2 py-1" value={quantity} onChange={(e) => setQuantity(e.target.value)} />
      <label className="block text-sm font-medium">Unit</label>
      <input className="mb-2 w-full rounded border px-2 py-1" value={unit} onChange={(e) => setUnit(e.target.value)} />
      <label className="block text-sm font-medium">Est unit price</label>
      <input type="number" className="mb-2 w-full rounded border px-2 py-1" value={estUnitPrice} onChange={(e) => setEstUnitPrice(e.target.value)} />
      <label className="block text-sm font-medium">Order</label>
      <input type="number" className="w-full rounded border px-2 py-1" value={orderIndex} onChange={(e) => setOrderIndex(e.target.value)} />
    </ModalShell>
  );
}

function InlineText({ value, onSave }: { value: string; onSave: (v: string) => Promise<unknown> }) {
  const [v, setV] = useState(value);
  const [edit, setEdit] = useState(false);
  useEffect(() => setV(value), [value]);
  if (!edit) {
    return (
      <button type="button" className="w-full text-left hover:bg-slate-50 rounded px-0.5" onClick={() => { setV(value); setEdit(true); }}>
        {value || "—"}
      </button>
    );
  }
  return (
    <input
      className="w-full rounded border px-2 py-1"
      value={v}
      onChange={(e) => setV(e.target.value)}
      onBlur={() => {
        setEdit(false);
        if (v !== value) void onSave(v);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
      }}
      autoFocus
    />
  );
}

function InlineSelect({
  value,
  options,
  onSave,
}: {
  value: string;
  options: { value: string; label: string }[];
  onSave: (v: string) => Promise<unknown>;
}) {
  return (
    <select className="w-full rounded border px-2 py-1" value={value} onChange={(e) => void onSave(e.target.value)}>
      {options.map((o) => (
        <option key={`${o.value}-${o.label}`} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

function InlineCheckbox({ value, onSave }: { value: boolean; onSave: (v: boolean) => Promise<unknown> }) {
  return <input type="checkbox" checked={value} onChange={(e) => void onSave(e.target.checked)} />;
}

function InlineDateTime({ value, onSave }: { value: string | null; onSave: (v: string | null) => Promise<unknown> }) {
  const [v, setV] = useState(isoToLocal(value));
  useEffect(() => setV(isoToLocal(value)), [value]);
  return (
    <input
      type="datetime-local"
      className="w-full rounded border px-2 py-1"
      value={v}
      onChange={(e) => setV(e.target.value)}
      onBlur={() => {
        const next = localToIso(v);
        const cur = value ? new Date(value).toISOString() : null;
        if (next !== cur) void onSave(next);
      }}
    />
  );
}

function InlineNumber({
  value,
  onSave,
  min,
  max,
}: {
  value: number;
  onSave: (v: number) => Promise<unknown>;
  min?: number;
  max?: number;
}) {
  const [v, setV] = useState(String(value));
  useEffect(() => setV(String(value)), [value]);
  return (
    <input
      type="number"
      className="w-24 rounded border px-2 py-1"
      value={v}
      min={min}
      max={max}
      onChange={(e) => setV(e.target.value)}
      onBlur={() => {
        const n = Number(v);
        if (Number.isFinite(n) && n !== value) void onSave(n);
        else setV(String(value));
      }}
    />
  );
}

function InlineNumberNullable({
  value,
  onSave,
  int,
}: {
  value: number | null;
  onSave: (v: number | null) => Promise<unknown>;
  int?: boolean;
}) {
  const [v, setV] = useState(value == null ? "" : String(value));
  useEffect(() => setV(value == null ? "" : String(value)), [value]);
  return (
    <input
      type="number"
      step={int ? 1 : undefined}
      className="w-24 rounded border px-2 py-1"
      value={v}
      onChange={(e) => setV(e.target.value)}
      onBlur={() => {
        const n = v.trim() ? Number(v) : null;
        if (n === null && value !== null) void onSave(null);
        else if (n !== null && Number.isFinite(n) && n !== value) void onSave(n);
        else setV(value == null ? "" : String(value));
      }}
    />
  );
}
