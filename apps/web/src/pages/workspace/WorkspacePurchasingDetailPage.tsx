import { useCallback, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams } from "react-router-dom";
import { api } from "../../lib/api";
import { PurchasingDetailView } from "../../components/PurchasingDetailView";
import type { Procurement, ProcurementLine } from "../../workspace/purchasingTypes";
import {
  PROC_ALL_QUERY_KEY,
  type ProcAllData,
  addProcurementLineToCache,
  patchProcurementInCache,
  patchProcurementLineInCache,
  removeProcurementLineFromCache,
  sortProcurementLines,
} from "../../workspace/procurementCache";
import { useMe } from "../../hooks/useMe";
import { useOrgProfile } from "../../hooks/useOrgProfile";
import { WorkspaceDetailChrome } from "./WorkspaceDetailChrome";

type Project = { id: string; name: string; version: number };
type Supplier = { id: string; name: string; version: number };

export function WorkspacePurchasingDetailPage() {
  const { procurementId } = useParams<{ procurementId: string }>();
  const qc = useQueryClient();
  const { data: procData, isLoading } = useQuery({
    queryKey: PROC_ALL_QUERY_KEY,
    queryFn: () => api<ProcAllData>("/api/procurement"),
  });
  const { data: projectsData } = useQuery({
    queryKey: ["projects"],
    queryFn: () => api<{ projects: Project[] }>("/api/projects"),
  });
  const { data: suppliersData } = useQuery({
    queryKey: ["suppliers"],
    queryFn: () => api<{ suppliers: Supplier[] }>("/api/suppliers"),
  });
  const { data: meData } = useMe();
  const { data: orgProfileData } = useOrgProfile();

  const row = procData?.procurement.find((p) => p.id === procurementId);
  const lines = useMemo(
    () =>
      sortProcurementLines(
        (procData?.lines ?? []).filter((l) => l.procurementId === procurementId),
      ),
    [procData?.lines, procurementId],
  );

  const onHeaderSaved = useCallback(
    (updated: Procurement) => {
      patchProcurementInCache(qc, updated);
    },
    [qc],
  );

  const onLineSaved = useCallback(
    (updated: ProcurementLine) => {
      patchProcurementLineInCache(qc, updated);
    },
    [qc],
  );

  const onLineAdded = useCallback(
    (line: ProcurementLine) => {
      addProcurementLineToCache(qc, line);
    },
    [qc],
  );

  const onLineRemoved = useCallback(
    (lineId: string) => {
      removeProcurementLineFromCache(qc, lineId);
    },
    [qc],
  );

  if (isLoading || !procurementId) {
    return <p className="text-slate-500">Loading…</p>;
  }
  if (!row) {
    return (
      <WorkspaceDetailChrome backTo="/workspace/purchasing" backLabel="← Purchasing" title="Not found">
        <p className="text-slate-600">This purchasing record does not exist or was removed.</p>
      </WorkspaceDetailChrome>
    );
  }

  const projects = projectsData?.projects ?? [];
  const suppliers = suppliersData?.suppliers ?? [];

  return (
    <WorkspaceDetailChrome backTo="/workspace/purchasing" backLabel="← Purchasing" title={row.title}>
      <PurchasingDetailView
        row={row}
        lines={lines}
        projects={projects}
        suppliers={suppliers}
        orgName={meData?.user?.org.name ?? "Organization"}
        orgProfile={orgProfileData?.profile}
        isOrgAdmin={meData?.user?.globalRole === "org_admin"}
        onHeaderSaved={onHeaderSaved}
        onLineSaved={onLineSaved}
        onLineAdded={onLineAdded}
        onLineRemoved={onLineRemoved}
      />
    </WorkspaceDetailChrome>
  );
}
