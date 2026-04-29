import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";

type Client = { id: string; name: string; code: string | null; version: number };
type Project = { id: string; name: string; code: string | null; clientId: string; status: string; startAt: string | null; endAt: string | null; version: number };
type Milestone = { id: string; projectId: string; name: string; orderIndex: number; version: number };
type Task = { id: string; projectId: string; milestoneId: string; title: string; assigneeId: string | null; percentComplete: number; orderIndex: number; useDerivedPercent: boolean; version: number };
type Todo = { id: string; taskId: string; title: string; status: string; dueAt: string | null; priority: string; assigneeId: string | null; orderIndex: number; version: number };
type TimeEntry = { id: string; userId: string; taskId: string; todoId: string | null; durationMinutes: number | null; startedAt: string | null; endedAt: string | null; note: string | null; version: number };
type Procurement = { id: string; projectId: string; taskId: string | null; title: string; status: string; needBy: string | null; sapPoNumber: string | null; version: number };
type ProcurementLine = { id: string; procurementId: string; description: string; quantity: string; unit: string | null; estUnitPrice: number | null; orderIndex: number; version: number };

type Tab = "customers" | "projects" | "milestones" | "tasks" | "todos" | "timeEntries" | "procurement" | "procurementLines";
const TABS: Tab[] = ["customers", "projects", "milestones", "tasks", "todos", "timeEntries", "procurement", "procurementLines"];
const LABEL: Record<Tab, string> = {
  customers: "Customers",
  projects: "Projects",
  milestones: "Milestones",
  tasks: "Tasks",
  todos: "Todos",
  timeEntries: "Time entries",
  procurement: "Procurement",
  procurementLines: "Procurement lines",
};

type SimpleRow = { cells: React.ReactNode[]; search: string; sort: (string | number | null)[] };

export function CrudWorkspace() {
  const [tab, setTab] = useState<Tab>("projects");
  const { data: clientsData } = useQuery({ queryKey: ["clients"], queryFn: () => api<{ clients: Client[] }>("/api/clients") });
  const { data: projectsData } = useQuery({ queryKey: ["projects"], queryFn: () => api<{ projects: Project[] }>("/api/projects") });
  const { data: milestonesData } = useQuery({ queryKey: ["milestones-all"], queryFn: () => api<{ milestones: Milestone[] }>("/api/milestones") });
  const { data: tasksData } = useQuery({ queryKey: ["tasks-all"], queryFn: () => api<{ tasks: Task[] }>("/api/tasks") });
  const { data: todosData } = useQuery({ queryKey: ["todos-all"], queryFn: () => api<{ todos: Todo[] }>("/api/todos") });
  const { data: timeData } = useQuery({ queryKey: ["time-all"], queryFn: () => api<{ timeEntries: TimeEntry[] }>("/api/time-entries") });
  const { data: procData } = useQuery({ queryKey: ["proc-all"], queryFn: () => api<{ procurement: Procurement[]; lines: ProcurementLine[] }>("/api/procurement") });

  const clients = clientsData?.clients ?? [];
  const projects = projectsData?.projects ?? [];
  const milestones = milestonesData?.milestones ?? [];
  const tasks = tasksData?.tasks ?? [];
  const todos = todosData?.todos ?? [];
  const timeEntries = timeData?.timeEntries ?? [];
  const procurement = procData?.procurement ?? [];
  const lines = procData?.lines ?? [];

  const projectName = useMemo(() => new Map(projects.map((p) => [p.id, p.name] as const)), [projects]);
  const clientName = useMemo(() => new Map(clients.map((c) => [c.id, c.name] as const)), [clients]);
  const milestoneName = useMemo(() => new Map(milestones.map((m) => [m.id, m.name] as const)), [milestones]);
  const taskName = useMemo(() => new Map(tasks.map((t) => [t.id, t.title] as const)), [tasks]);
  const procName = useMemo(() => new Map(procurement.map((p) => [p.id, p.title] as const)), [procurement]);

  const rowsByTab: Record<Tab, { headers: string[]; rows: SimpleRow[] }> = {
    customers: {
      headers: ["Name", "Code"],
      rows: clients.map((c) => ({ cells: [c.name, c.code ?? ""], search: `${c.name} ${c.code ?? ""}`, sort: [c.name, c.code ?? ""] })),
    },
    projects: {
      headers: ["Name", "Code", "Customer", "Status", "Start", "End", "Open"],
      rows: projects.map((p) => ({
        cells: [p.name, p.code ?? "", clientName.get(p.clientId) ?? p.clientId, p.status, p.startAt ?? "", p.endAt ?? "", <Link to={`/p/${p.id}`} className="text-blue-700 hover:underline">Open</Link>],
        search: `${p.name} ${p.code ?? ""} ${clientName.get(p.clientId) ?? ""} ${p.status}`,
        sort: [p.name, p.code ?? "", clientName.get(p.clientId) ?? "", p.status, p.startAt ?? "", p.endAt ?? ""],
      })),
    },
    milestones: {
      headers: ["Project", "Name", "Order"],
      rows: milestones.map((m) => ({ cells: [projectName.get(m.projectId) ?? m.projectId, m.name, m.orderIndex], search: `${projectName.get(m.projectId) ?? ""} ${m.name}`, sort: [projectName.get(m.projectId) ?? "", m.name, m.orderIndex] })),
    },
    tasks: {
      headers: ["Project", "Milestone", "Title", "%", "Order", "Derived"],
      rows: tasks.map((t) => ({ cells: [projectName.get(t.projectId) ?? t.projectId, milestoneName.get(t.milestoneId) ?? t.milestoneId, t.title, t.percentComplete, t.orderIndex, t.useDerivedPercent ? "yes" : "no"], search: `${projectName.get(t.projectId) ?? ""} ${milestoneName.get(t.milestoneId) ?? ""} ${t.title}`, sort: [projectName.get(t.projectId) ?? "", milestoneName.get(t.milestoneId) ?? "", t.title, t.percentComplete, t.orderIndex] })),
    },
    todos: {
      headers: ["Task", "Title", "Status", "Due", "Priority", "Order"],
      rows: todos.map((t) => ({ cells: [taskName.get(t.taskId) ?? t.taskId, t.title, t.status, t.dueAt ?? "", t.priority, t.orderIndex], search: `${taskName.get(t.taskId) ?? ""} ${t.title} ${t.status} ${t.priority}`, sort: [taskName.get(t.taskId) ?? "", t.title, t.status, t.dueAt ?? "", t.priority, t.orderIndex] })),
    },
    timeEntries: {
      headers: ["Task", "Todo", "Minutes", "Start", "End", "Note"],
      rows: timeEntries.map((t) => ({ cells: [taskName.get(t.taskId) ?? t.taskId, t.todoId ? (todos.find((x) => x.id === t.todoId)?.title ?? t.todoId) : "", t.durationMinutes ?? "", t.startedAt ?? "", t.endedAt ?? "", t.note ?? ""], search: `${taskName.get(t.taskId) ?? ""} ${t.note ?? ""}`, sort: [taskName.get(t.taskId) ?? "", t.durationMinutes ?? 0, t.startedAt ?? "", t.endedAt ?? "", t.note ?? ""] })),
    },
    procurement: {
      headers: ["Project", "Task", "Title", "Status", "Need by", "SAP PO"],
      rows: procurement.map((p) => ({ cells: [projectName.get(p.projectId) ?? p.projectId, p.taskId ? (taskName.get(p.taskId) ?? p.taskId) : "", p.title, p.status, p.needBy ?? "", p.sapPoNumber ?? ""], search: `${projectName.get(p.projectId) ?? ""} ${p.title} ${p.status}`, sort: [projectName.get(p.projectId) ?? "", taskName.get(p.taskId ?? "") ?? "", p.title, p.status, p.needBy ?? "", p.sapPoNumber ?? ""] })),
    },
    procurementLines: {
      headers: ["Procurement", "Description", "Qty", "Unit", "Est price", "Order"],
      rows: lines.map((l) => ({ cells: [procName.get(l.procurementId) ?? l.procurementId, l.description, l.quantity, l.unit ?? "", l.estUnitPrice ?? "", l.orderIndex], search: `${procName.get(l.procurementId) ?? ""} ${l.description} ${l.quantity}`, sort: [procName.get(l.procurementId) ?? "", l.description, l.quantity, l.unit ?? "", l.estUnitPrice ?? 0, l.orderIndex] })),
    },
  };

  const current = rowsByTab[tab];

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">CRUD workspace (org-wide)</h1>
      <nav className="flex flex-wrap gap-1 border-b border-slate-200">
        {TABS.map((k) => (
          <button key={k} type="button" onClick={() => setTab(k)} className={"px-3 py-2 text-sm -mb-px " + (tab === k ? "border-b-2 border-slate-900 font-medium" : "text-slate-500 hover:text-slate-800")}>{LABEL[k]}</button>
        ))}
      </nav>
      <FilterSortTable headers={current.headers} rows={current.rows} />
      <p className="text-xs text-slate-500">This view is org-wide (not project scoped) and supports per-tab filtering + sorting.</p>
    </div>
  );
}

function FilterSortTable({ headers, rows }: { headers: string[]; rows: SimpleRow[] }) {
  const [q, setQ] = useState("");
  const [sortCol, setSortCol] = useState(0);
  const [desc, setDesc] = useState(false);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const hit = rows.filter((r) => !needle || r.search.toLowerCase().includes(needle));
    return [...hit].sort((a, b) => {
      const av = a.sort[sortCol];
      const bv = b.sort[sortCol];
      const cmp = typeof av === "number" && typeof bv === "number"
        ? av - bv
        : String(av ?? "").localeCompare(String(bv ?? ""));
      return desc ? -cmp : cmp;
    });
  }, [rows, q, sortCol, desc]);

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <input className="border rounded px-2 py-1 text-sm min-w-64" placeholder="Filter rows..." value={q} onChange={(e) => setQ(e.target.value)} />
        <label className="text-sm text-slate-600">Sort by</label>
        <select className="border rounded px-2 py-1 text-sm" value={sortCol} onChange={(e) => setSortCol(Number(e.target.value))}>
          {headers.map((h, idx) => <option key={h} value={idx}>{h}</option>)}
        </select>
        <button type="button" className="border rounded px-2 py-1 text-sm" onClick={() => setDesc((d) => !d)}>{desc ? "Desc" : "Asc"}</button>
        <span className="text-xs text-slate-500">{filtered.length} rows</span>
      </div>
      <div className="overflow-x-auto border rounded bg-white">
        <table className="w-full text-sm">
          <thead className="bg-slate-100 text-left"><tr>{headers.map((h) => <th key={h} className="p-2">{h}</th>)}</tr></thead>
          <tbody>{filtered.map((r, i) => <tr key={i} className="border-t">{r.cells.map((c, ci) => <td key={ci} className="p-2">{c}</td>)}</tr>)}</tbody>
        </table>
      </div>
    </div>
  );
}
