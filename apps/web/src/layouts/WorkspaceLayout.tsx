import { useState } from "react";
import { NavLink, Outlet, useLocation, useSearchParams } from "react-router-dom";
import { Menu, X } from "lucide-react";
import { WORKSPACE_NAV_ITEMS } from "../lib/workspaceNav";

export function WorkspaceLayout() {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const { pathname } = useLocation();
  const [searchParams] = useSearchParams();
  const queryString = searchParams.toString();

  return (
    <div className="flex flex-1 min-h-0 w-full">
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 md:hidden"
          onClick={() => setMobileOpen(false)}
          aria-hidden="true"
        />
      )}
      <aside
        className={
          "flex shrink-0 flex-col border-r border-tesla-border bg-tesla-muted transition-all duration-200 ease-out " +
          "md:relative md:translate-x-0 " +
          (mobileOpen ? "fixed inset-y-0 left-0 z-50 w-56 translate-x-0" : "fixed -translate-x-full md:translate-x-0 ") +
          (collapsed ? "md:w-[3.25rem]" : "md:w-56")
        }
      >
        <div
          className={
            "flex items-center border-b border-tesla-border bg-white/80 " +
            (collapsed ? "md:justify-center md:px-1 py-2 px-2 justify-between" : "justify-between gap-1 px-2 py-2")
          }
        >
          {(!collapsed || mobileOpen) && (
            <span className="truncate pl-1 text-xs font-semibold uppercase tracking-wide text-tesla-text-secondary">
              Tables
            </span>
          )}
          <button
            type="button"
            aria-expanded={mobileOpen}
            aria-label="Close sidebar"
            className="shrink-0 rounded-sm border border-tesla-border bg-white px-2 py-1 text-xs font-medium text-tesla-text shadow-sm hover:bg-tesla-muted md:hidden"
            onClick={() => setMobileOpen(false)}
          >
            <X className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            aria-expanded={!collapsed}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            className="hidden shrink-0 rounded-sm border border-tesla-border bg-white px-2 py-1 text-xs font-medium text-tesla-text shadow-sm hover:bg-tesla-muted md:block"
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
              onClick={() => setMobileOpen(false)}
              className={() =>
                "rounded-sm px-2 py-2 text-sm transition-colors " +
                (collapsed ? "md:text-center " : "") +
                (sectionActive
                  ? "bg-tesla-text font-medium text-white"
                  : "text-tesla-text-secondary hover:bg-white/90 hover:text-tesla-text")
              }
            >
              {collapsed ? (
                <>
                  <span className="hidden truncate text-xs font-semibold md:block" aria-hidden>
                    {label.slice(0, 2).toUpperCase()}
                  </span>
                  <span className="md:hidden">{label}</span>
                </>
              ) : (
                label
              )}
            </NavLink>
            );
          })}
        </nav>
      </aside>
      <div className="min-h-0 min-w-0 flex-1 overflow-auto">
        <div className="sticky top-0 z-30 flex items-center gap-2 border-b border-tesla-border bg-white px-4 py-2 md:hidden">
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            className="flex h-9 w-9 items-center justify-center rounded-sm text-tesla-text hover:bg-tesla-muted"
            aria-label="Open sidebar"
          >
            <Menu className="h-5 w-5" />
          </button>
          <span className="text-sm font-medium text-tesla-text">Tables</span>
        </div>
        <div className="p-4">
          <Outlet />
        </div>
      </div>
    </div>
  );
}
