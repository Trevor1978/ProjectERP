import { Routes, Route, Navigate, Link, useNavigate, useLocation } from "react-router-dom";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { api } from "./lib/api";
import { useMe } from "./hooks/useMe";
import { GlobalSearch } from "./components/GlobalSearch";
import { NotificationBell } from "./components/NotificationBell";
import { LoginPage } from "./pages/LoginPage";
import { RegisterPage } from "./pages/RegisterPage";
import { HomePage } from "./pages/HomePage";
import { ProjectPage } from "./pages/ProjectPage";
import { WorkspaceLayout } from "./layouts/WorkspaceLayout";
import { LauncherPage } from "./pages/LauncherPage";
import { WorkspaceClientDetailPage } from "./pages/workspace/WorkspaceClientDetailPage";
import { WorkspaceSupplierDetailPage } from "./pages/workspace/WorkspaceSupplierDetailPage";
import { WorkspaceProjectDetailPage } from "./pages/workspace/WorkspaceProjectDetailPage";
import { WorkspaceMilestoneDetailPage } from "./pages/workspace/WorkspaceMilestoneDetailPage";
import { WorkspaceTaskDetailPage } from "./pages/workspace/WorkspaceTaskDetailPage";
import { WorkspaceTodoDetailPage } from "./pages/workspace/WorkspaceTodoDetailPage";
import { WorkspaceTimeEntryDetailPage } from "./pages/workspace/WorkspaceTimeEntryDetailPage";
import { WorkspacePurchasingDetailPage } from "./pages/workspace/WorkspacePurchasingDetailPage";
import { WorkspacePurchasingLineDetailPage } from "./pages/workspace/WorkspacePurchasingLineDetailPage";
import { WorkspacePurchasingAiImportPage } from "./pages/workspace/WorkspacePurchasingAiImportPage";
import { WorkspaceMachinesPage } from "./pages/workspace/WorkspaceMachinesPage";
import { WorkspaceMachineDetailPage } from "./pages/workspace/WorkspaceMachineDetailPage";
import { WorkspaceServiceHistoryPage } from "./pages/workspace/WorkspaceServiceHistoryPage";
import { WorkspaceServiceHistoryDetailPage } from "./pages/workspace/WorkspaceServiceHistoryDetailPage";
import { WorkspaceWorkCompletePage } from "./pages/workspace/WorkspaceWorkCompletePage";
import { WorkspaceOrganizationPage } from "./pages/workspace/WorkspaceOrganizationPage";
import { ProjectNotePage } from "./pages/ProjectNotePage";
import { NotesHomePage } from "./pages/NotesHomePage";
import { ProfilePage } from "./pages/ProfilePage";
import { QuickCreateProvider } from "./components/QuickCreateProvider";
import { House, Menu, X } from "lucide-react";

function Layout({ children }: { children: React.ReactNode }) {
  const qc = useQueryClient();
  const nav = useNavigate();
  const location = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { data } = useMe();
  const user = data?.user;
  const isWorkspace = user ? location.pathname.startsWith("/workspace") : false;
  const isProjectNote = user
    ? /^\/p\/[^/]+\/notes\/[^/]+/.test(location.pathname)
    : false;

  const logout = async () => {
    await api("/api/auth/logout", { method: "POST", body: "{}" });
    await qc.invalidateQueries({ queryKey: ["me"] });
    nav("/login");
  };

  if (!user) {
    return <>{children}</>;
  }

  const navLinkClass =
    "block rounded-sm px-3 py-2.5 text-sm text-white/80 hover:bg-white/10 hover:text-white md:inline-block md:px-0 md:py-0 md:hover:bg-transparent";

  return (
    <QuickCreateProvider>
      <div className="flex min-h-screen flex-col">
      <header
        className={
          "no-print border-b border-tesla-border bg-tesla-header text-white " +
          (isProjectNote ? "hidden" : "block")
        }
      >
        <div className="flex items-center justify-between gap-2 px-3 py-2 sm:px-4 sm:py-3">
          <div className="flex min-w-0 items-center gap-2">
            <button
              type="button"
              aria-expanded={mobileMenuOpen}
              aria-label={mobileMenuOpen ? "Close menu" : "Open menu"}
              className="inline-flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-sm border border-white/20 text-white hover:bg-white/10 md:hidden"
              onClick={() => setMobileMenuOpen((open) => !open)}
            >
              {mobileMenuOpen ? (
                <X className="h-5 w-5" aria-hidden />
              ) : (
                <Menu className="h-5 w-5" aria-hidden />
              )}
            </button>
            <Link
              to="/"
              className="truncate text-sm font-medium uppercase tracking-[0.15em] sm:tracking-[0.2em]"
              onClick={() => setMobileMenuOpen(false)}
            >
              Project ERP
            </Link>
            <nav className="ml-2 hidden items-center gap-4 md:flex lg:gap-6">
              <Link
                to="/"
                className="flex items-center gap-1.5 text-sm text-white/70 hover:text-white"
              >
                <House className="h-4 w-4 opacity-90" aria-hidden />
                Home
              </Link>
              <Link to="/workspace/projects" className="text-sm text-white/70 hover:text-white">
                Projects
              </Link>
              <Link to="/workspace/machines" className="text-sm text-white/70 hover:text-white">
                Machines
              </Link>
              <Link to="/workspace/work-complete" className="text-sm text-white/70 hover:text-white">
                Log work
              </Link>
              {user.globalRole === "org_admin" && (
                <Link
                  to="/workspace/organization"
                  className="text-sm text-white/70 hover:text-white"
                >
                  Organization
                </Link>
              )}
            </nav>
          </div>
          <div className="flex shrink-0 items-center gap-1 sm:gap-3">
            <div className="hidden sm:block">
              <GlobalSearch />
            </div>
            <NotificationBell />
            <Link
              to="/profile"
              className="inline-flex min-h-[44px] max-w-[5.5rem] items-center truncate px-1 text-sm text-white/60 hover:text-white sm:max-w-[200px] sm:px-0"
              title="Edit profile & notifications"
              onClick={() => setMobileMenuOpen(false)}
            >
              <span className="sm:hidden">Profile</span>
              <span className="hidden sm:inline">
                {user.name}{" "}
                <span className="text-white/40">({user.org.name})</span>
              </span>
            </Link>
            <button
              type="button"
              onClick={() => void logout()}
              className="inline-flex min-h-[44px] items-center rounded-sm border border-white/20 px-2 py-1 text-sm hover:bg-white/10"
            >
              <span className="sm:hidden">Out</span>
              <span className="hidden sm:inline">Log out</span>
            </button>
          </div>
        </div>
        {mobileMenuOpen && (
          <nav className="border-t border-white/10 px-3 py-2 md:hidden">
            <div className="mb-2 sm:hidden">
              <GlobalSearch />
            </div>
            <Link to="/" className={navLinkClass} onClick={() => setMobileMenuOpen(false)}>
              Home
            </Link>
            <Link
              to="/workspace/projects"
              className={navLinkClass}
              onClick={() => setMobileMenuOpen(false)}
            >
              Projects
            </Link>
            <Link
              to="/workspace/machines"
              className={navLinkClass}
              onClick={() => setMobileMenuOpen(false)}
            >
              Machines
            </Link>
            <Link
              to="/workspace/work-complete"
              className={navLinkClass}
              onClick={() => setMobileMenuOpen(false)}
            >
              Log work
            </Link>
            {user.globalRole === "org_admin" && (
              <Link
                to="/workspace/organization"
                className={navLinkClass}
                onClick={() => setMobileMenuOpen(false)}
              >
                Organization
              </Link>
            )}
            <Link
              to="/profile#phone-notifications"
              className={navLinkClass + " font-medium text-emerald-200"}
              onClick={() => setMobileMenuOpen(false)}
            >
              Phone notifications setup
            </Link>
          </nav>
        )}
      </header>
      {isWorkspace || isProjectNote ? (
        <div className="flex min-h-0 flex-1">{children}</div>
      ) : (
        <main className="mx-auto w-full max-w-[1600px] flex-1 p-3 sm:p-4">{children}</main>
      )}
    </div>
    </QuickCreateProvider>
  );
}

function AuthGate({ children }: { children: React.ReactNode }) {
  const { data, isLoading } = useMe();
  if (isLoading) {
    return (
      <div className="p-8 text-center text-slate-500">Loading…</div>
    );
  }
  if (!data?.user) {
    return <Navigate to="/login" replace />;
  }
  return <>{children}</>;
}

export default function App() {
  return (
    <Routes>
      <Route
        path="/login"
        element={
          <Layout>
            <LoginPage />
          </Layout>
        }
      />
      <Route
        path="/register"
        element={
          <Layout>
            <RegisterPage />
          </Layout>
        }
      />
      <Route
        path="/"
        element={
          <Layout>
            <AuthGate>
              <LauncherPage />
            </AuthGate>
          </Layout>
        }
      />
      <Route
        path="/workspace"
        element={
          <Layout>
            <AuthGate>
              <WorkspaceLayout />
            </AuthGate>
          </Layout>
        }
      >
        <Route index element={<Navigate to="projects" replace />} />
        <Route path="customers/:clientId" element={<WorkspaceClientDetailPage />} />
        <Route path="suppliers/:supplierId" element={<WorkspaceSupplierDetailPage />} />
        <Route path="projects/:projectId" element={<WorkspaceProjectDetailPage />} />
        <Route path="milestones/:milestoneId" element={<WorkspaceMilestoneDetailPage />} />
        <Route path="tasks/:taskId" element={<WorkspaceTaskDetailPage />} />
        <Route path="todos/:todoId" element={<WorkspaceTodoDetailPage />} />
        <Route path="time-entries/:timeEntryId" element={<WorkspaceTimeEntryDetailPage />} />
        <Route path="purchasing/ai-import" element={<WorkspacePurchasingAiImportPage />} />
        <Route path="purchasing/:procurementId" element={<WorkspacePurchasingDetailPage />} />
        <Route path="purchasing-lines/:lineId" element={<WorkspacePurchasingLineDetailPage />} />
        <Route path="machines" element={<WorkspaceMachinesPage />} />
        <Route path="machines/:assetId" element={<WorkspaceMachineDetailPage />} />
        <Route path="service-history" element={<WorkspaceServiceHistoryPage />} />
        <Route path="service-history/:logId" element={<WorkspaceServiceHistoryDetailPage />} />
        <Route path="work-complete" element={<WorkspaceWorkCompletePage />} />
        <Route path="organization" element={<WorkspaceOrganizationPage />} />
        <Route path=":table" element={<HomePage />} />
      </Route>
      <Route
        path="/notes"
        element={
          <Layout>
            <AuthGate>
              <NotesHomePage />
            </AuthGate>
          </Layout>
        }
      />
      <Route
        path="/p/:projectId/notes/:noteId"
        element={
          <Layout>
            <AuthGate>
              <ProjectNotePage />
            </AuthGate>
          </Layout>
        }
      />
      <Route
        path="/p/:id"
        element={
          <Layout>
            <AuthGate>
              <ProjectPage />
            </AuthGate>
          </Layout>
        }
      />
      <Route
        path="/profile"
        element={
          <Layout>
            <AuthGate>
              <ProfilePage />
            </AuthGate>
          </Layout>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
