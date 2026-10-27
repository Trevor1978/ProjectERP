/** Explicit scopes for automation API tokens. */

export const SERVICE_TOKEN_SCOPES = ["work:read", "work:write"] as const;
export type ServiceTokenScope = (typeof SERVICE_TOKEN_SCOPES)[number];

export function parseScopes(raw: string): ServiceTokenScope[] {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((s): s is ServiceTokenScope =>
      SERVICE_TOKEN_SCOPES.includes(s as ServiceTokenScope),
    );
  } catch {
    return [];
  }
}

export function scopesInclude(
  scopes: ServiceTokenScope[],
  required: ServiceTokenScope,
): boolean {
  if (scopes.includes(required)) return true;
  if (required === "work:read" && scopes.includes("work:write")) return true;
  return false;
}

const WRITE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/**
 * Whether a service token may call this work-route path.
 * Paths are as seen on the API (e.g. /api/projects).
 */
export function serviceTokenAllowsWorkRoute(
  method: string,
  path: string,
): { allowed: boolean; requiredScope?: ServiceTokenScope } {
  const m = method.toUpperCase();
  const p = path.split("?")[0] ?? path;

  const blockedPrefixes = ["/api/clients", "/api/suppliers"];
  if (blockedPrefixes.some((prefix) => p === prefix || p.startsWith(`${prefix}/`))) {
    return { allowed: false };
  }

  const readPatterns: RegExp[] = [
    /^\/api\/projects$/,
    /^\/api\/projects\/[^/]+$/,
    /^\/api\/projects\/[^/]+\/schedule$/,
    /^\/api\/projects\/[^/]+\/members$/,
    /^\/api\/milestones$/,
    /^\/api\/tasks$/,
    /^\/api\/todos$/,
    /^\/api\/projects\/[^/]+\/delete-preview$/,
    /^\/api\/milestones\/[^/]+\/delete-preview$/,
    /^\/api\/tasks\/[^/]+\/delete-preview$/,
    /^\/api\/todos\/[^/]+\/delete-preview$/,
  ];

  const writePatterns: RegExp[] = [
    /^\/api\/projects$/,
    /^\/api\/projects\/[^/]+$/,
    /^\/api\/projects\/[^/]+\/members$/,
    /^\/api\/projects\/[^/]+\/members\/[^/]+$/,
    /^\/api\/milestones$/,
    /^\/api\/milestones\/[^/]+$/,
    /^\/api\/tasks$/,
    /^\/api\/tasks\/[^/]+$/,
    /^\/api\/todos$/,
    /^\/api\/todos\/[^/]+$/,
    /^\/api\/task-dependencies$/,
    /^\/api\/task-dependencies\/[^/]+$/,
    /^\/api\/projects\/[^/]+$/,
    /^\/api\/milestones\/[^/]+$/,
    /^\/api\/tasks\/[^/]+$/,
    /^\/api\/todos\/[^/]+$/,
  ];

  if (WRITE_METHODS.has(m)) {
    if (writePatterns.some((re) => re.test(p))) {
      return { allowed: true, requiredScope: "work:write" };
    }
    return { allowed: false };
  }

  if (m === "GET" || m === "HEAD" || m === "OPTIONS") {
    if (readPatterns.some((re) => re.test(p))) {
      return { allowed: true, requiredScope: "work:read" };
    }
  }

  return { allowed: false };
}

/** Best-effort entity target from API path for access logs. */
export function inferAccessLogEntity(path: string): {
  entityType: string | null;
  entityId: string | null;
} {
  const p = path.split("?")[0] ?? path;
  const rules: { re: RegExp; type: string; idGroup: number }[] = [
    { re: /^\/api\/projects\/([^/]+)/, type: "project", idGroup: 1 },
    { re: /^\/api\/milestones\/([^/]+)/, type: "milestone", idGroup: 1 },
    { re: /^\/api\/tasks\/([^/]+)/, type: "task", idGroup: 1 },
    { re: /^\/api\/todos\/([^/]+)/, type: "todo", idGroup: 1 },
    { re: /^\/api\/task-dependencies\/([^/]+)/, type: "task_dependency", idGroup: 1 },
  ];
  for (const rule of rules) {
    const m = p.match(rule.re);
    if (m?.[rule.idGroup]) {
      return { entityType: rule.type, entityId: m[rule.idGroup]! };
    }
  }
  if (p === "/api/projects" || p.startsWith("/api/projects?")) {
    return { entityType: "project", entityId: null };
  }
  if (p === "/api/milestones" || p.startsWith("/api/milestones?")) {
    return { entityType: "milestone", entityId: null };
  }
  if (p === "/api/tasks" || p.startsWith("/api/tasks?")) {
    return { entityType: "task", entityId: null };
  }
  if (p === "/api/todos" || p.startsWith("/api/todos?")) {
    return { entityType: "todo", entityId: null };
  }
  return { entityType: null, entityId: null };
}
