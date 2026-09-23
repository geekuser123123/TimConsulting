import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";

export function clientIp(request: Request | { headers: Headers }): string {
  const h = request.headers;
  return (h.get("x-forwarded-for")?.split(",")[0] ?? h.get("x-real-ip") ?? "unknown").trim();
}

const g = globalThis as unknown as { __rate?: Map<string, number[]> };

/** Best-effort, per-instance sliding window limiter (use a shared store / WAF for real abuse protection). */
export function rateLimit(key: string, max: number, windowMs: number): boolean {
  g.__rate ??= new Map();
  const now = Date.now();
  const hits = (g.__rate.get(key) ?? []).filter((t) => now - t < windowMs);
  if (hits.length >= max) return false;
  hits.push(now);
  g.__rate.set(key, hits);
  return true;
}

/** Verify `X-Signature: sha256=<hex>` = HMAC-SHA256(secret, rawBody). */
export function verifyHmacSignature(rawBody: string, header: string | null, secret: string): boolean {
  if (!header) return false;
  const given = header.replace(/^sha256=/, "");
  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
  const a = Buffer.from(expected);
  const b = Buffer.from(given);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function safeEqualString(a: string | null | undefined, b: string): boolean {
  if (!a) return false;
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}
