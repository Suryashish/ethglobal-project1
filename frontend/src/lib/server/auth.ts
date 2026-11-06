/**
 * Owner-action authorisation. A proof must (1) commit to the EXACT expected signal for this action,
 * seal and extra, (2) be fresh, (3) verify with World, and (4) belong to the human who armed the seal.
 */
import { draftDigest, isFresh, ownerSignal, parseSignal, readerSignal } from "@iigs/core";
import type { OwnerAction, SealDraft, SealState } from "@iigs/core";
import { verifyOwnerProof, verifyReaderProof } from "@iigs/world/server";
import type { WorldProofEnvelope } from "@iigs/world";
import { ApiError } from "./errors";

export type OwnerVerifier = (env: WorldProofEnvelope, signal: string) => Promise<
  { ok: true; humanId: string } | { ok: false; code: string; message: string }
>;

function asEnvelope(proof: unknown): WorldProofEnvelope {
  if (!proof || typeof proof !== "object") throw new ApiError(400, "bad_proof", "missing World ID proof");
  const p = proof as Record<string, unknown>;
  if (typeof p.signal !== "string" || typeof p.kind !== "string" || typeof p.mode !== "string") {
    throw new ApiError(400, "bad_proof", "malformed World ID proof envelope");
  }
  return p as unknown as WorldProofEnvelope;
}

/** Verifies an owner proof for `action` on `sealId`; returns the proving human's id. */
export async function verifyOwnerAction(
  proof: unknown,
  opts: {
    action: OwnerAction;
    sealId: string;
    extra?: string;
    nowSec?: number;
    verify?: OwnerVerifier;
  },
): Promise<{ humanId: string; issuedAt: number }> {
  const env = asEnvelope(proof);
  const now = opts.nowSec ?? Math.floor(Date.now() / 1000);
  const parsed = parseSignal(env.signal);
  if (!parsed || parsed.kind !== opts.action || parsed.subject !== opts.sealId || parsed.extra !== (opts.extra ?? "")) {
    throw new ApiError(400, "signal_mismatch", "The proof was made for a different action or seal.");
  }
  if (!isFresh(parsed.issuedAt, now)) {
    throw new ApiError(400, "stale_signal", "The proof is too old. Verify again.");
  }
  const expected = ownerSignal(opts.action, opts.sealId, parsed.issuedAt, opts.extra ?? "");
  if (env.signal !== expected) throw new ApiError(400, "signal_mismatch", "The proof signal is not canonical.");
  const res = await (opts.verify ?? verifyOwnerProof)(env, expected);
  if (!res.ok) {
    const status = res.code === "signal_mismatch" || res.code === "wrong_kind" || res.code === "mode_mismatch" ? 400 : 401;
    throw new ApiError(status, res.code, res.message);
  }
  return { humanId: res.humanId, issuedAt: parsed.issuedAt };
}

/** Arm: the proof commits to the draft digest, so ciphertext + rule can't be swapped after the face check. */
export function verifyArmProof(
  proof: unknown,
  draft: SealDraft,
  opts: { nowSec?: number; verify?: OwnerVerifier } = {},
) {
  return verifyOwnerAction(proof, { action: "arm", sealId: draft.sealId, extra: draftDigest(draft), ...opts });
}

export function assertSameHuman(humanId: string, state: Pick<SealState, "seal">) {
  if (humanId !== state.seal.ownerNullifier) {
    throw new ApiError(
      403,
      "different_human",
      "Face check did not match the author — refused. The heartbeat keeps running.",
    );
  }
}

export type ActionGuard = "checkin" | "disarm" | "release-now" | "extend";

/** State guards per action. Throws 409 with an explanatory code. */
export function assertActionAllowed(
  action: ActionGuard,
  state: Pick<SealState, "seal" | "status">,
  opts: { releaseAt?: number; nowSec?: number } = {},
) {
  const { status, seal } = state;
  const now = opts.nowSec ?? Math.floor(Date.now() / 1000);
  if (status === "DISARMED") throw new ApiError(409, "seal_disarmed", "This seal was cancelled; it can never open.");
  if (status === "RELEASED") throw new ApiError(409, "seal_released", "This seal has already been released.");
  if (action === "disarm") return; // ARMED or RELEASING (the rule fired but nothing is on-chain yet)
  if (status === "RELEASING") {
    throw new ApiError(409, "seal_releasing", "The release rule has already fired; waiting for the Chainlink CRE release.");
  }
  if (action === "checkin" && seal.intervalSec <= 0) {
    throw new ApiError(409, "no_heartbeat", "This seal has no heartbeat to renew.");
  }
  if (action === "extend") {
    if (seal.kind === "HEARTBEAT" || seal.releaseAt <= 0) {
      throw new ApiError(409, "no_timer", "Only timer seals can be extended.");
    }
    const r = opts.releaseAt;
    if (!Number.isInteger(r) || (r as number) <= seal.releaseAt || (r as number) <= now) {
      throw new ApiError(400, "bad_release_at", "The new time must be later than the current release time.");
    }
    if ((r as number) > now + 180 * 86400) throw new ApiError(400, "bad_release_at", "The new time is too far away (max 180 days).");
  }
}

/** Reader session: signal is `readerSignal(nonce, issuedAt)`. */
export async function verifyReaderSession(
  proof: unknown,
  opts: {
    nowSec?: number;
    verify?: (env: WorldProofEnvelope, signal: string) => ReturnType<typeof verifyReaderProof>;
  } = {},
): Promise<{ humanId: string; nationality: string | null }> {
  const env = asEnvelope(proof);
  const now = opts.nowSec ?? Math.floor(Date.now() / 1000);
  const parsed = parseSignal(env.signal);
  if (!parsed || parsed.kind !== "reader" || !parsed.subject || env.signal !== readerSignal(parsed.subject, parsed.issuedAt)) {
    throw new ApiError(400, "signal_mismatch", "The proof was not made for a reader session.");
  }
  if (!isFresh(parsed.issuedAt, now)) throw new ApiError(400, "stale_signal", "The proof is too old. Verify again.");
  const res = await (opts.verify ?? verifyReaderProof)(env, env.signal);
  if (!res.ok) throw new ApiError(401, res.code, res.message);
  return { humanId: res.humanId, nationality: res.nationality };
}
