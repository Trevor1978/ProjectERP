import type { QueryClient } from "@tanstack/react-query";
import type { Procurement, ProcurementLine } from "./purchasingTypes";

export const PROC_ALL_QUERY_KEY = ["proc-all"] as const;

export type ProcAllData = {
  procurement: Procurement[];
  lines: ProcurementLine[];
};

export function sortProcurementLines(lines: ProcurementLine[]): ProcurementLine[] {
  return [...lines].sort(
    (a, b) => a.orderIndex - b.orderIndex || a.id.localeCompare(b.id),
  );
}

export function patchProcurementInCache(qc: QueryClient, updated: Procurement) {
  qc.setQueryData<ProcAllData>(PROC_ALL_QUERY_KEY, (old) => {
    if (!old) return old;
    return {
      ...old,
      procurement: old.procurement.map((p) => (p.id === updated.id ? updated : p)),
    };
  });
}

export function patchProcurementLineInCache(qc: QueryClient, updated: ProcurementLine) {
  qc.setQueryData<ProcAllData>(PROC_ALL_QUERY_KEY, (old) => {
    if (!old) return old;
    return {
      ...old,
      lines: old.lines.map((l) => (l.id === updated.id ? updated : l)),
    };
  });
}

export function addProcurementLineToCache(qc: QueryClient, line: ProcurementLine) {
  qc.setQueryData<ProcAllData>(PROC_ALL_QUERY_KEY, (old) => {
    if (!old) return old;
    if (old.lines.some((l) => l.id === line.id)) {
      return {
        ...old,
        lines: old.lines.map((l) => (l.id === line.id ? line : l)),
      };
    }
    return { ...old, lines: [...old.lines, line] };
  });
}

export function removeProcurementLineFromCache(qc: QueryClient, lineId: string) {
  qc.setQueryData<ProcAllData>(PROC_ALL_QUERY_KEY, (old) => {
    if (!old) return old;
    return { ...old, lines: old.lines.filter((l) => l.id !== lineId) };
  });
}
