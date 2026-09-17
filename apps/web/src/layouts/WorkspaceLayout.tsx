import { useEffect, useState } from "react";
import { NavLink, Outlet, useLocation, useSearchParams } from "react-router-dom";
import { Menu, X } from "lucide-react";
import { WORKSPACE_NAV_ITEMS } from "../lib/workspaceNav";

export function WorkspaceLayout() {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const { pathname } = useLocation();
  const [searchParams] = useSearchParams();
  const queryString = searchParams.toString();

  useEffect(() => {
    setMobileNavOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!mobileNavOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [mobileNavOpen]);

  return (
    <div className="relative flex min-h-0 w-full flex-1">
      {mobileNavOpen && (
        <button
          type="button"
          aria-label="Close tables menu"
          className="fixed inset-0 z-40 bg-black/40 md:hidden"
          onClick={() => setMobileNavOpen(false)}
        />
      )}

      <aside
        className={
          "fixed inset-y-0 left-0 z-50 flex w-[min(18rem,85vw)] shrink-0 flex-col border-r border-tesla-border bg-tesla-muted shadow-xl transition-transform duration-200 ease-out md:static md:z-auto md:translate-x-0 md:shadow-none " +
          (mobileNavOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0 ") +
          (collapsed ? "md:w-[3.25rem]" : "md:w-56")
        }
      >
        <div
          className={
            "flex items-center border-b border-tesla-border bg-white/80 " +
            (collapsed ? "justify-between gap-1 px-2 py-2 md:justify-center md:px-1" : "justify-between gap-1 px-2 py-2")
          }
        >
          {!collapsed && (
            <span className="truncate pl-1 text-xs font-semibold uppercase tracking-wide text-tesla-text-secondary">
              Tables
            </span>
          )}
          <div className="flex items-center gap-1">
            <button
              type="button"
              aria-label="Close tables menu"
              className="rounded-sm border border-tesla-border bg-white px-2 py-2 text-xs font-medium text-tesla-text shadow-sm hover:bg-tesla-muted md:hidden"
              onClick={() => setMobileNavOpen(false)}
            >
              <X className="h-4 w-4" aria-hidden />
            </button>
            <button
              type="button"
              aria-expanded={!collapsed}
              aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
              className="hidden shrink-0 rounded-sm border border-tesla-border bg-white px-2 py-1 text-xs font-medium text-tesla-text shadow-sm hover:bg-tesla-muted md:inline-flex"
              onClick={() => setCollapsed((c) => !c)}
            >
              {collapsed ? "»" : "«"}
            </button>
          </div>
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
                onClick={() => setMobileNavOpen(false)}
                className={() =>
                  "rounded-sm px-3 py-2.5 text-sm transition-colors md:px-2 md:py-2 " +
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

      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <div className="flex items-center gap-2 border-b border-tesla-border bg-white px-3 py-2 md:hidden">
          <button
            type="button"
            aria-expanded={mobileNavOpen}
            aria-label="Open tables menu"
            className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-sm border border-tesla-border bg-tesla-muted text-tesla-text"
            onClick={() => setMobileNavOpen(true)}
          >
            <Menu className="h-5 w-5" aria-hidden />
          </button>
          <span className="text-sm font-medium text-tesla-text">Tables</span>
        </div>
        <div className="min-h-0 flex-1 overflow-auto p-2 sm:p-4">
          <Outlet />
        </div>
      </div>
    </div>
  );
}
