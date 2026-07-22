import { useCallback, useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, apiFetchUrl, apiForm } from "../../lib/api";
import { useMe } from "../../hooks/useMe";
import { ORG_PROFILE_QUERY_KEY, useOrgProfile } from "../../hooks/useOrgProfile";
import { useDebouncedPatch } from "../../hooks/useDebouncedPatch";
import type { OrgProfile, OrgProfileResponse, OrgReportImage } from "../../workspace/orgProfileTypes";

type ProfileFields = {
  displayName: string;
  shippingAddress: string;
  billingAddress: string;
  correspondenceAddress: string;
  phone: string;
  email: string;
  website: string;
  taxId: string;
};

type OrgUser = {
  id: string;
  email: string;
  name: string;
  globalRole: "member" | "org_admin";
  projectCount: number;
};

function fieldsFromProfile(p: OrgProfile): ProfileFields {
  return {
    displayName: p.displayName ?? "",
    shippingAddress: p.shippingAddress,
    billingAddress: p.billingAddress,
    correspondenceAddress: p.correspondenceAddress,
    phone: p.phone,
    email: p.email,
    website: p.website,
    taxId: p.taxId,
  };
}

export function WorkspaceOrganizationPage() {
  const qc = useQueryClient();
  const { data: meData } = useMe();
  const isAdmin = meData?.user?.globalRole === "org_admin";
  const { data, isLoading, error } = useOrgProfile();
  const profile = data?.profile;

  const { data: usersData, isLoading: usersLoading } = useQuery({
    queryKey: ["org-users"],
    queryFn: () => api<{ users: OrgUser[] }>("/api/org/users"),
    enabled: isAdmin,
  });

  const [fields, setFields] = useState<ProfileFields | null>(null);
  const [saveErr, setSaveErr] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadErr, setUploadErr] = useState<string | null>(null);

  const [inviteName, setInviteName] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [invitePassword, setInvitePassword] = useState("");
  const [inviteRole, setInviteRole] = useState<"member" | "org_admin">("member");
  const [inviteAddProjects, setInviteAddProjects] = useState(true);
  const [inviting, setInviting] = useState(false);
  const [inviteErr, setInviteErr] = useState<string | null>(null);
  const [inviteOk, setInviteOk] = useState<string | null>(null);
  const [peopleBusyId, setPeopleBusyId] = useState<string | null>(null);
  const [peopleErr, setPeopleErr] = useState<string | null>(null);

  useEffect(() => {
    if (profile) setFields(fieldsFromProfile(profile));
  }, [profile?.updatedAt, profile?.organizationId]);

  const patchPayload = useMemo(() => {
    if (!fields) return null;
    return {
      displayName: fields.displayName.trim() || null,
      shippingAddress: fields.shippingAddress,
      billingAddress: fields.billingAddress,
      correspondenceAddress: fields.correspondenceAddress,
      phone: fields.phone,
      email: fields.email,
      website: fields.website,
      taxId: fields.taxId,
    };
  }, [fields]);

  const saveProfile = useCallback(
    async (payload: NonNullable<typeof patchPayload>) => {
      setSaveErr(null);
      const res = await api<OrgProfileResponse>("/api/org/profile", {
        method: "PATCH",
        body: JSON.stringify(payload),
      });
      qc.setQueryData(ORG_PROFILE_QUERY_KEY, res);
      setFields(fieldsFromProfile(res.profile));
      return {};
    },
    [qc],
  );

  useDebouncedPatch({
    enabled: isAdmin && patchPayload != null,
    payload: patchPayload ?? {
      displayName: null,
      shippingAddress: "",
      billingAddress: "",
      correspondenceAddress: "",
      phone: "",
      email: "",
      website: "",
      taxId: "",
    },
    save: saveProfile,
  });

  const onUpload = async (fileList: FileList | null) => {
    if (!fileList?.length || !isAdmin) return;
    setUploadErr(null);
    setUploading(true);
    try {
      for (const file of Array.from(fileList)) {
        const form = new FormData();
        form.append("file", file);
        await apiForm<{ image: OrgReportImage }>("/api/org/report-images", form);
      }
      await qc.invalidateQueries({ queryKey: ORG_PROFILE_QUERY_KEY });
    } catch (e) {
      setUploadErr(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const toggleInclude = async (img: OrgReportImage) => {
    if (!isAdmin) return;
    await api(`/api/org/report-images/${img.id}`, {
      method: "PATCH",
      body: JSON.stringify({ includeOnReports: !img.includeOnReports }),
    });
    await qc.invalidateQueries({ queryKey: ORG_PROFILE_QUERY_KEY });
  };

  const removeImage = async (img: OrgReportImage) => {
    if (!isAdmin) return;
    if (!window.confirm(`Remove "${img.fileName}" from report images?`)) return;
    await api(`/api/org/report-images/${img.id}`, { method: "DELETE", body: "{}" });
    await qc.invalidateQueries({ queryKey: ORG_PROFILE_QUERY_KEY });
  };

  const inviteUser = async () => {
    setInviteErr(null);
    setInviteOk(null);
    setInviting(true);
    try {
      const res = await api<{ user: OrgUser; projectsAdded: number }>("/api/org/users", {
        method: "POST",
        body: JSON.stringify({
          name: inviteName.trim(),
          email: inviteEmail.trim(),
          password: invitePassword,
          globalRole: inviteRole,
          addToAllProjects: inviteAddProjects,
        }),
      });
      setInviteName("");
      setInviteEmail("");
      setInvitePassword("");
      setInviteOk(
        `Created ${res.user.name}` +
          (res.projectsAdded
            ? ` and added to ${res.projectsAdded} project${res.projectsAdded === 1 ? "" : "s"}`
            : inviteAddProjects
              ? " (no projects yet)"
              : ""),
      );
      await qc.invalidateQueries({ queryKey: ["org-users"] });
    } catch (e) {
      setInviteErr(e instanceof Error ? e.message : "Invite failed");
    } finally {
      setInviting(false);
    }
  };

  const grantAllProjects = async (u: OrgUser) => {
    setPeopleErr(null);
    setPeopleBusyId(u.id);
    try {
      const res = await api<{ projectsAdded: number; projectCount: number }>(
        `/api/org/users/${u.id}/grant-all-projects`,
        { method: "POST", body: "{}" },
      );
      setInviteOk(
        `${u.name}: added to ${res.projectsAdded} more project${res.projectsAdded === 1 ? "" : "s"} (now on ${res.projectCount})`,
      );
      await qc.invalidateQueries({ queryKey: ["org-users"] });
    } catch (e) {
      setPeopleErr(e instanceof Error ? e.message : "Failed to grant access");
    } finally {
      setPeopleBusyId(null);
    }
  };

  const setUserRole = async (u: OrgUser, globalRole: "member" | "org_admin") => {
    setPeopleErr(null);
    setPeopleBusyId(u.id);
    try {
      await api(`/api/org/users/${u.id}`, {
        method: "PATCH",
        body: JSON.stringify({ globalRole }),
      });
      await qc.invalidateQueries({ queryKey: ["org-users"] });
    } catch (e) {
      setPeopleErr(e instanceof Error ? e.message : "Failed to update role");
    } finally {
      setPeopleBusyId(null);
    }
  };

  if (isLoading || !fields) {
    return <p className="text-slate-500">Loading organization settings…</p>;
  }
  if (error) {
    return <p className="text-red-600">Could not load organization settings.</p>;
  }

  const images = profile?.images ?? [];

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="mb-1 text-xl font-medium tracking-tight text-tesla-text">Organization</h1>
      <p className="mb-6 text-sm text-tesla-text-secondary">
        Details and logos used on RFQ/PO and other printable reports.{" "}
        {isAdmin ? "Changes save automatically." : "Contact an org admin to edit."}
      </p>

      {!isAdmin && (
        <p className="mb-4 rounded-sm border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          You can view these settings but only org admins can change them.
        </p>
      )}

      <section className="mb-8 rounded-lg border border-tesla-border bg-white p-4 shadow-sm">
        <h2 className="mb-3 text-sm font-semibold text-tesla-text">Identity</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label htmlFor="org-display-name" className="block text-sm font-medium text-tesla-text-secondary">
              Display name on reports
            </label>
            <input
              id="org-display-name"
              className="mt-1 w-full rounded-sm border border-tesla-border px-2 py-1 disabled:bg-tesla-muted/40"
              value={fields.displayName}
              disabled={!isAdmin}
              placeholder={meData?.user?.org.name ?? "Organization name"}
              onChange={(e) => setFields((f) => f && { ...f, displayName: e.target.value })}
            />
            <p className="mt-1 text-xs text-tesla-text-secondary">
              Leave blank to use {meData?.user?.org.name ?? "your organization name"}.
            </p>
          </div>
          <div>
            <label htmlFor="org-phone" className="block text-sm font-medium text-tesla-text-secondary">Phone</label>
            <input
              id="org-phone"
              className="mt-1 w-full rounded-sm border border-tesla-border px-2 py-1 disabled:bg-tesla-muted/40"
              value={fields.phone}
              disabled={!isAdmin}
              onChange={(e) => setFields((f) => f && { ...f, phone: e.target.value })}
            />
          </div>
          <div>
            <label htmlFor="org-email" className="block text-sm font-medium text-tesla-text-secondary">Email</label>
            <input
              id="org-email"
              className="mt-1 w-full rounded-sm border border-tesla-border px-2 py-1 disabled:bg-tesla-muted/40"
              value={fields.email}
              disabled={!isAdmin}
              onChange={(e) => setFields((f) => f && { ...f, email: e.target.value })}
            />
          </div>
          <div>
            <label htmlFor="org-website" className="block text-sm font-medium text-tesla-text-secondary">Website</label>
            <input
              id="org-website"
              className="mt-1 w-full rounded-sm border border-tesla-border px-2 py-1 disabled:bg-tesla-muted/40"
              value={fields.website}
              disabled={!isAdmin}
              onChange={(e) => setFields((f) => f && { ...f, website: e.target.value })}
            />
          </div>
          <div>
            <label htmlFor="org-tax-id" className="block text-sm font-medium text-tesla-text-secondary">ABN / Tax ID</label>
            <input
              id="org-tax-id"
              className="mt-1 w-full rounded-sm border border-tesla-border px-2 py-1 disabled:bg-tesla-muted/40"
              value={fields.taxId}
              disabled={!isAdmin}
              onChange={(e) => setFields((f) => f && { ...f, taxId: e.target.value })}
            />
          </div>
        </div>
        {saveErr && <p className="mt-2 text-sm text-red-600">{saveErr}</p>}
      </section>

      <section className="mb-8 rounded-lg border border-tesla-border bg-white p-4 shadow-sm">
        <h2 className="mb-3 text-sm font-semibold text-tesla-text">Addresses</h2>
        <div className="grid gap-4">
          <div>
            <label htmlFor="org-shipping" className="block text-sm font-medium text-tesla-text-secondary">Shipping</label>
            <textarea
              id="org-shipping"
              rows={3}
              className="mt-1 w-full rounded-sm border border-tesla-border px-2 py-1 disabled:bg-tesla-muted/40"
              value={fields.shippingAddress}
              disabled={!isAdmin}
              onChange={(e) => setFields((f) => f && { ...f, shippingAddress: e.target.value })}
            />
          </div>
          <div>
            <label htmlFor="org-billing" className="block text-sm font-medium text-tesla-text-secondary">Billing</label>
            <textarea
              id="org-billing"
              rows={3}
              className="mt-1 w-full rounded-sm border border-tesla-border px-2 py-1 disabled:bg-tesla-muted/40"
              value={fields.billingAddress}
              disabled={!isAdmin}
              onChange={(e) => setFields((f) => f && { ...f, billingAddress: e.target.value })}
            />
          </div>
          <div>
            <label htmlFor="org-correspondence" className="block text-sm font-medium text-tesla-text-secondary">
              Correspondence / other
            </label>
            <textarea
              id="org-correspondence"
              rows={3}
              className="mt-1 w-full rounded-sm border border-tesla-border px-2 py-1 disabled:bg-tesla-muted/40"
              value={fields.correspondenceAddress}
              disabled={!isAdmin}
              onChange={(e) =>
                setFields((f) => f && { ...f, correspondenceAddress: e.target.value })
              }
            />
          </div>
        </div>
      </section>

      <section className="mb-8 rounded-lg border border-tesla-border bg-white p-4 shadow-sm">
        <h2 className="mb-1 text-sm font-semibold text-tesla-text">People</h2>
        <p className="mb-3 text-xs text-tesla-text-secondary">
          Org members only see projects they belong to. New users are added to all
          existing projects by default so they can see shared work.
        </p>
        {!isAdmin ? (
          <p className="text-sm text-tesla-text-secondary">Only org admins can manage people.</p>
        ) : (
          <>
            <div className="mb-4 grid gap-2 rounded-sm border border-dashed border-tesla-border bg-tesla-muted/20 p-3 sm:grid-cols-2">
              <div>
                <label className="block text-xs font-medium text-tesla-text-secondary">Name</label>
                <input
                  className="mt-1 w-full rounded-sm border border-tesla-border px-2 py-1.5 text-sm"
                  value={inviteName}
                  onChange={(e) => setInviteName(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-tesla-text-secondary">Email</label>
                <input
                  type="email"
                  className="mt-1 w-full rounded-sm border border-tesla-border px-2 py-1.5 text-sm"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-tesla-text-secondary">
                  Temporary password
                </label>
                <input
                  type="password"
                  className="mt-1 w-full rounded-sm border border-tesla-border px-2 py-1.5 text-sm"
                  value={invitePassword}
                  onChange={(e) => setInvitePassword(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-tesla-text-secondary">Role</label>
                <select
                  className="mt-1 w-full rounded-sm border border-tesla-border bg-white px-2 py-1.5 text-sm"
                  value={inviteRole}
                  onChange={(e) =>
                    setInviteRole(e.target.value as "member" | "org_admin")
                  }
                >
                  <option value="member">Member</option>
                  <option value="org_admin">Org admin</option>
                </select>
              </div>
              <label className="flex items-center gap-2 text-sm text-tesla-text sm:col-span-2">
                <input
                  type="checkbox"
                  checked={inviteAddProjects}
                  onChange={(e) => setInviteAddProjects(e.target.checked)}
                />
                Add to all existing projects
              </label>
              <div className="sm:col-span-2">
                <button
                  type="button"
                  disabled={
                    inviting ||
                    !inviteName.trim() ||
                    !inviteEmail.trim() ||
                    invitePassword.length < 8
                  }
                  className="rounded-sm bg-tesla-text px-3 py-1.5 text-sm text-white disabled:opacity-50"
                  onClick={() => void inviteUser()}
                >
                  {inviting ? "Creating…" : "Create user"}
                </button>
              </div>
              {inviteErr && <p className="text-sm text-red-600 sm:col-span-2">{inviteErr}</p>}
              {inviteOk && <p className="text-sm text-emerald-700 sm:col-span-2">{inviteOk}</p>}
              {peopleErr && <p className="text-sm text-red-600 sm:col-span-2">{peopleErr}</p>}
            </div>

            {usersLoading ? (
              <p className="text-sm text-tesla-text-secondary">Loading people…</p>
            ) : (
              <ul className="divide-y divide-tesla-border rounded-sm border border-tesla-border text-sm">
                {(usersData?.users ?? []).map((u) => (
                  <li
                    key={u.id}
                    className="flex flex-wrap items-center justify-between gap-2 px-3 py-2"
                  >
                    <div className="min-w-0">
                      <p className="font-medium text-tesla-text">{u.name}</p>
                      <p className="truncate text-xs text-tesla-text-secondary">
                        {u.email} · {u.globalRole} · {u.projectCount} project
                        {u.projectCount === 1 ? "" : "s"}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {u.globalRole !== "org_admin" ? (
                        <button
                          type="button"
                          disabled={peopleBusyId === u.id}
                          className="text-xs text-blue-700 underline disabled:opacity-50"
                          onClick={() => void setUserRole(u, "org_admin")}
                        >
                          Make admin
                        </button>
                      ) : u.id !== meData?.user?.id ? (
                        <button
                          type="button"
                          disabled={peopleBusyId === u.id}
                          className="text-xs text-blue-700 underline disabled:opacity-50"
                          onClick={() => void setUserRole(u, "member")}
                        >
                          Make member
                        </button>
                      ) : null}
                      {u.globalRole !== "org_admin" ? (
                        <button
                          type="button"
                          disabled={peopleBusyId === u.id}
                          className="text-xs text-blue-700 underline disabled:opacity-50"
                          onClick={() => void grantAllProjects(u)}
                        >
                          Add to all projects
                        </button>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </section>

      <section className="rounded-lg border border-tesla-border bg-white p-4 shadow-sm">
        <h2 className="mb-1 text-sm font-semibold text-tesla-text">Report images</h2>
        <p className="mb-3 text-xs text-tesla-text-secondary">
          Logos or branding (PNG, JPEG, WebP, GIF — max 2MB each, up to 10). Checked images appear on
          RFQ/PO reports.
        </p>
        {isAdmin && (
          <label
            htmlFor="org-report-upload"
            className="mb-4 inline-flex cursor-pointer items-center gap-2 rounded-sm border border-tesla-border bg-tesla-muted/30 px-3 py-2 text-sm font-medium text-tesla-text hover:bg-tesla-muted/60"
          >
            <input
              id="org-report-upload"
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              multiple
              className="sr-only"
              disabled={uploading}
              onChange={(e) => void onUpload(e.target.files)}
            />
            {uploading ? "Uploading…" : "Upload images"}
          </label>
        )}
        {uploadErr && <p className="mb-2 text-sm text-red-600">{uploadErr}</p>}
        {images.length === 0 ? (
          <p className="text-sm text-tesla-text-secondary">No images uploaded yet.</p>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2">
            {images.map((img) => (
              <li
                key={img.id}
                className="flex gap-3 rounded-sm border border-tesla-border p-2"
              >
                <img
                  src={apiFetchUrl(img.url)}
                  alt={img.fileName}
                  className="h-14 w-20 shrink-0 object-contain"
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-tesla-text">{img.fileName}</p>
                  <label className="mt-1 flex items-center gap-1.5 text-xs text-tesla-text-secondary">
                    <input
                      type="checkbox"
                      checked={img.includeOnReports}
                      disabled={!isAdmin}
                      onChange={() => void toggleInclude(img)}
                    />
                    Show on reports
                  </label>
                  {isAdmin && (
                    <button
                      type="button"
                      className="mt-1 text-xs text-red-600 hover:underline"
                      onClick={() => void removeImage(img)}
                    >
                      Remove
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
