import { createHmac, timingSafeEqual } from "node:crypto";

function sessionSecret(): string | null {
  const s = process.env.SESSION_SECRET?.trim();
  return s || null;
}

function signUserId(userId: string, secret: string): string {
  return createHmac("sha256", secret).update(userId).digest("base64url");
}

export function createDigestUnsubscribeToken(userId: string): string | null {
  const secret = sessionSecret();
  if (!secret) return null;
  return `${userId}.${signUserId(userId, secret)}`;
}

export function verifyDigestUnsubscribeToken(token: string): string | null {
  const secret = sessionSecret();
  if (!secret) return null;
  const dot = token.lastIndexOf(".");
  if (dot <= 0) return null;
  const userId = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userId)) {
    return null;
  }
  const expected = signUserId(userId, secret);
  try {
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  } catch {
    return null;
  }
  return userId;
}

function webOrigin(): string {
  return (process.env.WEB_ORIGIN ?? "http://localhost:5173").replace(/\/$/, "");
}

export function digestUnsubscribeUrl(userId: string): string | null {
  const token = createDigestUnsubscribeToken(userId);
  if (!token) return null;
  return `${webOrigin()}/api/auth/digest-unsubscribe?token=${encodeURIComponent(token)}`;
}
