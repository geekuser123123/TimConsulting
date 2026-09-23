/**
 * Private link tokens for scheduling and proposal pages.
 *
 * token = base64url({k: kind, r: requestId, n: nonce}) + "." + base64url(HMAC-SHA256)
 *
 * - The 256-bit random nonce is stored on the request record; rotating it revokes old links.
 * - The HMAC stops anyone from forging a token for another request ID.
 * - Lookup is by record ID, so no CRM search is needed to resolve a token.
 */
import "server-only";
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { config } from "./config";

export type TokenKind = "schedule" | "proposal";

export function newNonce(): string {
  return randomBytes(32).toString("base64url");
}

function sign(payload: string): string {
  return createHmac("sha256", config.tokenSecret).update(payload).digest("base64url");
}

export function makeToken(kind: TokenKind, requestId: string, nonce: string): string {
  const payload = Buffer.from(JSON.stringify({ k: kind, r: requestId, n: nonce })).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

export function parseToken(kind: TokenKind, token: string): { requestId: string; nonce: string } | null {
  if (typeof token !== "string" || token.length > 1024) return null;
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return null;
  const expected = Buffer.from(sign(payload));
  const given = Buffer.from(sig);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as { k?: string; r?: string; n?: string };
    if (data.k !== kind || typeof data.r !== "string" || typeof data.n !== "string") return null;
    return { requestId: data.r, nonce: data.n };
  } catch {
    return null;
  }
}

export function nonceMatches(stored: string | undefined, given: string): boolean {
  if (!stored) return false;
  const a = Buffer.from(stored);
  const b = Buffer.from(given);
  return a.length === b.length && timingSafeEqual(a, b);
}
