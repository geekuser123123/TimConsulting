/**
 * Signed session cookie for the internal dashboards (Edge + Node compatible — Web Crypto only).
 * Roles: "tim" (both dashboards + staff console) and "staff" (staff console only).
 */
export type Role = "tim" | "staff";
export const SESSION_COOKIE = "tc_session";
export const SESSION_TTL_SECONDS = 12 * 60 * 60;

const enc = new TextEncoder();

function b64url(bytes: ArrayBuffer | Uint8Array): string {
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let s = "";
  for (const b of arr) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromB64url(s: string): string {
  return atob(s.replace(/-/g, "+").replace(/_/g, "/"));
}

async function hmac(secret: string, data: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return b64url(await crypto.subtle.sign("HMAC", key, enc.encode(data)));
}

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function createSession(role: Role, secret: string): Promise<string> {
  const payload = b64url(enc.encode(JSON.stringify({ role, exp: Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS })));
  return `${payload}.${await hmac(secret, payload)}`;
}

export async function readSession(cookie: string | undefined, secret: string): Promise<Role | null> {
  if (!cookie) return null;
  const [payload, sig] = cookie.split(".");
  if (!payload || !sig) return null;
  if (!safeEqual(sig, await hmac(secret, payload))) return null;
  try {
    const data = JSON.parse(fromB64url(payload)) as { role?: string; exp?: number };
    if (!data.exp || data.exp < Date.now() / 1000) return null;
    return data.role === "tim" || data.role === "staff" ? data.role : null;
  } catch {
    return null;
  }
}

export function sessionSecret(): string {
  const s = process.env.SESSION_SECRET;
  if (s) return s;
  if (process.env.NODE_ENV === "production") throw new Error("SESSION_SECRET is required");
  return "dev-only-session-secret-change-me-000000000";
}
