import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { ArrowLeft, NotebookPen } from "lucide-react";
import { api } from "../lib/api";

type RecentNote = {
  id: string;
  projectId: string;
  projectName: string;
  title: string;
  background: string;
  updatedAt: string;
};

export function NotesHomePage() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["project-notes-recent"],
    queryFn: () => api<{ notes: RecentNote[] }>("/api/project-notes/recent?limit=30"),
  });

  const notes = data?.notes ?? [];

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-6">
      <div className="mb-6 flex items-center gap-3">
        <Link
          to="/"
          className="inline-flex h-11 w-11 items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100"
          title="Home"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div>
          <h1 className="text-xl font-semibold text-slate-900">A4 notes</h1>
          <p className="text-sm text-slate-500">Recent scratchpads across your projects</p>
        </div>
      </div>

      {isLoading ? (
        <p className="text-sm text-slate-500">Loading…</p>
      ) : error ? (
        <p className="text-sm text-red-600">Could not load notes</p>
      ) : notes.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 p-8 text-center">
          <NotebookPen className="mx-auto mb-3 h-10 w-10 text-slate-400" />
          <p className="text-sm text-slate-600">No notes yet.</p>
          <p className="mt-1 text-sm text-slate-500">
            Open a{" "}
            <Link to="/workspace/projects" className="underline">
              project
            </Link>
            , then create an A4 note under Budget, docs & notes.
          </p>
        </div>
      ) : (
        <ul className="divide-y divide-slate-200 overflow-hidden rounded-xl border border-slate-200 bg-white">
          {notes.map((n) => (
            <li key={n.id}>
              <Link
                to={`/p/${n.projectId}/notes/${n.id}`}
                className="flex min-h-[3.25rem] flex-col gap-0.5 px-4 py-3 hover:bg-slate-50"
              >
                <span className="font-medium text-slate-900">{n.title}</span>
                <span className="text-xs text-slate-500">
                  {n.projectName}
                  {" · "}
                  {new Date(n.updatedAt).toLocaleString()}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
