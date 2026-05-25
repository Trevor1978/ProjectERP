export type Procurement = {
  id: string;
  supplierId: string | null;
  title: string;
  status:
    | "draft"
    | "rfq_sent"
    | "quoted"
    | "ordered"
    | "partially_received"
    | "closed"
    | "cancelled";
  fullyReceivedOverride: boolean;
  needBy: string | null;
  sapPoNumber: string | null;
  version: number;
};
export type ProcurementLine = {
  id: string;
  procurementId: string;
  projectId: string;
  projectItemId: string | null;
  partNumber: string | null;
  description: string;
  quantity: string;
  orderedQty: string | null;
  unit: string | null;
  estUnitPrice: number | null;
  orderIndex: number;
  receivedQty: number;
  version: number;
};

export const PROC_STATUS = [
  "draft",
  "rfq_sent",
  "quoted",
  "ordered",
  "partially_received",
  "closed",
  "cancelled",
] as const;
