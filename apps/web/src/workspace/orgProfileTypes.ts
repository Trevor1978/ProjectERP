export type OrgReportImage = {
  id: string;
  fileName: string;
  mimeType: string;
  sortOrder: number;
  includeOnReports: boolean;
  createdAt: string;
  url: string;
};

export type OrgProfile = {
  organizationId: string;
  displayName: string | null;
  shippingAddress: string;
  billingAddress: string;
  correspondenceAddress: string;
  phone: string;
  email: string;
  website: string;
  taxId: string;
  updatedAt: string;
  images: OrgReportImage[];
};

export type OrgProfileResponse = { profile: OrgProfile };
