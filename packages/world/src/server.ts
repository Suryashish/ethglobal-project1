/**
 * Server-side World ID verification. NEVER trust a client callback: every proof is verified here.
 *
 * LIVE mode (WORLD_MODE=live) verifies against the World ID 4.0 endpoint
 *   POST https://developer.world.org/api/v4/verify/{rp_id}
 * MOCK mode (default) accepts only the dev simulator's proofs. Mock proofs are rejected in live mode and vice versa.
 *
 * Design (see docs/world-integration.md):
 *  - OWNER proofs are Selfie Check *session* proofs. The verified `session_id` is the stable per-human id
 *    (`humanId`): created at arm time, re-proved (IDKit.proveSession) on every later owner action.
 *    (A v4 uniqueness nullifier is single-use per action, so it cannot be compared across repeated actions.)
 *  - READER proofs are Identity Check (nationality) uniqueness proofs under the reader action.
 *  - The signal is bound through `signal_hash === hashSignal(expectedSignal)` in every response item.
 */
import { hashSignal } from "@worldcoin/idkit-core/hashing";
import { signRequest } from "@worldcoin/idkit-core/signing";
import { mockHumanId } from "./mock.js";
import type {
  MockProof, OwnerVerifyResult, ReaderVerifyResult, WorldErrorCode, WorldKind, WorldProofEnvelope, WorldRpContext,
} from "./types.js";

export type WorldEnvironment = "staging" | "production" | "sandbox";

export function worldMode(): "mock" | "live" {
  return process.env.WORLD_MODE === "live" ? "live" : "mock";
}

export type WorldServerConfig = {
  appId: string;
  rpId: string;
  signingKey: string;
  environment: WorldEnvironment;
  actionOwner: string;
  actionReader: string;
  verifyBase: string;
  /** Reject Selfie Check proofs whose sybil_score is above this (higher = riskier). Unset = accept any. */
  maxSybilScore: number | null;
};

export function worldConfig(): WorldServerConfig {
  const env = process.env.WORLD_ENVIRONMENT;
  const maxSybil = process.env.WORLD_MAX_SYBIL_SCORE;
  return {
    appId: process.env.WORLD_APP_ID ?? "",
    rpId: process.env.WORLD_RP_ID ?? "",
    signingKey: process.env.WORLD_SIGNING_KEY ?? "",
    environment: env === "production" || env === "sandbox" ? env : "staging",
    actionOwner: process.env.WORLD_ACTION_OWNER || "iigs-owner",
    actionReader: process.env.WORLD_ACTION_READER || "iigs-reader",
    verifyBase: (process.env.WORLD_VERIFY_BASE || "https://developer.world.org").replace(/\/+$/, ""),
    maxSybilScore: maxSybil && Number.isFinite(Number(maxSybil)) ? Number(maxSybil) : null,
  };
}

type Fail = { ok: false; code: WorldErrorCode | string; message: string };
const fail = (code: WorldErrorCode, message: string): Fail => ({ ok: false, code, message });

// ---------- anti-replay + issued-nonce bookkeeping (in-memory, best effort; use a shared store when scaling out) ----------
const TTL_MS = 60 * 60 * 1000;
const issued = new Map<string, { signal: string; kind: WorldKind; at: number }>();
const consumed = new Map<string, number>();
function sweep(now: number) {
  for (const [k, v] of issued) if (now - v.at > TTL_MS) issued.delete(k);
  for (const [k, t] of consumed) if (now - t > TTL_MS) consumed.delete(k);
}
/** test hook */
export function _resetWorldState() { issued.clear(); consumed.clear(); }

function checkEnvelope(env: WorldProofEnvelope, kind: WorldKind, expectedSignal: string): Fail | null {
  if (!env || typeof env !== "object") return fail("bad_proof", "missing proof");
  if (env.kind !== kind) return fail("wrong_kind", `expected a ${kind} proof`);
  if (env.signal !== expectedSignal) return fail("signal_mismatch", "proof was made for a different action");
  if (env.mode !== worldMode()) return fail("mode_mismatch", `server is in ${worldMode()} mode`);
  return null;
}

// ---------- live helpers ----------
type Item = Record<string, unknown>;
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const SESSION_RE = /^session_[0-9a-fA-F]+$/;
const ZERO_HASH = "0x0";

function sameHex(a: unknown, b: string): boolean {
  if (typeof a !== "string") return false;
  try { return BigInt(a) === BigInt(b); } catch { return false; }
}

/** signal binding: signal_hash must commit to the expected signal (nonzero), else the nonce must be one we issued for it. */
function checkSignal(result: Item, items: Item[], expectedSignal: string, kind: WorldKind): Fail | null {
  const want = hashSignal(expectedSignal);
  const hashes = items.map((i) => i.signal_hash);
  const anyBound = hashes.some((h) => typeof h === "string" && !sameHex(h, ZERO_HASH));
  if (anyBound) {
    if (!hashes.every((h) => sameHex(h, want))) return fail("signal_mismatch", "proof does not commit to this action's signal");
    return null;
  }
  // No signal in the proof (e.g. Identity Check): fall back to the nonce we issued in createRpContext for this signal.
  const rec = typeof result.nonce === "string" ? issued.get(result.nonce) : undefined;
  if (!rec || rec.signal !== expectedSignal || rec.kind !== kind) {
    return fail("signal_mismatch", "proof is not bound to this action's signal");
  }
  return null;
}

function consumeNonce(result: Item): Fail | null {
  const nonce = typeof result.nonce === "string" ? result.nonce : null;
  if (!nonce) return fail("bad_proof", "proof has no nonce");
  const now = Date.now();
  sweep(now);
  if (consumed.has(nonce)) return fail("replayed_proof", "this proof was already used");
  consumed.set(nonce, now);
  return null;
}

type PortalOk = { ok: true; body: Item };
async function callVerify(cfg: WorldServerConfig, result: Item): Promise<PortalOk | Fail> {
  if (!cfg.rpId) return fail("config_error", "WORLD_RP_ID is not set");
  let res: Response;
  try {
    res = await fetch(`${cfg.verifyBase}/api/v4/verify/${encodeURIComponent(cfg.rpId)}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...result, environment: cfg.environment }),
    });
  } catch (e) {
    return fail("verify_unreachable", `could not reach the World ID verifier: ${e instanceof Error ? e.message : String(e)}`);
  }
  let body: unknown = null;
  try { body = await res.json(); } catch { /* non-JSON */ }
  const b = isObj(body) ? body : {};
  if (res.ok && b.success === true) return { ok: true, body: b };

  const code = typeof b.code === "string" ? b.code : "";
  const detail = typeof b.detail === "string" ? b.detail : `HTTP ${res.status}`;
  const sub = Array.isArray(b.results) ? b.results.filter(isObj).map((r) => `${r.code ?? ""} ${r.detail ?? ""}`).join(" ").toLowerCase() : "";
  const hay = `${code} ${detail}`.toLowerCase() + " " + sub;
  if (/max_verifications|nullifier_replayed|already verified/.test(hay)) {
    return fail("max_verifications", "This World ID already used its allowed verifications for this action.");
  }
  if (res.status === 404 || code === "app_not_migrated" || /unknown_rp|inactive_rp|invalid_rp|not_registered/.test(hay)) {
    return fail("config_error", `World ID app/RP is not configured correctly (${code || res.status}): ${detail}`);
  }
  return fail("verification_failed", `World ID verification failed (${code || res.status}): ${detail}`);
}

function commonLiveChecks(env: WorldProofEnvelope, cfg: WorldServerConfig): { result: Item; items: Item[] } | Fail {
  const result = env.result;
  if (!isObj(result)) return fail("bad_proof", "malformed World ID result");
  if (result.protocol_version !== "4.0") return fail("wrong_proof_type", "only World ID 4.0 proofs are accepted");
  if (result.environment !== cfg.environment) {
    return fail("wrong_environment", `proof is for environment "${String(result.environment)}", server expects "${cfg.environment}"`);
  }
  const items = Array.isArray(result.responses) ? result.responses.filter(isObj) : [];
  if (items.length === 0) return fail("bad_proof", "proof has no responses");
  return { result, items };
}

async function verifyOwnerLive(env: WorldProofEnvelope, expectedSignal: string): Promise<OwnerVerifyResult> {
  const cfg = worldConfig();
  const pre = commonLiveChecks(env, cfg);
  if ("ok" in pre) return pre;
  const { result, items } = pre;

  // Owner = Selfie Check *session* proof (schema 11). Anything else is the wrong credential.
  const sessionId = result.session_id;
  if (typeof sessionId !== "string" || !SESSION_RE.test(sessionId)) {
    return fail("wrong_proof_type", "owner actions need a Selfie Check session proof");
  }
  if (result.action !== undefined && result.action !== cfg.actionOwner) {
    return fail("wrong_proof_type", "owner proof was made for a different action");
  }
  const selfie = items.find((i) => i.identifier === "selfie" && i.issuer_schema_id === 11);
  if (!selfie || items.length !== 1) {
    return fail("credential_unavailable", "owner actions require Selfie Check; a different credential was presented");
  }
  const sig = checkSignal(result, items, expectedSignal, "owner");
  if (sig) return sig;
  if (cfg.maxSybilScore !== null) {
    const score = selfie.sybil_score;
    if (typeof score !== "number" || score > cfg.maxSybilScore) {
      return fail("sybil_score_too_high", "Selfie Check risk score is above the allowed threshold");
    }
  }
  const replay = consumeNonce(result);
  if (replay) return replay;

  const v = await callVerify(cfg, result);
  if (!v.ok) { consumed.delete(String(result.nonce)); return v; }
  if (v.body.environment !== undefined && v.body.environment !== cfg.environment) {
    return fail("wrong_environment", "verifier reported a different environment");
  }
  if (typeof v.body.session_id === "string" && v.body.session_id !== sessionId) {
    return fail("verification_failed", "verified session does not match the proof's session");
  }
  return { ok: true, humanId: sessionId };
}

async function verifyReaderLive(env: WorldProofEnvelope, expectedSignal: string): Promise<ReaderVerifyResult> {
  const cfg = worldConfig();
  const pre = commonLiveChecks(env, cfg);
  if ("ok" in pre) return pre;
  const { result, items } = pre;

  if (result.action !== cfg.actionReader) return fail("wrong_proof_type", "reader proof was made for a different action");
  const item = items[0]!;
  if (typeof item.nullifier !== "string") return fail("wrong_proof_type", "reader proof must be a uniqueness proof");
  const sig = checkSignal(result, items, expectedSignal, "reader");
  if (sig) return sig;

  const claimed = env.claim?.nationality;
  const nat = typeof claimed === "string" && /^[A-Z]{2}$/.test(claimed) ? claimed : null;
  if (!nat || result.identity_attested !== true) {
    return fail("nationality_unavailable", "your World ID did not attest the nationality — nationality is not available for this credential");
  }
  const replay = consumeNonce(result);
  if (replay) return replay;

  const v = await callVerify(cfg, result);
  if (!v.ok) { consumed.delete(String(result.nonce)); return v; }
  if (v.body.environment !== undefined && v.body.environment !== cfg.environment) {
    return fail("wrong_environment", "verifier reported a different environment");
  }
  let humanId: string;
  try { humanId = "world:" + BigInt(item.nullifier).toString(); } catch { return fail("bad_proof", "bad nullifier"); }
  return { ok: true, humanId, nationality: nat };
}

// ---------- public API ----------
export async function verifyOwnerProof(env: WorldProofEnvelope, expectedSignal: string): Promise<OwnerVerifyResult> {
  const bad = checkEnvelope(env, "owner", expectedSignal);
  if (bad) return bad;
  if (env.mode === "mock") {
    const r = env.result as MockProof;
    if (!r || typeof r.identity !== "string") return fail("bad_proof", "bad mock proof");
    return { ok: true, humanId: mockHumanId(r.identity, "owner") };
  }
  return verifyOwnerLive(env, expectedSignal);
}

export async function verifyReaderProof(env: WorldProofEnvelope, expectedSignal: string): Promise<ReaderVerifyResult> {
  const bad = checkEnvelope(env, "reader", expectedSignal);
  if (bad) return bad;
  if (env.mode === "mock") {
    const r = env.result as MockProof;
    if (!r || typeof r.identity !== "string") return fail("bad_proof", "bad mock proof");
    const nat = typeof r.nationality === "string" && /^[A-Z]{2}$/.test(r.nationality) ? r.nationality : null;
    return { ok: true, humanId: mockHumanId(r.identity, "reader"), nationality: nat };
  }
  return verifyReaderLive(env, expectedSignal);
}

/**
 * Live: signs an RP request (signing key stays server-side) and returns the `rp_context` IDKit needs.
 * Owner requests are session proofs, so they are signed WITHOUT an action; reader requests carry the reader action.
 * Mock: null.
 */
export async function createRpContext(kind: WorldKind, signal: string): Promise<WorldRpContext | null> {
  if (worldMode() === "mock") return null;
  const cfg = worldConfig();
  if (!cfg.rpId || !cfg.signingKey) throw new Error("WORLD_RP_ID and WORLD_SIGNING_KEY must be set for WORLD_MODE=live");
  const sig = signRequest(kind === "reader" ? { signingKeyHex: cfg.signingKey, action: cfg.actionReader } : { signingKeyHex: cfg.signingKey });
  const now = Date.now();
  sweep(now);
  issued.set(sig.nonce, { signal, kind, at: now });
  return { rp_id: cfg.rpId, nonce: sig.nonce, created_at: sig.createdAt, expires_at: sig.expiresAt, signature: sig.sig };
}
