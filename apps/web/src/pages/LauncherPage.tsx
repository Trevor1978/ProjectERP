import { Link } from "react-router-dom";
import type { LucideIcon } from "lucide-react";
import {
  ClipboardList,
  Clock,
  Flag,
  FolderKanban,
  History,
  ListChecks,
  ListTree,
  ShoppingCart,
  Truck,
  Users,
  Cog,
  Wrench,
} from "lucide-react";
import { WORKSPACE_NAV_ITEMS, type WorkspaceTableSlug } from "../lib/workspaceNav";

const ICON_BY_SLUG: Record<WorkspaceTableSlug, LucideIcon> = {
  "work-complete": Wrench,
  customers: Users,
  suppliers: Truck,
  projects: FolderKanban,
  milestones: Flag,
  tasks: ClipboardList,
  todos: ListChecks,
  "time-entries": Clock,
  purchasing: ShoppingCart,
  "purchasing-lines": ListTree,
  machines: Cog,
  "service-history": History,
};

/** Tile backgrounds — icon uses white foreground */
const TILE_STYLE: Record<WorkspaceTableSlug, { className: string }> = {
  "work-complete": { className: "bg-gradient-to-br from-orange-500 to-red-600 shadow-orange-500/25" },
  customers: { className: "bg-gradient-to-br from-sky-500 to-blue-600 shadow-sky-500/25" },
  suppliers: { className: "bg-gradient-to-br from-amber-500 to-orange-600 shadow-orange-500/25" },
  projects: { className: "bg-gradient-to-br from-indigo-500 to-violet-600 shadow-indigo-500/25" },
  milestones: { className: "bg-gradient-to-br from-rose-500 to-pink-600 shadow-rose-500/25" },
  tasks: { className: "bg-gradient-to-br from-emerald-500 to-teal-600 shadow-emerald-500/25" },
  todos: { className: "bg-gradient-to-br from-cyan-500 to-blue-600 shadow-cyan-500/25" },
  "time-entries": { className: "bg-gradient-to-br from-violet-500 to-purple-600 shadow-violet-500/25" },
  purchasing: { className: "bg-gradient-to-br from-lime-600 to-green-700 shadow-lime-600/25" },
  "purchasing-lines": { className: "bg-gradient-to-br from-slate-600 to-slate-800 shadow-slate-600/25" },
  machines: { className: "bg-gradient-to-br from-zinc-600 to-zinc-800 shadow-zinc-600/25" },
  "service-history": { className: "bg-gradient-to-br from-teal-600 to-emerald-800 shadow-teal-600/25" },
};

export function LauncherPage() {
  return (
    <div className="mx-auto flex max-w-4xl flex-col px-4 pb-12 pt-8">
      <h1 className="mb-2 text-center text-2xl font-semibold tracking-tight text-slate-900">
        Home
      </h1>
      <p className="mb-10 text-center text-sm text-slate-600">
        Open a module — same screens as the sidebar under{" "}
        <Link
          to="/workspace/projects"
          className="font-medium text-slate-900 underline decoration-slate-300 underline-offset-2 hover:decoration-slate-600"
        >
          Tables
        </Link>
        .
      </p>

      <ul className="mx-auto grid w-full max-w-lg grid-cols-3 gap-x-4 gap-y-8 sm:max-w-2xl sm:grid-cols-4 md:grid-cols-5 md:gap-x-6 md:gap-y-10">
        {WORKSPACE_NAV_ITEMS.map(({ slug, label }) => {
          const Icon = ICON_BY_SLUG[slug];
          const tile = TILE_STYLE[slug];
          return (
            <li key={slug} className="flex justify-center">
              <Link
                to={`/workspace/${slug}`}
                className="flex w-[5.5rem] flex-col items-center gap-2 rounded-xl p-1 outline-none ring-slate-900/10 transition-transform hover:scale-[1.03] focus-visible:ring-2 sm:w-24"
              >
                <span
                  className={
                    "flex h-16 w-16 items-center justify-center rounded-[1.35rem] shadow-lg sm:h-[4.5rem] sm:w-[4.5rem] " +
                    tile.className
                  }
                >
                  <Icon className="h-8 w-8 text-white drop-shadow-sm sm:h-9 sm:w-9" strokeWidth={1.75} aria-hidden />
                </span>
                <span className="max-w-[5.5rem] text-center text-[11px] font-medium leading-tight text-slate-800 sm:text-xs">
                  {label}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
