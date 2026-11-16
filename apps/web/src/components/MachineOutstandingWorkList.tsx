import type { ReactNode } from "react";
import { Link } from "react-router-dom";

export type MachineOutstandingTask = {
  id: string;
  title: string;
  projectId: string;
  projectName: string;
  assigneeName: string | null;
  percentComplete: number;
  endAt: string | null;
};

export type MachineOutstandingTodo = {
  id: string;
  title: string;
  taskId: string;
  taskTitle: string;
  projectId: string;
  projectName: string;
  status: string;
  dueAt: string | null;
  assigneeName: string | null;
  linkSource: "todo" | "task";
};

function formatWhen(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function MetaItem({ label, children }: { label: string; children: ReactNode }) {
  return (
    <span className="inline-flex max-w-full flex-col gap-0.5 sm:inline-flex sm:flex-row sm:items-baseline sm:gap-1.5">
      <span className="shrink-0 text-[11px] font-medium uppercase tracking-wide text-tesla-text-secondary">
        {label}
      </span>
      <span className="min-w-0 break-words text-tesla-text">{children}</span>
    </span>
  );
}

export function MachineOutstandingWorkList({
  tasks,
  todos,
  loading,
}: {
  tasks: MachineOutstandingTask[];
  todos: MachineOutstandingTodo[];
  loading?: boolean;
}) {
  if (loading) {
    return <p className="px-3 py-4 text-sm text-tesla-text-secondary">Loading…</p>;
  }

  if (tasks.length === 0 && todos.length === 0) {
    return (
      <p className="px-3 py-4 text-sm text-tesla-text-secondary">
        No outstanding tasks or todos on this machine.
      </p>
    );
  }

  return (
    <ul className="divide-y divide-tesla-border">
      {tasks.map((t) => (
        <li key={`task-${t.id}`} className="px-3 py-3 hover:bg-tesla-muted/40">
          <div className="flex flex-wrap items-center gap-2">
            <span className="shrink-0 rounded-sm bg-slate-200 px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-slate-700">
              Task
            </span>
            <Link
              to={`/workspace/tasks/${t.id}`}
              className="min-w-0 flex-1 text-sm font-medium leading-snug underline-offset-2 hover:underline"
            >
              {t.title}
            </Link>
          </div>
          <dl className="mt-2 grid gap-2 text-sm sm:grid-cols-2 lg:grid-cols-3">
            <MetaItem label="Project">
              <Link
                to={`/workspace/projects/${t.projectId}`}
                className="text-blue-700 underline-offset-2 hover:underline"
              >
                {t.projectName}
              </Link>
            </MetaItem>
            <MetaItem label="Assignee">{t.assigneeName ?? "—"}</MetaItem>
            <MetaItem label="Progress">{Math.round(t.percentComplete)}% complete</MetaItem>
            <MetaItem label="End">{formatWhen(t.endAt)}</MetaItem>
            <MetaItem label="Machine link">On task</MetaItem>
          </dl>
        </li>
      ))}
      {todos.map((td) => (
        <li key={`todo-${td.id}`} className="px-3 py-3 hover:bg-tesla-muted/40">
          <div className="flex flex-wrap items-center gap-2">
            <span className="shrink-0 rounded-sm bg-amber-100 px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-amber-900">
              Todo
            </span>
            <Link
              to={`/workspace/todos/${td.id}`}
              className="min-w-0 flex-1 text-sm font-medium leading-snug underline-offset-2 hover:underline"
            >
              {td.title}
            </Link>
          </div>
          <dl className="mt-2 grid gap-2 text-sm sm:grid-cols-2 lg:grid-cols-3">
            <MetaItem label="Task">
              <Link
                to={`/workspace/tasks/${td.taskId}`}
                className="text-blue-700 underline-offset-2 hover:underline"
              >
                {td.taskTitle}
              </Link>
            </MetaItem>
            <MetaItem label="Project">
              <Link
                to={`/workspace/projects/${td.projectId}`}
                className="text-blue-700 underline-offset-2 hover:underline"
              >
                {td.projectName}
              </Link>
            </MetaItem>
            <MetaItem label="Assignee">{td.assigneeName ?? "—"}</MetaItem>
            <MetaItem label="Status">{td.status.replaceAll("_", " ")}</MetaItem>
            <MetaItem label="Due">{formatWhen(td.dueAt)}</MetaItem>
            <MetaItem label="Machine link">
              {td.linkSource === "task" ? "Inherited from task" : "Set on todo"}
            </MetaItem>
          </dl>
        </li>
      ))}
    </ul>
  );
}