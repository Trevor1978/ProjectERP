import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams, Link, useSearchParams } from "react-router-dom";
import { useState, useEffect, useCallback } from "react";
import { api } from "../lib/api";
import type { Schedule } from "../types";
import { GanttView } from "../components/GanttView";
import { TodoKanban } from "../components/TodoKanban";
import { InlineMilestones } from "../components/InlineMilestones";
import { RfqPanel } from "../components/RfqPanel";
import { ProjectTodoTable } from "../components/ProjectTodoTable";
import { ProjectTimePanel } from "../components/ProjectTimePanel";
import { ProjectTeamPanel } from "../components/ProjectTeamPanel";
import { ProjectWorkspacePanel } from "../components/ProjectWorkspacePanel";
import { ProjectMetaPanel } from "../components/ProjectMetaPanel";
import { ProjectCrudTables } from "../components/ProjectCrudTables";

const TABS = [
  "milestones",
  "gantt",
  "todos",
  "todosTable",
  "time",
  "rfq",
  "team",
  "workspace",
  "crudTables",
] as const;
type Tab = (typeof TABS)[number];

function isTab(s: string | null): s is Tab {
  return s !== null && (TABS as readonly string[]).includes(s);
}

const TAB_LABEL: Record<Tab, string> = {
  milestones: "Milestones",
  gantt: "Gantt (tasks)",
  todos: "Todo Kanban",
  todosTable: "Todo table",
  time: "Time",
  rfq: "RFQ / PO",
  team: "Team",
  workspace: "Budget & docs",
  crudTables: "CRUD tables",
};

export function ProjectPage() {
  const { id } = useParams<{ id: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const qc = useQueryClient();
  const { data, isLoading, error } = useQuery({
    queryKey: ["schedule", id],
    queryFn: () =>
      api<Schedule & { error?: string }>("/api/projects/" + id + "/schedule"),
    enabled: !!id,
  });
  const [tab, setTab] = useState<Tab>("gantt");

  useEffect(() => {
    const t = searchParams.get("tab");
    if (isTab(t)) {
      setTab(t);
    }
  }, [searchParams]);

  const setTabNav = useCallback(
    (t: Tab) => {
      setTab(t);
      setSearchParams(
        (prev) => {
          const n = new URLSearchParams(prev);
          n.set("tab", t);
          return n;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  const invalidateSchedule = useCallback(() => {
    if (id) {
      void qc.invalidateQueries({ queryKey: ["schedule", id] });
    }
  }, [qc, id]);

  if (isLoading || !id) {
    return <p className="text-slate-500">Loading…</p>;
  }
  if (error || (data as { error?: string })?.error) {
    return <p className="text-red-600">Failed to load project</p>;
  }
  if (!data?.project) {
    return <p>Not found</p>;
  }

  const p = data.project;
  const canEditProject = data.canEditProject === true;
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-2xl font-semibold">
          {p.name}{" "}
          <span className="text-slate-500 text-base font-normal">({p.status})</span>
        </h1>
        <Link to="/workspace/projects" className="text-sm text-slate-600">
          &larr; All projects
        </Link>
      </div>
      <ProjectMetaPanel
        project={p}
        canEdit={canEditProject}
        onUpdated={invalidateSchedule}
      />
      <div>
        <button
          type="button"
          onClick={() => setTabNav("crudTables")}
          className="px-3 py-1.5 text-sm rounded border border-slate-300 bg-white hover:bg-slate-50"
        >
          Open CRUD tables
        </button>
      </div>
      <nav className="flex flex-wrap gap-1 border-b border-slate-200">
        {TABS.map((k) => (
          <button
            type="button"
            key={k}
            onClick={() => setTabNav(k)}
            className={
              "px-3 py-2 text-sm -mb-px " +
              (tab === k
                ? "border-b-2 border-slate-900 font-medium"
                : "text-slate-500 hover:text-slate-800")
            }
          >
            {TAB_LABEL[k]}
          </button>
        ))}
      </nav>
      {tab === "milestones" && (
        <InlineMilestones
          projectId={id}
          data={data}
          onChange={invalidateSchedule}
        />
      )}
      {tab === "gantt" && (
        <GanttView
          projectId={id}
          data={data}
          onAfterTaskChange={invalidateSchedule}
        />
      )}
      {tab === "todos" && (
        <TodoKanban
          projectId={id}
          tasks={data.tasks}
          todos={data.todos}
          onUpdate={invalidateSchedule}
        />
      )}
      {tab === "todosTable" && (
        <ProjectTodoTable
          tasks={data.tasks}
          todos={data.todos}
          onChange={invalidateSchedule}
        />
      )}
      {tab === "time" && (
        <ProjectTimePanel projectId={id} tasks={data.tasks} />
      )}
      {tab === "rfq" && <RfqPanel projectId={id} />}
      {tab === "team" && <ProjectTeamPanel projectId={id} />}
      {tab === "workspace" && <ProjectWorkspacePanel projectId={id} />}
      {tab === "crudTables" && (
        <ProjectCrudTables
          projectId={id}
          milestones={data.milestones}
          tasks={data.tasks}
          todos={data.todos}
          onRefresh={invalidateSchedule}
        />
      )}
    </div>
  );
}
