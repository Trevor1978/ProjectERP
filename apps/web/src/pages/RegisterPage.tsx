import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";

export function RegisterPage() {
  const nav = useNavigate();
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [org, setOrg] = useState("");
  const [err, setErr] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    try {
      await api("/api/auth/register", {
        method: "POST",
        body: JSON.stringify({
          name,
          email,
          password,
          organizationName: org,
        }),
      });
      await qc.invalidateQueries({ queryKey: ["me"] });
      nav("/workspace/projects");
    } catch (x) {
      setErr(String(x));
    }
  }

  return (
    <div className="max-w-sm mx-auto mt-16 p-6 bg-white rounded-lg shadow">
      <h1 className="text-xl font-semibold mb-4">Create organization</h1>
      <form onSubmit={(e) => void submit(e)} className="space-y-3">
        <div>
          <label htmlFor="register-org" className="block text-sm text-slate-600">
            Organization
          </label>
          <input
            id="register-org"
            className="w-full border rounded px-2 py-1"
            value={org}
            onChange={(e) => setOrg(e.target.value)}
            placeholder="e.g. Spantec"
            autoComplete="organization"
            required
          />
        </div>
        <div>
          <label htmlFor="register-name" className="block text-sm text-slate-600">
            Your name
          </label>
          <input
            id="register-name"
            className="w-full border rounded px-2 py-1"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoComplete="name"
            required
          />
        </div>
        <div>
          <label htmlFor="register-email" className="block text-sm text-slate-600">
            Email
          </label>
          <input
            id="register-email"
            className="w-full border rounded px-2 py-1"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            type="email"
            autoComplete="email"
            required
          />
        </div>
        <div>
          <label htmlFor="register-password" className="block text-sm text-slate-600">
            Password
          </label>
          <input
            id="register-password"
            type="password"
            className="w-full border rounded px-2 py-1"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            minLength={8}
            autoComplete="new-password"
            required
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
          Register
        </button>
      </form>
      <p className="mt-4 text-sm text-slate-500">
        <Link to="/login" className="text-slate-900 underline">Sign in</Link> instead
      </p>
    </div>
  );
}
