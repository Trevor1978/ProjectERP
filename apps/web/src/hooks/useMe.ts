import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import type { User } from "../types";

type MeRes = { user: User | null };

export function useMe() {
  return useQuery({
    queryKey: ["me"],
    queryFn: () => api<MeRes>("/api/auth/me"),
  });
}
