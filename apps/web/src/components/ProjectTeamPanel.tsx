import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { api } from "../lib/api";
import { useMe } from "../hooks/useMe";

type Member = {
  id: string;
  userId: string;
  role: string;
};

type OrgUser = {
  id: string;
  email: string;
  name: string;
  globalRole: string;
};

export function ProjectTeamPanel({ projectId }: { projectId: string }) {
  const qc = useQueryClient();
  const { data: me } = useMe();
  const { data: mdata } = useQuery({
    queryKey: ["project-members", projectId],
    queryFn: () =>
      api<{ members: Member[] }>("/api/projects/" + projectId + "/members"),
  });
  const { data: orgData } = useQuery({
    queryKey: ["org-users"],
    queryFn: () => api<{ users: OrgUser[] }>("/api/org/users"),
    enabled: me?.user?.globalRole === "org_admin",
  });

  const [addUserId, setAddUserId] = useState("");
  const [addRole, setAddRole] = useState<"viewer" | "member" | "pm" | "admin">(
    "member",
  );
  const [err, setErr] = useState("");

  const members = mdata?.members ?? [];
  const onProject = new Set(members.map((m) => m.userId));
  const available = (orgData?.users ?? []).filter((u) => !onProject.has(u.id));

  async function addMember() {
    setErr("");
    if (!addUserId) {
      return;
    }
    try {
      await api("/api/projects/" + projectId + "/members", {
        method: "POST",
        body: JSON.stringify({ userId: addUserId, role: addRole }),
      });
      setAddUserId("");
      await qc.invalidateQueries({ queryKey: ["project-members", projectId] });
    } catch (e) {
      setErr(String(e));
    }
  }

  async function removeMember(memberId: string) {
    setErr("");
    try {
      await api(`/api/projects/${projectId}/members/${memberId}`, {
        method: "DELETE",
      });
      await qc.invalidateQueries({ queryKey: ["project-members", projectId] });
    } catch (e) {
      setErr(String(e));
    }
  }

  const canManage =
    me?.user?.globalRole === "org_admin" ||
    members.some(
      (m) =>
        m.userId === me?.user?.id && (m.role === "pm" || m.role === "admin"),
    );

  return (
    <div className="space-y-4 max-w-2xl">
      <p className="text-sm text-slate-600">
        People who can see this project. <strong>Org admins</strong> and project{" "}
        <strong>PMs</strong> can add members.
      </p>
      {me?.user?.globalRole === "org_admin" && orgData && (
        <div className="p-4 bg-slate-50 border rounded space-y-2">
          <h3 className="text-sm font-semibold">Add team member</h3>
          <div className="flex flex-wrap gap-2 items-end">
            <div className="flex-1 min-w-[200px]">
              <label className="text-xs text-slate-500">User</label>
              <select
                className="border rounded px-2 py-1.5 w-full"
                value={addUserId}
                onChange={(e) => setAddUserId(e.target.value)}
              >
                <option value="">— choose —</option>
                {available.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name} ({u.email})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs text-slate-500">Role</label>
              <select
                className="border rounded px-2 py-1.5"
                value={addRole}
                onChange={(e) =>
                  setAddRole(
                    e.target.value as "viewer" | "member" | "pm" | "admin",
                  )
                }
              >
                <option value="viewer">Viewer</option>
                <option value="member">Member</option>
                <option value="pm">PM</option>
                <option value="admin">Admin</option>
              </select>
            </div>
            <button
              type="button"
              onClick={() => void addMember()}
              className="px-3 py-1.5 bg-slate-800 text-white rounded text-sm"
            >
              Add
            </button>
          </div>
          {available.length === 0 && orgData.users.length > 0 && (
            <p className="text-xs text-amber-800">
              Everyone in the org is already on this project, or no users left.
            </p>
          )}
          {err && <p className="text-sm text-red-600">{err}</p>}
        </div>
      )}
      {me?.user?.globalRole !== "org_admin" && (
        <p className="text-xs text-slate-500">
          Invite new org users: <code className="text-xs">POST /api/org/users</code>{" "}
          (org admin) or an admin can add people here.
        </p>
      )}
      <ul className="border rounded bg-white divide-y text-sm">
        {members.length === 0 && (
          <li className="p-3 text-slate-500">No members loaded.</li>
        )}
        {members.map((m) => (
          <li key={m.id} className="p-3 flex justify-between gap-2 items-center">
            <code className="text-xs text-slate-500">{m.userId}</code>
            <span className="font-medium uppercase text-xs text-slate-600">
              {m.role}
            </span>
            {canManage ? (
              <button
                type="button"
                className="text-xs text-red-700 underline"
                onClick={() => void removeMember(m.id)}
              >
                Remove
              </button>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
