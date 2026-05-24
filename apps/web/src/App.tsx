import { Routes, Route, Navigate, Link, useNavigate, useLocation } from "react-router-dom";
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
import { WorkspaceMachinesPage } from "./pages/workspace/WorkspaceMachinesPage";
import { WorkspaceMachineDetailPage } from "./pages/workspace/WorkspaceMachineDetailPage";
import { WorkspaceOrganizationPage } from "./pages/workspace/WorkspaceOrganizationPage";
import { House } from "lucide-react";

function Layout({ children }: { children: React.ReactNode }) {
  const qc = useQueryClient();
  const nav = useNavigate();
  const location = useLocation();
  const { data } = useMe();
  const user = data?.user;
  const isWorkspace = user ? location.pathname.startsWith("/workspace") : false;

  const logout = async () => {
    await api("/api/auth/logout", { method: "POST", body: "{}" });
    await qc.invalidateQueries({ queryKey: ["me"] });
    nav("/login");
  };

  if (!user) {
    return <>{children}</>;
  }
  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex items-center justify-between border-b border-tesla-border bg-tesla-header px-4 py-3 text-white">
        <div className="flex items-center gap-6">
          <Link to="/" className="text-sm font-medium uppercase tracking-[0.2em]">
            Project ERP
          </Link>
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
          {user.globalRole === "org_admin" && (
            <Link
              to="/workspace/organization"
              className="text-sm text-white/70 hover:text-white"
            >
              Organization
            </Link>
          )}
        </div>
        <div className="flex items-center gap-3 text-sm">
          <GlobalSearch />
          <NotificationBell />
          <span className="hidden max-w-[200px] truncate text-white/60 sm:inline" title={user.name}>
            {user.name} <span className="text-white/40">({user.org.name})</span>
          </span>
          <button
            type="button"
            onClick={() => void logout()}
            className="rounded-sm border border-white/20 px-2 py-1 hover:bg-white/10"
          >
            Log out
          </button>
        </div>
      </header>
      {isWorkspace ? (
        <div className="flex min-h-0 flex-1">{children}</div>
      ) : (
        <main className="mx-auto w-full max-w-[1600px] flex-1 p-4">{children}</main>
      )}
    </div>
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
        <Route path="purchasing/:procurementId" element={<WorkspacePurchasingDetailPage />} />
        <Route path="purchasing-lines/:lineId" element={<WorkspacePurchasingLineDetailPage />} />
        <Route path="machines" element={<WorkspaceMachinesPage />} />
        <Route path="machines/:assetId" element={<WorkspaceMachineDetailPage />} />
        <Route path="organization" element={<WorkspaceOrganizationPage />} />
        <Route path=":table" element={<HomePage />} />
      </Route>
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
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
