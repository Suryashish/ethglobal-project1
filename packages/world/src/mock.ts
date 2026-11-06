import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex, utf8ToBytes } from "@noble/hashes/utils.js";
import type { WorldKind } from "./types.js";

/** Deterministic dev-only "nullifier" for a simulated identity. */
export function mockHumanId(identity: string, kind: WorldKind): string {
  return "mock:" + bytesToHex(sha256(utf8ToBytes(`${identity}:${kind}`))).slice(0, 40);
}
