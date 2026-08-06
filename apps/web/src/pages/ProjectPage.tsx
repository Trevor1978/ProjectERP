import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams, Link, useSearchParams } from "react-router-dom";
import { useState, useEffect, useCallback } from "react";
import { api } from "../lib/api";
import type { Schedule } from "../types";
import { GanttView } from "../components/GanttView";
import { ProjectTeamPanel } from "../components/ProjectTeamPanel";
import { ProjectWorkspacePanel } from "../components/ProjectWorkspacePanel";
import { ProjectMetaPanel } from "../components/ProjectMetaPanel";

const IN_PROJECT_TABS = ["gantt", "team", "workspace"] as const;
type InProjectTab = (typeof IN_PROJECT_TABS)[number];

function isInProjectTab(s: string | null): s is InProjectTab {
  return s !== null && (IN_PROJECT_TABS as readonly string[]).includes(s);
}

const TAB_LABEL: Record<InProjectTab, string> = {
  gantt: "Gantt (tasks)",
  team: "Team",
  workspace: "Budget, docs & notes",
};

function workspaceLinks(projectId: string) {
  const q = (params: Record<string, string>) =>
    "?" + new URLSearchParams(params).toString();
  return [
    {
      label: "Milestones",
      to: `/workspace/milestones${q({ projectId })}`,
      hint: "Filtered to this project",
    },
    {
      label: "Tasks",
      to: `/workspace/tasks${q({ projectId })}`,
      hint: "Filtered to this project",
    },
    {
      label: "Todos (table)",
      to: `/workspace/todos${q({ projectId, view: "table" })}`,
      hint: "Todos on tasks in this project",
    },
    {
      label: "Todos (Kanban)",
      to: `/workspace/todos${q({ projectId, view: "kanban" })}`,
      hint: "Kanban for this project",
    },
    {
      label: "Time entries",
      to: `/workspace/time-entries${q({ projectId })}`,
      hint: "Time on tasks in this project",
    },
    {
      label: "Purchasing",
      to: `/workspace/purchasing${q({ projectId })}`,
      hint: "Requests with lines on this project",
    },
    {
      label: "Purchasing lines",
      to: `/workspace/purchasing-lines${q({ projectId })}`,
      hint: "Line items for this project",
    },
  ] as const;
}

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
  const [tab, setTab] = useState<InProjectTab>("gantt");

  useEffect(() => {
    const t = searchParams.get("tab");
    if (isInProjectTab(t)) {
      setTab(t);
    }
  }, [searchParams]);

  const setTabNav = useCallback(
    (t: InProjectTab) => {
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
  const links = workspaceLinks(id);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-2xl font-semibold">
          {p.name}{" "}
          <span className="text-slate-500 text-base font-normal">({p.status})</span>
        </h1>
        <Link to="/" className="text-sm text-slate-600">
          &larr; Home
        </Link>
      </div>
      <ProjectMetaPanel
        project={p}
        canEdit={canEditProject}
        onUpdated={invalidateSchedule}
      />

      <section className="rounded-lg border border-slate-200 bg-slate-50/80 p-4">
        <h2 className="text-sm font-semibold text-slate-800">Workspace</h2>
        <p className="mt-1 text-xs text-slate-600">
          Milestones, tasks, todos, time, and purchasing are managed in the org workspace. Links
          below open the right table with filters for this project (or tasks in this project).
        </p>
        <ul className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {links.map((item) => (
            <li key={item.label}>
              <Link
                to={item.to}
                className="block rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-800 shadow-sm hover:border-slate-300 hover:bg-slate-50"
              >
                {item.label}
              </Link>
              <p className="mt-0.5 text-xs text-slate-500">{item.hint}</p>
            </li>
          ))}
        </ul>
      </section>

      <nav className="flex flex-wrap gap-1 border-b border-slate-200">
        {IN_PROJECT_TABS.map((k) => (
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
      {tab === "gantt" && (
        <GanttView
          projectId={id}
          data={data}
          onAfterTaskChange={invalidateSchedule}
        />
      )}
      {tab === "team" && <ProjectTeamPanel projectId={id} />}
      {tab === "workspace" && <ProjectWorkspacePanel projectId={id} />}
    </div>
  );
}
