const base = import.meta.env.VITE_API_URL || "";

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
    throw new Error(
      typeof err === "object" && err && "error" in err
        ? String((err as { error: string }).error)
        : t || r.statusText,
    );
  }
  return r.json() as Promise<T>;
}
