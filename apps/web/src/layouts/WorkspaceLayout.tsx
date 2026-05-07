import { useState } from "react";
import { NavLink, Outlet } from "react-router-dom";
import { WORKSPACE_NAV_ITEMS } from "../lib/workspaceNav";

export function WorkspaceLayout() {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div className="flex flex-1 min-h-0 w-full">
      <aside
        className={
          "flex shrink-0 flex-col border-r border-slate-200 bg-slate-50 transition-[width] duration-200 ease-out " +
          (collapsed ? "w-[3.25rem]" : "w-56")
        }
      >
        <div
          className={
            "flex items-center border-b border-slate-200 bg-slate-100/80 " +
            (collapsed ? "justify-center px-1 py-2" : "justify-between gap-1 px-2 py-2")
          }
        >
          {!collapsed && (
            <span className="truncate pl-1 text-xs font-semibold uppercase tracking-wide text-slate-600">
              Tables
            </span>
          )}
          <button
            type="button"
            aria-expanded={!collapsed}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            className="shrink-0 rounded border border-slate-300 bg-white px-2 py-1 text-xs font-medium text-slate-700 shadow-sm hover:bg-slate-50"
            onClick={() => setCollapsed((c) => !c)}
          >
            {collapsed ? "»" : "«"}
          </button>
        </div>
        <nav
          aria-label="Workspace navigation"
          className="flex flex-1 flex-col gap-0.5 overflow-y-auto p-2"
        >
          {WORKSPACE_NAV_ITEMS.map(({ slug, label }) => (
            <NavLink
              key={slug}
              to={`/workspace/${slug}`}
              end
              title={collapsed ? label : undefined}
              className={({ isActive }) =>
                "rounded-md px-2 py-2 text-sm transition-colors " +
                (collapsed ? "text-center " : "") +
                (isActive
                  ? "bg-slate-900 font-medium text-white"
                  : "text-slate-700 hover:bg-slate-200/90 hover:text-slate-900")
              }
            >
              {collapsed ? (
                <span className="block truncate text-xs font-semibold" aria-hidden>
                  {label.slice(0, 2).toUpperCase()}
                </span>
              ) : (
                label
              )}
            </NavLink>
          ))}
        </nav>
      </aside>
      <div className="min-h-0 min-w-0 flex-1 overflow-auto p-4">
        <Outlet />
      </div>
    </div>
  );
}
