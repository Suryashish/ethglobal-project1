import { randomBytes } from "./crypto.js";

/** Seal IDs: 16 chars of [0-9a-z] (~82 bits), short enough for a social post token. */
const ALPHABET = "0123456789abcdefghijklmnopqrstuvwxyz";
export const SEAL_ID_LENGTH = 16;
export const SEAL_ID_RE = /^[0-9a-z]{16}$/;

export function newSealId(): string {
  let out = "";
  while (out.length < SEAL_ID_LENGTH) {
    for (const b of randomBytes(32)) {
      // rejection sampling: 252 = 7 * 36, keeps the distribution uniform
      if (b < 252 && out.length < SEAL_ID_LENGTH) out += ALPHABET[b % 36];
    }
  }
  return out;
}

export function isSealId(s: unknown): s is string {
  return typeof s === "string" && SEAL_ID_RE.test(s);
}
