import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams } from "react-router-dom";
import { api } from "../../lib/api";
import { PurchasingDetailView } from "../../components/PurchasingDetailView";
import type { Procurement, ProcurementLine } from "../../workspace/purchasingTypes";
import { WorkspaceDetailChrome } from "./WorkspaceDetailChrome";

type Project = { id: string; name: string; version: number };
type Supplier = { id: string; name: string; version: number };

export function WorkspacePurchasingDetailPage() {
  const { procurementId } = useParams<{ procurementId: string }>();
  const qc = useQueryClient();
  const { data: procData, isLoading } = useQuery({
    queryKey: ["proc-all"],
    queryFn: () => api<{ procurement: Procurement[]; lines: ProcurementLine[] }>("/api/procurement"),
  });
  const { data: projectsData } = useQuery({
    queryKey: ["projects"],
    queryFn: () => api<{ projects: Project[] }>("/api/projects"),
  });
  const { data: suppliersData } = useQuery({
    queryKey: ["suppliers"],
    queryFn: () => api<{ suppliers: Supplier[] }>("/api/suppliers"),
  });

  const row = procData?.procurement.find((p) => p.id === procurementId);
  const lines = (procData?.lines ?? [])
    .filter((l) => l.procurementId === procurementId)
    .slice()
    .sort((a, b) => a.orderIndex - b.orderIndex);

  async function onRefresh() {
    await qc.invalidateQueries({ queryKey: ["proc-all"] });
  }

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
      <PurchasingDetailView row={row} lines={lines} projects={projects} suppliers={suppliers} onRefresh={onRefresh} />
    </WorkspaceDetailChrome>
  );
}
