import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import type { OrgProfileResponse } from "../workspace/orgProfileTypes";

export const ORG_PROFILE_QUERY_KEY = ["org", "profile"] as const;

export function useOrgProfile() {
  return useQuery({
    queryKey: ORG_PROFILE_QUERY_KEY,
    queryFn: () => api<OrgProfileResponse>("/api/org/profile"),
  });
}
