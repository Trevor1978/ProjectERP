import { Routes, Route, Navigate, Link, useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { api } from "./lib/api";
import { useMe } from "./hooks/useMe";
import { GlobalSearch } from "./components/GlobalSearch";
import { NotificationBell } from "./components/NotificationBell";
import { LoginPage } from "./pages/LoginPage";
import { RegisterPage } from "./pages/RegisterPage";
import { HomePage } from "./pages/HomePage";
import { ProjectPage } from "./pages/ProjectPage";

function Layout({ children }: { children: React.ReactNode }) {
  const qc = useQueryClient();
  const nav = useNavigate();
  const { data } = useMe();
  const user = data?.user;

  const logout = async () => {
    await api("/api/auth/logout", { method: "POST", body: "{}" });
    await qc.invalidateQueries({ queryKey: ["me"] });
    nav("/login");
  };

  if (!user) {
    return <>{children}</>;
  }
  return (
    <div className="min-h-screen flex flex-col">
      <header className="bg-slate-900 text-white px-4 py-3 flex items-center justify-between">
        <div className="flex gap-6 items-center">
          <Link to="/" className="font-semibold tracking-tight">
            Project ERP
          </Link>
          <Link
            to="/"
            className="text-sm text-slate-300 hover:text-white"
          >
            Projects
          </Link>
        </div>
        <div className="flex items-center gap-3 text-sm">
          <GlobalSearch />
          <NotificationBell />
          <span className="text-slate-400 hidden sm:inline max-w-[200px] truncate" title={user.name}>
            {user.name} <span className="text-slate-500">({user.org.name})</span>
          </span>
          <button
            type="button"
            onClick={() => void logout()}
            className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700"
          >
            Log out
          </button>
        </div>
      </header>
      <main className="flex-1 p-4 max-w-[1600px] w-full mx-auto">{children}</main>
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
              <HomePage />
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
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
