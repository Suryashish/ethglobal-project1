/**
 * Server-side World ID verification. NEVER trust a client callback: every proof is verified here.
 * STUB: mock mode only. Live mode (IDKit 4.x, POST https://developer.world.org/api/v4/verify/{rp_id})
 * is implemented by the World integration.
 */
import { mockHumanId } from "./mock.js";
import type { MockProof, OwnerVerifyResult, ReaderVerifyResult, WorldKind, WorldProofEnvelope } from "./types.js";

export function worldMode(): "mock" | "live" {
  return process.env.WORLD_MODE === "live" ? "live" : "mock";
}

function checkEnvelope(env: WorldProofEnvelope, kind: WorldKind, expectedSignal: string) {
  if (!env || typeof env !== "object") return { ok: false as const, code: "bad_proof", message: "missing proof" };
  if (env.kind !== kind) return { ok: false as const, code: "wrong_kind", message: `expected a ${kind} proof` };
  if (env.signal !== expectedSignal) return { ok: false as const, code: "signal_mismatch", message: "proof was made for a different action" };
  if (env.mode !== worldMode()) return { ok: false as const, code: "mode_mismatch", message: `server is in ${worldMode()} mode` };
  return null;
}

export async function verifyOwnerProof(env: WorldProofEnvelope, expectedSignal: string): Promise<OwnerVerifyResult> {
  const bad = checkEnvelope(env, "owner", expectedSignal);
  if (bad) return bad;
  if (env.mode === "mock") {
    const r = env.result as MockProof;
    if (!r || typeof r.identity !== "string") return { ok: false, code: "bad_proof", message: "bad mock proof" };
    return { ok: true, humanId: mockHumanId(r.identity, "owner") };
  }
  return { ok: false, code: "not_implemented", message: "live World ID verification not implemented yet" };
}

export async function verifyReaderProof(env: WorldProofEnvelope, expectedSignal: string): Promise<ReaderVerifyResult> {
  const bad = checkEnvelope(env, "reader", expectedSignal);
  if (bad) return bad;
  if (env.mode === "mock") {
    const r = env.result as MockProof;
    if (!r || typeof r.identity !== "string") return { ok: false, code: "bad_proof", message: "bad mock proof" };
    const nat = typeof r.nationality === "string" && /^[A-Z]{2}$/.test(r.nationality) ? r.nationality : null;
    return { ok: true, humanId: mockHumanId(r.identity, "reader"), nationality: nat };
  }
  return { ok: false, code: "not_implemented", message: "live World ID verification not implemented yet" };
}

export async function createRpContext(_kind: WorldKind, _signal: string): Promise<unknown> {
  return null;
}
