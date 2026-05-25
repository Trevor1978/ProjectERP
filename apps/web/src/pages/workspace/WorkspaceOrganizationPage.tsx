import { useCallback, useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
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

  const [fields, setFields] = useState<ProfileFields | null>(null);
  const [saveErr, setSaveErr] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadErr, setUploadErr] = useState<string | null>(null);

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
