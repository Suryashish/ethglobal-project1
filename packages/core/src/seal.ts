/**
 * Author-side sealing and reader-side opening. Runs entirely on the user's device.
 */
import { fromBase64, toBase64 } from "./bytes.js";
import { decryptContent, encryptContent, generateContentKey, sha256Hex, wrapKey } from "./crypto.js";
import { fileEnvelope, textEnvelope, unpackEnvelope, type Envelope } from "./envelope.js";
import { newSealId } from "./ids.js";
import type { Audience, SealDraft, SealKind } from "./types.js";

/** Ciphertexts up to this size are stored inline in the Arkiv entity; larger ones go to Swarm. */
export const INLINE_MAX_BYTES = 8 * 1024;
/** Hard cap for uploaded files. */
export const MAX_FILE_BYTES = 10 * 1024 * 1024;
export const MAX_TITLE_BYTES = 100;

export type SealRule =
  | { kind: "TIMER"; releaseAt: number }
  | { kind: "HEARTBEAT"; intervalSec: number }
  | { kind: "BOTH"; releaseAt: number; intervalSec: number };

export type SealInput = {
  content: { type: "text"; text: string } | { type: "file"; name: string; mime: string; bytes: Uint8Array };
  rule: SealRule;
  audience: Audience;
  countries?: string[];
  title?: string;
  /** X25519 public key of the CRE escrow (PUBLIC) — 32 bytes. */
  escrowPublicKey: Uint8Array;
  /** X25519 public key of the gated key service (GATED) — 32 bytes. */
  gatedPublicKey: Uint8Array;
  source: "vault" | "extension";
  /** Force Swarm storage even for small content (files always go to Swarm). */
  forceSwarm?: boolean;
};

export type SealOutput = {
  /** The draft without swarmRef filled in yet when needsSwarmUpload is true. */
  draft: SealDraft;
  /** nonce||ciphertext. Upload this to Swarm when needsSwarmUpload. */
  ciphertext: Uint8Array;
  needsSwarmUpload: boolean;
  /** The content key. Callers may keep it locally (author preview) but must never send it anywhere. */
  key: Uint8Array;
};

function truncateUtf8(s: string, maxBytes: number): string {
  const enc = new TextEncoder();
  let out = s;
  while (enc.encode(out).length > maxBytes) out = out.slice(0, -1);
  return out;
}

export function normalizeCountries(list: string[] | undefined): string[] {
  const set = new Set((list ?? []).map((c) => c.trim().toUpperCase()).filter((c) => /^[A-Z]{2}$/.test(c)));
  return [...set].sort();
}

export function createSeal(input: SealInput): SealOutput {
  const sealId = newSealId();
  const key = generateContentKey();
  const plaintext =
    input.content.type === "text"
      ? textEnvelope(input.content.text)
      : fileEnvelope(input.content.name, input.content.mime, input.content.bytes);
  if (input.content.type === "file" && input.content.bytes.length > MAX_FILE_BYTES) {
    throw new Error(`file too large (max ${MAX_FILE_BYTES / 1024 / 1024} MB)`);
  }
  const ciphertext = encryptContent(key, sealId, plaintext);
  const countries = input.audience === "GATED" ? normalizeCountries(input.countries) : [];
  if (input.audience === "GATED" && countries.length === 0) {
    throw new Error("a country-gated seal needs at least one country");
  }
  const wrapTo = input.audience === "PUBLIC" ? input.escrowPublicKey : input.gatedPublicKey;
  const wrapped = wrapKey(key, wrapTo);
  const needsSwarmUpload =
    input.forceSwarm === true || input.content.type === "file" || ciphertext.length > INLINE_MAX_BYTES;

  const releaseAt = input.rule.kind === "HEARTBEAT" ? 0 : Math.floor(input.rule.releaseAt);
  const intervalSec = input.rule.kind === "TIMER" ? 0 : Math.floor(input.rule.intervalSec);
  if (input.rule.kind !== "HEARTBEAT" && releaseAt <= 0) throw new Error("timer needs a release time");
  if (input.rule.kind !== "TIMER" && intervalSec < 60) throw new Error("heartbeat interval must be ≥ 60 s");

  const draft: SealDraft = {
    sealId,
    kind: input.rule.kind,
    releaseAt,
    intervalSec,
    audience: input.audience,
    countries,
    contentType: needsSwarmUpload ? "swarm" : "inline",
    ...(needsSwarmUpload ? {} : { cipherInlineB64: toBase64(ciphertext) }),
    wrappedKeyB64: toBase64(wrapped),
    title: truncateUtf8((input.title ?? "").trim(), MAX_TITLE_BYTES),
    contentHash: sha256Hex(ciphertext),
    sizeBytes: ciphertext.length,
    source: input.source,
  };
  return { draft, ciphertext, needsSwarmUpload, key };
}

/** Decrypts a released seal. Verifies the ciphertext hash first when one is given. */
export function openSeal(params: {
  sealId: string;
  key: Uint8Array;
  ciphertext: Uint8Array;
  contentHash?: string;
}): Envelope {
  if (params.contentHash && sha256Hex(params.ciphertext) !== params.contentHash) {
    throw new Error("ciphertext does not match the hash recorded on Arkiv");
  }
  return unpackEnvelope(decryptContent(params.key, params.sealId, params.ciphertext));
}

export function draftCiphertext(d: SealDraft): Uint8Array | null {
  return d.cipherInlineB64 ? fromBase64(d.cipherInlineB64) : null;
}

/** Validates a draft received over the network (server side). Returns an error string or null. */
export function validateDraft(d: unknown): string | null {
  if (!d || typeof d !== "object") return "draft missing";
  const x = d as Record<string, unknown>;
  if (typeof x.sealId !== "string" || !/^[0-9a-z]{16}$/.test(x.sealId)) return "bad sealId";
  if (!["TIMER", "HEARTBEAT", "BOTH"].includes(x.kind as string)) return "bad kind";
  if (!Number.isInteger(x.releaseAt) || (x.releaseAt as number) < 0) return "bad releaseAt";
  if (!Number.isInteger(x.intervalSec) || (x.intervalSec as number) < 0) return "bad intervalSec";
  if (x.kind !== "HEARTBEAT" && (x.releaseAt as number) === 0) return "timer seal needs releaseAt";
  if (x.kind !== "TIMER" && (x.intervalSec as number) < 60) return "heartbeat interval must be ≥ 60 s";
  if (x.kind === "TIMER" && x.intervalSec !== 0) return "timer seal must not have an interval";
  if (x.kind === "HEARTBEAT" && x.releaseAt !== 0) return "heartbeat seal must not have releaseAt";
  if ((x.intervalSec as number) > 180 * 86400) return "interval too long";
  if (!["PUBLIC", "GATED"].includes(x.audience as string)) return "bad audience";
  if (!Array.isArray(x.countries) || !x.countries.every((c) => typeof c === "string" && /^[A-Z]{2}$/.test(c))) {
    return "bad countries";
  }
  if (x.audience === "GATED" && x.countries.length === 0) return "gated seal needs countries";
  if (x.countries.join(",").length > 120) return "too many countries";
  if (x.contentType === "inline") {
    if (typeof x.cipherInlineB64 !== "string" || x.cipherInlineB64.length === 0) return "missing inline ciphertext";
    if (x.cipherInlineB64.length > Math.ceil((INLINE_MAX_BYTES * 4) / 3) + 8) return "inline ciphertext too large";
  } else if (x.contentType === "swarm") {
    if (typeof x.swarmRef !== "string" || !/^[0-9a-f]{64}$/.test(x.swarmRef)) return "bad swarmRef (must be a plain 64-hex reference)";
  } else return "bad contentType";
  if (typeof x.wrappedKeyB64 !== "string") return "missing wrapped key";
  try {
    if (fromBase64(x.wrappedKeyB64).length !== 104) return "wrapped key has wrong length";
  } catch {
    return "wrapped key not base64";
  }
  if (typeof x.title !== "string" || new TextEncoder().encode(x.title).length > MAX_TITLE_BYTES) return "bad title";
  if (typeof x.contentHash !== "string" || !/^[0-9a-f]{64}$/.test(x.contentHash)) return "bad contentHash";
  if (!Number.isInteger(x.sizeBytes) || (x.sizeBytes as number) <= 0) return "bad sizeBytes";
  if (x.source !== "vault" && x.source !== "extension") return "bad source";
  return null;
}
