import type { AuthUser, ServiceTokenAuth } from "./lib/session.js";

declare module "hono" {
  interface ContextVariableMap {
    auth: AuthUser | null;
    serviceToken: ServiceTokenAuth | null;
  }
}
