import { useQuery } from "@tanstack/react-query";
import { useState, useRef, useEffect } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api";

type SearchRes = {
  results: {
    projects: { id: string; name: string }[];
    tasks: { id: string; projectId: string; title: string }[];
    todos: { id: string; title: string; _task: { projectId: string; title: string } }[];
  };
};

export function GlobalSearch() {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);

  const { data, isFetching } = useQuery({
    queryKey: ["global-search", q],
    queryFn: () => api<SearchRes>("/api/search?q=" + encodeURIComponent(q)),
    enabled: q.trim().length >= 2,
  });

  useEffect(() => {
    function close(e: MouseEvent) {
      if (wrap.current && !wrap.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, []);

  const r = data?.results;
  const hasResults =
    r &&
    (r.projects.length + r.tasks.length + r.todos.length > 0);

  return (
    <div className="relative" ref={wrap}>
      <input
        type="search"
        placeholder="Search…"
        className="bg-slate-800 border border-slate-700 text-sm text-slate-200 placeholder:text-slate-500 rounded px-2 py-1 w-40 md:w-56 focus:outline-none focus:ring-1 focus:ring-slate-500"
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        aria-label="Search projects and tasks"
      />
      {open && q.trim().length >= 2 && (
        <div className="absolute right-0 top-full mt-1 w-80 max-h-80 overflow-y-auto bg-white text-slate-900 border border-slate-200 rounded shadow-lg z-50 text-sm">
          {isFetching && (
            <div className="p-2 text-slate-500">Searching…</div>
          )}
          {!isFetching && !hasResults && (
            <div className="p-2 text-slate-500">No results</div>
          )}
          {r && r.projects.length > 0 && (
            <ul className="p-1 border-b border-slate-100">
              <li className="px-1 text-xs text-slate-400">Projects</li>
              {r.projects.map((p) => (
                <li key={p.id}>
                  <Link
                    to={"/p/" + p.id + "?tab=gantt"}
                    className="block px-2 py-1 rounded hover:bg-slate-100"
                    onClick={() => {
                      setOpen(false);
                      setQ("");
                    }}
                  >
                    {p.name}
                  </Link>
                </li>
              ))}
            </ul>
          )}
          {r && r.tasks.length > 0 && (
            <ul className="p-1 border-b border-slate-100">
              <li className="px-1 text-xs text-slate-400">Tasks</li>
              {r.tasks.map((t) => (
                <li key={t.id}>
                  <Link
                    to={"/p/" + t.projectId + "?tab=gantt"}
                    className="block px-2 py-1 rounded hover:bg-slate-100"
                    onClick={() => {
                      setOpen(false);
                      setQ("");
                    }}
                  >
                    {t.title}
                  </Link>
                </li>
              ))}
            </ul>
          )}
          {r && r.todos.length > 0 && (
            <ul className="p-1">
              <li className="px-1 text-xs text-slate-400">Todos</li>
              {r.todos.map((t) => (
                <li key={t.id}>
                  <Link
                    to={
                      "/p/" + t._task.projectId + "?tab=todos"
                    }
                    className="block px-2 py-1 rounded hover:bg-slate-100"
                    onClick={() => {
                      setOpen(false);
                      setQ("");
                    }}
                  >
                    {t.title}{" "}
                    <span className="text-slate-400">· {t._task.title}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
