/**
 * World ID signals. Every owner action's proof commits to (action, sealId, extra, issuedAt), so a
 * proof can't be replayed for another seal or another action, and the server rejects stale ones.
 * For "arm", `extra` is the draft digest, so the proof also commits to the exact ciphertext + rule.
 */
import { sha256Hex } from "./crypto.js";
import type { SealDraft } from "./types.js";

export type OwnerAction = "arm" | "checkin" | "disarm" | "release-now" | "extend";
export const OWNER_ACTIONS: readonly OwnerAction[] = ["arm", "checkin", "disarm", "release-now", "extend"];

/** Max age of a signed signal, in seconds. */
export const SIGNAL_MAX_AGE_SEC = 10 * 60;

export function ownerSignal(action: OwnerAction, sealId: string, issuedAt: number, extra = ""): string {
  return `iigs|${action}|${sealId}|${extra}|${issuedAt}`;
}

export function readerSignal(nonce: string, issuedAt: number): string {
  return `iigs|reader|${nonce}|${issuedAt}`;
}

export type ParsedSignal = { kind: string; subject: string; extra: string; issuedAt: number };

export function parseSignal(signal: string): ParsedSignal | null {
  const parts = signal.split("|");
  if (parts[0] !== "iigs") return null;
  if (parts[1] === "reader" && parts.length === 4) {
    return { kind: "reader", subject: parts[2]!, extra: "", issuedAt: Number(parts[3]) };
  }
  if (parts.length !== 5) return null;
  return { kind: parts[1]!, subject: parts[2]!, extra: parts[3]!, issuedAt: Number(parts[4]) };
}

export function isFresh(issuedAt: number, nowSec: number, maxAge = SIGNAL_MAX_AGE_SEC): boolean {
  return Number.isFinite(issuedAt) && issuedAt <= nowSec + 60 && nowSec - issuedAt <= maxAge;
}

/** Canonical digest of a draft: what the arm proof commits to. */
export function draftDigest(d: SealDraft): string {
  const canonical = JSON.stringify([
    d.sealId,
    d.kind,
    d.releaseAt,
    d.intervalSec,
    d.audience,
    [...d.countries].sort(),
    d.contentType,
    d.swarmRef ?? "",
    d.contentHash,
    d.wrappedKeyB64,
    d.title,
    d.sizeBytes,
  ]);
  return sha256Hex(canonical).slice(0, 32);
}
