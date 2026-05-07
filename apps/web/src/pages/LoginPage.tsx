import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";

export function LoginPage() {
  const nav = useNavigate();
  const qc = useQueryClient();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    try {
      await api("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });
      await qc.invalidateQueries({ queryKey: ["me"] });
      nav("/workspace/projects");
    } catch (x) {
      setErr(String(x));
    }
  }

  return (
    <div className="max-w-sm mx-auto mt-16 p-6 bg-white rounded-lg shadow">
      <h1 className="text-xl font-semibold mb-4">Sign in</h1>
      <form onSubmit={(e) => void submit(e)} className="space-y-3">
        <div>
          <label className="block text-sm text-slate-600">Email</label>
          <input
            className="w-full border rounded px-2 py-1"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
          />
        </div>
        <div>
          <label className="block text-sm text-slate-600">Password</label>
          <input
            type="password"
            className="w-full border rounded px-2 py-1"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        {err && (
          <p className="text-sm text-red-600" role="alert">
            {err}
          </p>
        )}
        <button
          type="submit"
          className="w-full py-2 rounded bg-slate-900 text-white"
        >
          Log in
        </button>
      </form>
      <p className="mt-4 text-sm text-slate-500">
        No account? <Link to="/register" className="text-slate-900 underline">Register</Link>
      </p>
    </div>
  );
}
