/** Turn a failed fetch body into a short UI string (never dump HTML error pages). */
export function httpErrorMessage(status: number, body: string): string {
  const t = body ?? "";
  let parsed: unknown;
  try {
    parsed = JSON.parse(t) as { error?: unknown };
  } catch {
    parsed = undefined;
  }
  if (typeof parsed === "object" && parsed && "error" in parsed) {
    const e = (parsed as { error: unknown }).error;
    return typeof e === "string" ? e : JSON.stringify(e);
  }

  const htmlish =
    /<!DOCTYPE html>|<\/html>|Bad gateway|Gateway time-out|Error code 502|Error code 504/i.test(
      t,
    );
  if (htmlish) {
    if (status === 504 || /Error code 504|Gateway time-out/i.test(t)) {
      return "Request timed out (504). AI analysis of this document took too long. Try a smaller screenshot (one order at a time) or try again.";
    }
    return `Request failed (${status}). The API may be down, timed out, or misconfigured (check Coolify API logs and GEMINI_API_KEY).`;
  }

  return t.trim() || `Request failed (${status})`;
}
