/** Same-origin `/api` when unset. Ignores baked-in localhost API URL on LAN/IP deploys (browser "localhost" is the user device, not the server). */
function apiBase(): string {
  const env = (import.meta.env.VITE_API_URL as string | undefined)?.trim();
  if (!env) return "";
  if (import.meta.env.PROD && typeof window !== "undefined") {
    try {
      const apiHost = new URL(env).hostname;
      const pageHost = window.location.hostname;
      if (
        (apiHost === "localhost" || apiHost === "127.0.0.1") &&
        pageHost !== "localhost" &&
        pageHost !== "127.0.0.1"
      ) {
        return "";
      }
    } catch {
      /* invalid VITE_API_URL */
    }
  }
  return env;
}

const base = apiBase();

/** Absolute URL for API paths (e.g. authenticated image fetch). */
export function apiFetchUrl(path: string): string {
  const p = path.startsWith("/") ? path : `/${path}`;
  return `${base}${p}`;
}

/** POST multipart (do not set Content-Type — browser sets boundary). */
export async function apiForm<T>(path: string, form: FormData): Promise<T> {
  const r = await fetch(`${base}${path}`, {
    method: "POST",
    body: form,
    credentials: "include",
  });
  if (!r.ok) {
    const t = await r.text();
    let err: unknown;
    try {
      err = JSON.parse(t) as { error?: unknown };
    } catch {
      err = t;
    }
    throw new Error(
      typeof err === "object" && err && "error" in err
        ? String((err as { error: string }).error)
        : t || r.statusText,
    );
  }
  return r.json() as Promise<T>;
}

export async function api<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const r = await fetch(`${base}${path}`, {
    ...init,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });
  if (!r.ok) {
    const t = await r.text();
    let err: unknown;
    try {
      err = JSON.parse(t) as { error?: unknown };
    } catch {
      err = t;
    }
    if (typeof err === "object" && err && "error" in err) {
      const e = (err as { error: unknown }).error;
      throw new Error(
        typeof e === "string" ? e : JSON.stringify(e),
      );
    }
    // Cloudflare/nginx HTML error pages are useless in the UI.
    if (
      typeof t === "string" &&
      /<!DOCTYPE html>|Bad gateway|Error code 502/i.test(t)
    ) {
      throw new Error(
        `Request failed (${r.status}). The API may be down, timed out, or misconfigured (check Coolify API logs and GEMINI_API_KEY).`,
      );
    }
    throw new Error(t || r.statusText);
  }
  return r.json() as Promise<T>;
}
