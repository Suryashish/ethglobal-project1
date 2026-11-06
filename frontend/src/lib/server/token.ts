/** Reader session tokens: base64url(JSON claims) + "." + base64url(HMAC-SHA256). */
import { createHmac, timingSafeEqual } from "node:crypto";

export const READER_TOKEN_TTL_SEC = 12 * 3600;
export type ReaderClaims = { h: string; n: string; exp: number };

const b64u = (b: Buffer) => b.toString("base64url");

export function signReaderToken(
  secret: Uint8Array | string,
  c: { humanId: string; nationality: string; nowSec?: number; ttlSec?: number },
): { token: string; expiresAt: number } {
  const exp = (c.nowSec ?? Math.floor(Date.now() / 1000)) + (c.ttlSec ?? READER_TOKEN_TTL_SEC);
  const body = b64u(Buffer.from(JSON.stringify({ h: c.humanId, n: c.nationality, exp } satisfies ReaderClaims)));
  const mac = b64u(createHmac("sha256", secret).update(body).digest());
  return { token: `${body}.${mac}`, expiresAt: exp };
}

export function verifyReaderToken(
  secret: Uint8Array | string,
  token: unknown,
  nowSec = Math.floor(Date.now() / 1000),
): { ok: true; claims: ReaderClaims } | { ok: false; reason: "malformed" | "bad_signature" | "expired" } {
  if (typeof token !== "string") return { ok: false, reason: "malformed" };
  const parts = token.split(".");
  if (parts.length !== 2 || !parts[0] || !parts[1]) return { ok: false, reason: "malformed" };
  const expected = createHmac("sha256", secret).update(parts[0]).digest();
  let given: Buffer;
  try {
    given = Buffer.from(parts[1], "base64url");
  } catch {
    return { ok: false, reason: "malformed" };
  }
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return { ok: false, reason: "bad_signature" };
  let claims: ReaderClaims;
  try {
    claims = JSON.parse(Buffer.from(parts[0], "base64url").toString("utf8"));
  } catch {
    return { ok: false, reason: "malformed" };
  }
  if (typeof claims.exp !== "number" || typeof claims.n !== "string" || typeof claims.h !== "string") {
    return { ok: false, reason: "malformed" };
  }
  if (claims.exp <= nowSec) return { ok: false, reason: "expired" };
  return { ok: true, claims };
}
