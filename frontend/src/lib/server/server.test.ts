import { describe, expect, it, vi } from "vitest";
import {
  createSeal,
  draftDigest,
  fromHex,
  generateKeypair,
  openSeal,
  ownerSignal,
  readerSignal,
  toBase64,
  unwrapKey,
  wrapKey,
  type SealDraft,
  type SealState,
} from "@iigs/core";
import type { WorldProofEnvelope } from "@iigs/world";
import { assertActionAllowed, assertSameHuman, verifyArmProof, verifyOwnerAction, verifyReaderSession } from "./auth";
import { ApiError } from "./errors";
import { checkGatedRelease } from "./gated";
import { mapArkivWriteError } from "./arkiv";
import { sealStateFromJson, sealStateToJson } from "../serialize";
import { signReaderToken, verifyReaderToken } from "./token";

const NOW = 1_800_000_000;
const AUTHOR = "mock:author";
const THIEF = "mock:thief";

/** A verifier stub: the "proof" result carries the human id directly. */
const verify = async (env: WorldProofEnvelope) => ({ ok: true as const, humanId: (env.result as { id: string }).id });
const proof = (signal: string, id = AUTHOR, kind: "owner" | "reader" = "owner"): WorldProofEnvelope => ({
  mode: "mock",
  kind,
  signal,
  result: { id },
});

async function codeOf(p: Promise<unknown>): Promise<{ status: number; code: string } | null> {
  try {
    await p;
    return null;
  } catch (e) {
    if (e instanceof ApiError) return { status: e.status, code: e.code };
    throw e;
  }
}

function makeDraft(): SealDraft {
  const esc = generateKeypair();
  return createSeal({
    content: { type: "text", text: "hello" },
    rule: { kind: "BOTH", releaseAt: NOW + 300, intervalSec: 120 },
    audience: "PUBLIC",
    escrowPublicKey: esc.publicKey,
    gatedPublicKey: esc.publicKey,
    source: "vault",
  }).draft;
}

function stateOf(over: Partial<SealState["seal"]> = {}, status: SealState["status"] = "ARMED", release: SealState["release"] = null): SealState {
  return {
    seal: {
      entityKey: "0xabc",
      sealId: "aaaaaaaaaaaaaaaa",
      kind: "BOTH",
      releaseAt: NOW + 1000,
      intervalSec: 120,
      audience: "PUBLIC",
      countries: [],
      ownerNullifier: AUTHOR,
      contentType: "inline",
      swarmRef: "",
      wrappedKeyEscrow: new Uint8Array([1, 2, 3]),
      title: "",
      createdAt: NOW - 10,
      contentHash: "00",
      sizeBytes: 3,
      source: "vault",
      ...over,
    },
    status,
    disarm: null,
    release,
    checkins: [],
    nextDeadline: null,
    nextDeadlineRule: null,
  };
}

describe("verifyOwnerAction", () => {
  const id = "aaaaaaaaaaaaaaaa";
  it("accepts a fresh, exact signal and returns the human id", async () => {
    const sig = ownerSignal("checkin", id, NOW - 5);
    const r = await verifyOwnerAction(proof(sig), { action: "checkin", sealId: id, nowSec: NOW, verify });
    expect(r.humanId).toBe(AUTHOR);
  });
  it("rejects a signal made for another action (replay)", async () => {
    const sig = ownerSignal("checkin", id, NOW);
    expect(await codeOf(verifyOwnerAction(proof(sig), { action: "disarm", sealId: id, nowSec: NOW, verify }))).toEqual({ status: 400, code: "signal_mismatch" });
  });
  it("rejects a signal made for another seal", async () => {
    const sig = ownerSignal("checkin", "bbbbbbbbbbbbbbbb", NOW);
    expect(await codeOf(verifyOwnerAction(proof(sig), { action: "checkin", sealId: id, nowSec: NOW, verify }))).toEqual({ status: 400, code: "signal_mismatch" });
  });
  it("rejects wrong extra (extend to a different time)", async () => {
    const sig = ownerSignal("extend", id, NOW, "1800000500");
    expect(await codeOf(verifyOwnerAction(proof(sig), { action: "extend", sealId: id, extra: "1800009999", nowSec: NOW, verify }))).toEqual({ status: 400, code: "signal_mismatch" });
  });
  it("rejects stale signals", async () => {
    const sig = ownerSignal("checkin", id, NOW - 11 * 60);
    expect(await codeOf(verifyOwnerAction(proof(sig), { action: "checkin", sealId: id, nowSec: NOW, verify }))).toEqual({ status: 400, code: "stale_signal" });
  });
  it("rejects far-future signals", async () => {
    const sig = ownerSignal("checkin", id, NOW + 3600);
    expect((await codeOf(verifyOwnerAction(proof(sig), { action: "checkin", sealId: id, nowSec: NOW, verify })))?.code).toBe("stale_signal");
  });
  it("rejects garbage proofs", async () => {
    expect((await codeOf(verifyOwnerAction(null, { action: "checkin", sealId: id, verify })))?.code).toBe("bad_proof");
    expect((await codeOf(verifyOwnerAction({ signal: 1 }, { action: "checkin", sealId: id, verify })))?.code).toBe("bad_proof");
  });
  it("propagates a World verification failure as 401", async () => {
    const sig = ownerSignal("checkin", id, NOW);
    const bad = async () => ({ ok: false as const, code: "proof_invalid", message: "nope" });
    expect(await codeOf(verifyOwnerAction(proof(sig), { action: "checkin", sealId: id, nowSec: NOW, verify: bad }))).toEqual({ status: 401, code: "proof_invalid" });
  });
  it("arm proof must commit to the exact draft digest", async () => {
    const draft = makeDraft();
    const good = proof(ownerSignal("arm", draft.sealId, NOW, draftDigest(draft)));
    expect((await verifyArmProof(good, draft, { nowSec: NOW, verify })).humanId).toBe(AUTHOR);
    const tampered = { ...draft, title: "swapped after the face check" };
    expect((await codeOf(verifyArmProof(good, tampered, { nowSec: NOW, verify })))?.code).toBe("signal_mismatch");
  });
});

describe("thief rejection", () => {
  it("same human passes, other human gets 403 different_human", () => {
    const st = stateOf();
    expect(() => assertSameHuman(AUTHOR, st)).not.toThrow();
    try {
      assertSameHuman(THIEF, st);
      throw new Error("should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(ApiError);
      expect((e as ApiError).status).toBe(403);
      expect((e as ApiError).code).toBe("different_human");
      expect((e as ApiError).message).toMatch(/Face check did not match the author/);
    }
  });
});

describe("assertActionAllowed", () => {
  const codes = (fn: () => void) => {
    try {
      fn();
      return null;
    } catch (e) {
      return (e as ApiError).code;
    }
  };
  it("blocks everything on DISARMED / RELEASED seals", () => {
    for (const a of ["checkin", "disarm", "release-now", "extend"] as const) {
      expect(codes(() => assertActionAllowed(a, stateOf({}, "DISARMED"), { releaseAt: NOW + 5000, nowSec: NOW }))).toBe("seal_disarmed");
      expect(codes(() => assertActionAllowed(a, stateOf({}, "RELEASED"), { releaseAt: NOW + 5000, nowSec: NOW }))).toBe("seal_released");
    }
  });
  it("allows check-in on armed heartbeat seals only", () => {
    expect(codes(() => assertActionAllowed("checkin", stateOf()))).toBeNull();
    expect(codes(() => assertActionAllowed("checkin", stateOf({ kind: "TIMER", intervalSec: 0 })))).toBe("no_heartbeat");
    expect(codes(() => assertActionAllowed("checkin", stateOf({}, "RELEASING")))).toBe("seal_releasing");
  });
  it("refuses disarm once the rule fired (RELEASING): nobody can stop a release in flight, not even under coercion", () => {
    expect(codes(() => assertActionAllowed("disarm", stateOf({}, "RELEASING")))).toBe("seal_releasing");
    expect(codes(() => assertActionAllowed("disarm", stateOf({}, "ARMED")))).toBeNull();
  });
  it("extend must be later than current releaseAt and only for timer seals", () => {
    const st = stateOf({ releaseAt: NOW + 1000 });
    expect(codes(() => assertActionAllowed("extend", st, { releaseAt: NOW + 2000, nowSec: NOW }))).toBeNull();
    expect(codes(() => assertActionAllowed("extend", st, { releaseAt: NOW + 500, nowSec: NOW }))).toBe("bad_release_at");
    expect(codes(() => assertActionAllowed("extend", stateOf({ kind: "HEARTBEAT", releaseAt: 0 }), { releaseAt: NOW + 2000, nowSec: NOW }))).toBe("no_timer");
  });
});

describe("reader tokens", () => {
  const secret = new Uint8Array(32).fill(7);
  it("round-trips", () => {
    const { token, expiresAt } = signReaderToken(secret, { humanId: "h", nationality: "IN", nowSec: NOW });
    expect(expiresAt).toBe(NOW + 12 * 3600);
    const r = verifyReaderToken(secret, token, NOW + 10);
    expect(r.ok && r.claims).toEqual({ h: "h", n: "IN", exp: NOW + 12 * 3600 });
  });
  it("rejects expiry, tampering, wrong secret, junk", () => {
    const { token } = signReaderToken(secret, { humanId: "h", nationality: "IN", nowSec: NOW });
    expect(verifyReaderToken(secret, token, NOW + 13 * 3600)).toEqual({ ok: false, reason: "expired" });
    const [body, mac] = token.split(".");
    const forged = Buffer.from(JSON.stringify({ h: "h", n: "MT", exp: NOW + 99999 })).toString("base64url");
    expect(verifyReaderToken(secret, `${forged}.${mac}`, NOW)).toEqual({ ok: false, reason: "bad_signature" });
    expect(verifyReaderToken(new Uint8Array(32).fill(8), token, NOW)).toEqual({ ok: false, reason: "bad_signature" });
    expect(verifyReaderToken(secret, body, NOW)).toEqual({ ok: false, reason: "malformed" });
    expect(verifyReaderToken(secret, 42, NOW)).toEqual({ ok: false, reason: "malformed" });
  });
});

describe("reader session", () => {
  const rv = async (_e: WorldProofEnvelope) => ({ ok: true as const, humanId: "mock:r", nationality: "MT" });
  it("accepts a fresh reader signal and returns nationality", async () => {
    const sig = readerSignal("abc123", NOW - 3);
    const r = await verifyReaderSession(proof(sig, "x", "reader"), { nowSec: NOW, verify: rv });
    expect(r).toEqual({ humanId: "mock:r", nationality: "MT" });
  });
  it("rejects owner signals, stale signals", async () => {
    expect((await codeOf(verifyReaderSession(proof(ownerSignal("checkin", "aaaaaaaaaaaaaaaa", NOW), "x", "reader"), { nowSec: NOW, verify: rv })))?.code).toBe("signal_mismatch");
    expect((await codeOf(verifyReaderSession(proof(readerSignal("n", NOW - 3600), "x", "reader"), { nowSec: NOW, verify: rv })))?.code).toBe("stale_signal");
  });
});

describe("gated key release", () => {
  const secret = new Uint8Array(32).fill(9);
  const gatedState = (status: SealState["status"] = "RELEASED", released = true) =>
    stateOf(
      { audience: "GATED", countries: ["IN", "MT"], releaseAt: NOW - 10 }, // its timer has fired
      status,
      released ? { entityKey: "0x1", sealId: "aaaaaaaaaaaaaaaa", releasedAt: NOW, gated: true, sepoliaTx: "", reason: "TIMER" } : null,
    );
  const tok = (n: string) => signReaderToken(secret, { humanId: "h", nationality: n, nowSec: NOW }).token;
  const code = (fn: () => unknown) => {
    try {
      fn();
      return null;
    } catch (e) {
      return `${(e as ApiError).status}:${(e as ApiError).code}`;
    }
  };
  it("lets an allowed nationality through", () => {
    expect(checkGatedRelease(gatedState(), tok("IN"), secret, { nowSec: NOW }).n).toBe("IN");
  });
  it("refuses other nationalities (403), unreleased (409), bad tokens (401), public seals (400)", () => {
    expect(code(() => checkGatedRelease(gatedState(), tok("US"), secret, { nowSec: NOW }))).toBe("403:not_in_country");
    expect(code(() => checkGatedRelease(gatedState("ARMED", false), tok("IN"), secret, { nowSec: NOW }))).toBe("409:not_released");
    expect(code(() => checkGatedRelease(gatedState(), "junk", secret, { nowSec: NOW }))).toBe("401:bad_token");
    expect(code(() => checkGatedRelease(gatedState(), tok("IN"), secret, { nowSec: NOW + 13 * 3600 }))).toBe("401:token_expired");
    expect(code(() => checkGatedRelease(stateOf(), tok("IN"), secret, { nowSec: NOW }))).toBe("400:not_gated");
  });
  it("refuses a release claim when the seal's own rule has not fired (forged / premature on-chain release)", () => {
    const notDue = stateOf(
      { audience: "GATED", countries: ["IN"], releaseAt: NOW + 3600 },
      "RELEASED",
      { entityKey: "0x1", sealId: "aaaaaaaaaaaaaaaa", releasedAt: NOW, gated: true, sepoliaTx: "", reason: "TIMER" },
    );
    expect(code(() => checkGatedRelease(notDue, tok("IN"), secret, { nowSec: NOW }))).toBe("409:not_released");
    expect(code(() => checkGatedRelease({ ...notDue, release: null }, tok("IN"), secret, { chainReleased: true, nowSec: NOW }))).toBe("409:not_released");
  });
  it("accepts an on-chain release when the Arkiv mirror lags", () => {
    expect(code(() => checkGatedRelease(gatedState("ARMED", false), tok("MT"), secret, { chainReleased: true, nowSec: NOW }))).toBeNull();
  });
  it("end to end: the gated service key unwraps K and the reader opens the seal", () => {
    const gated = generateKeypair();
    const esc = generateKeypair();
    const out = createSeal({
      content: { type: "text", text: "secret for Indians" },
      rule: { kind: "TIMER", releaseAt: NOW + 5 },
      audience: "GATED",
      countries: ["in"],
      escrowPublicKey: esc.publicKey,
      gatedPublicKey: gated.publicKey,
      source: "vault",
    });
    const key = unwrapKey(wrapKey(out.key, gated.publicKey, out.draft.sealId), gated.secretKey, out.draft.sealId);
    expect(key).toEqual(out.key);
    const env = openSeal({ sealId: out.draft.sealId, key, ciphertext: out.ciphertext, contentHash: out.draft.contentHash });
    expect(new TextDecoder().decode(env.body)).toBe("secret for Indians");
  });
});

describe("serialization", () => {
  it("round-trips SealState with bytes as base64", () => {
    const st = stateOf({ cipherInline: new Uint8Array([9, 8, 7]) }, "RELEASED", {
      entityKey: "0x1",
      sealId: "aaaaaaaaaaaaaaaa",
      releasedAt: NOW,
      releasedKey: new Uint8Array([4, 5, 6]),
      gated: false,
      sepoliaTx: "0xdead",
      reason: "TIMER",
    });
    const json = sealStateToJson(st);
    expect(json.seal.cipherInlineB64).toBe("CQgH");
    expect(json.seal.wrappedKeyB64).toBe("AQID");
    expect(json.release?.releasedKeyB64).toBe("BAUG");
    expect(JSON.parse(JSON.stringify(json))).toEqual(json); // plain JSON (no bigint/Uint8Array)
    expect(sealStateFromJson(json)).toEqual(st);
  });
});

describe("mapArkivWriteError", () => {
  it("maps an empty verifier wallet to 503 verifier_unfunded", async () => {
    const e = await mapArkivWriteError(new Error("boom"), { address: "0xV", getBalance: async () => 0n });
    expect(e.status).toBe(503);
    expect(e.code).toBe("verifier_unfunded");
    expect(e.message).toContain("0xV");
  });
  it("maps other failures to 502 arkiv_write_failed", async () => {
    const e = await mapArkivWriteError(new Error("rpc exploded\nstack"), { address: "0xV", getBalance: vi.fn(async () => 5n) });
    expect(e.status).toBe(502);
    expect(e.code).toBe("arkiv_write_failed");
    expect(e.message).not.toContain("stack");
  });
  it("falls back to message sniffing when the balance probe fails", async () => {
    const e = await mapArkivWriteError(new Error("insufficient funds for gas"), {
      address: "0xV",
      getBalance: async () => {
        throw new Error("rpc down");
      },
    });
    expect(e.code).toBe("verifier_unfunded");
  });
});
