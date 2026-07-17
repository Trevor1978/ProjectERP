import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import { useMe } from "../hooks/useMe";
import type { User } from "../types";

type TestEmailResult = {
  ok: true;
  itemCount: number;
  subject: string;
  id?: string;
};

export function ProfilePage() {
  const qc = useQueryClient();
  const { data } = useMe();
  const user = data?.user;
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    setName(user.name);
    setEmail(user.email);
  }, [user]);

  async function saveProfile(): Promise<User> {
    const result = await api<{ user: User }>("/api/auth/profile", {
      method: "PATCH",
      body: JSON.stringify({
        name: name.trim(),
        email: email.trim(),
      }),
    });
    await qc.invalidateQueries({ queryKey: ["me"] });
    return result.user;
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      await saveProfile();
      setMessage("Profile saved.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to save profile");
    } finally {
      setSaving(false);
    }
  }

  async function handleTestEmail() {
    setTesting(true);
    setError(null);
    setMessage(null);
    try {
      // Save first so the test uses the address and name currently shown.
      await saveProfile();
      const result = await api<TestEmailResult>(
        "/api/auth/profile/test-daily-email",
        {
          method: "POST",
          body: "{}",
        },
      );
      setMessage(
        `Test email sent with ${result.itemCount} due ${
          result.itemCount === 1 ? "item" : "items"
        }. Subject: ${result.subject}`,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to send test email");
    } finally {
      setTesting(false);
    }
  }

  if (!user) return null;

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Your profile</h1>
        <p className="mt-1 text-sm text-slate-600">
          Update your account details and verify daily digest delivery.
        </p>
      </div>

      {error && (
        <p className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}
      {message && (
        <p className="rounded border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-800">
          {message}
        </p>
      )}

      <section className="space-y-4 rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <div>
          <label className="block text-sm font-medium text-slate-700">
            Name
          </label>
          <input
            className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoComplete="name"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700">
            Email
          </label>
          <input
            type="email"
            className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
          />
        </div>
        <div className="text-sm text-slate-500">
          Organization: <span className="font-medium">{user.org.name}</span>
          <span className="mx-2">·</span>
          Role: <span className="font-medium">{user.globalRole}</span>
        </div>
        <button
          type="button"
          disabled={saving || testing || !name.trim() || !email.trim()}
          className="rounded bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          onClick={() => void handleSave()}
        >
          {saving ? "Saving…" : "Save profile"}
        </button>
      </section>

      <section className="space-y-3 rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">
          Daily digest test
        </h2>
        <p className="text-sm text-slate-600">
          Sends the same daily digest template used by the 7am scheduler,
          including your overdue items and items due today or tomorrow. A test
          is still sent when no items are due.
        </p>
        <button
          type="button"
          disabled={saving || testing || !name.trim() || !email.trim()}
          className="rounded border border-slate-800 bg-white px-4 py-2 text-sm font-medium text-slate-900 hover:bg-slate-50 disabled:opacity-50"
          onClick={() => void handleTestEmail()}
        >
          {testing ? "Sending…" : `Send test email to ${email || user.email}`}
        </button>
      </section>
    </div>
  );
}
