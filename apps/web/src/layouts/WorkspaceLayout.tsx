import { useState } from "react";
import { NavLink, Outlet, useLocation, useSearchParams } from "react-router-dom";
import { WORKSPACE_NAV_ITEMS } from "../lib/workspaceNav";

export function WorkspaceLayout() {
  const [collapsed, setCollapsed] = useState(false);
  const { pathname } = useLocation();
  const [searchParams] = useSearchParams();
  const queryString = searchParams.toString();

  return (
    <div className="flex flex-1 min-h-0 w-full">
      <aside
        className={
          "flex shrink-0 flex-col border-r border-tesla-border bg-tesla-muted transition-[width] duration-200 ease-out " +
          (collapsed ? "w-[3.25rem]" : "w-56")
        }
      >
        <div
          className={
            "flex items-center border-b border-tesla-border bg-white/80 " +
            (collapsed ? "justify-center px-1 py-2" : "justify-between gap-1 px-2 py-2")
          }
        >
          {!collapsed && (
            <span className="truncate pl-1 text-xs font-semibold uppercase tracking-wide text-tesla-text-secondary">
              Tables
            </span>
          )}
          <button
            type="button"
            aria-expanded={!collapsed}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            className="shrink-0 rounded-sm border border-tesla-border bg-white px-2 py-1 text-xs font-medium text-tesla-text shadow-sm hover:bg-tesla-muted"
            onClick={() => setCollapsed((c) => !c)}
          >
            {collapsed ? "»" : "«"}
          </button>
        </div>
        <nav
          aria-label="Workspace navigation"
          className="flex flex-1 flex-col gap-0.5 overflow-y-auto p-2"
        >
          {WORKSPACE_NAV_ITEMS.map(({ slug, label }) => {
            const prefix = `/workspace/${slug}`;
            const sectionActive =
              pathname === prefix || pathname.startsWith(prefix + "/");
            return (
            <NavLink
              key={slug}
              to={queryString ? `/workspace/${slug}?${queryString}` : `/workspace/${slug}`}
              end
              title={collapsed ? label : undefined}
              className={() =>
                "rounded-sm px-2 py-2 text-sm transition-colors " +
                (collapsed ? "text-center " : "") +
                (sectionActive
                  ? "bg-tesla-text font-medium text-white"
                  : "text-tesla-text-secondary hover:bg-white/90 hover:text-tesla-text")
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
            );
          })}
        </nav>
      </aside>
      <div className="min-h-0 min-w-0 flex-1 overflow-auto p-4">
        <Outlet />
      </div>
    </div>
  );
}
