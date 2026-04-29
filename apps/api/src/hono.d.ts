import type { AuthUser } from "./lib/session.js";

declare module "hono" {
  interface ContextVariableMap {
    auth: AuthUser | null;
  }
}
