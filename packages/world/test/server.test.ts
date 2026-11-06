import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { hashSignal } from "@worldcoin/idkit-core/hashing";
import { _resetWorldState, createRpContext, verifyOwnerProof, verifyReaderProof, worldMode } from "../src/server.js";
import type { WorldProofEnvelope } from "../src/types.js";

const SIGNAL = "iigs|checkin|seal1||1700000000";
const SESSION = "session_" + "ab".repeat(64);
const KEY = "0x" + "11".repeat(32);

function setEnv(mode: "mock" | "live") {
  process.env.WORLD_MODE = mode;
  process.env.WORLD_APP_ID = "app_staging_test";
  process.env.WORLD_RP_ID = "rp_test";
  process.env.WORLD_SIGNING_KEY = KEY;
  process.env.WORLD_ENVIRONMENT = "staging";
  process.env.WORLD_ACTION_OWNER = "iigs-owner";
  process.env.WORLD_ACTION_READER = "iigs-reader";
  delete process.env.WORLD_MAX_SYBIL_SCORE;
}

const mock = (kind: "owner" | "reader", identity: string, signal = SIGNAL, extra: object = {}): WorldProofEnvelope =>
  ({ mode: "mock", kind, signal, result: { identity, ...extra } });

let n = 0;
const ownerResult = (signal = SIGNAL, over: Record<string, unknown> = {}) => ({
  protocol_version: "4.0", nonce: "0xn" + ++n, session_id: SESSION, environment: "staging",
  integrity_bundle: { version: 2 },
  responses: [{
    identifier: "selfie", issuer_schema_id: 11, signal_hash: hashSignal(signal), proof: ["0x1", "0x2", "0x3", "0x4", "0x5"],
    session_nullifier: ["0xaaa", "0xbbb"], expires_at_min: 1, sybil_score: 1,
  }],
  ...over,
});
const live = (kind: "owner" | "reader", result: unknown, signal = SIGNAL, claim?: { nationality: string }): WorldProofEnvelope =>
  ({ mode: "live", kind, signal, result, ...(claim ? { claim } : {}) });

const okFetch = (body: object = { success: true, environment: "staging", results: [] }, status = 200) =>
  vi.fn(async () => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } }));

beforeEach(() => { _resetWorldState(); setEnv("mock"); });
afterEach(() => { vi.unstubAllGlobals(); });

describe("mock mode", () => {
  it("defaults to mock on dev deployments", () => { delete process.env.WORLD_MODE; expect(worldMode()).toBe("mock"); });
  it("fails closed: the simulator is refused outside dev/local/test deployments", () => {
    const dep = process.env.IIGS_DEP;
    try {
      process.env.IIGS_DEP = "demo";
      delete process.env.WORLD_MODE;
      expect(() => worldMode()).toThrow(/not allowed/);
      process.env.WORLD_MODE = "mock";
      expect(() => worldMode()).toThrow(/not allowed/);
      process.env.WORLD_MODE = "liev"; // typo must not fall back to mock
      expect(() => worldMode()).toThrow(/not allowed/);
      process.env.WORLD_MODE = "live";
      expect(worldMode()).toBe("live");
    } finally {
      if (dep === undefined) delete process.env.IIGS_DEP; else process.env.IIGS_DEP = dep;
      delete process.env.WORLD_MODE;
    }
  });
  it("author gets a stable humanId, thief a different one", async () => {
    const a1 = await verifyOwnerProof(mock("owner", "author"), SIGNAL);
    const a2 = await verifyOwnerProof(mock("owner", "author", SIGNAL), SIGNAL);
    const t = await verifyOwnerProof(mock("owner", "thief"), SIGNAL);
    expect(a1.ok && a2.ok && t.ok).toBe(true);
    if (a1.ok && a2.ok && t.ok) {
      expect(a1.humanId).toBe(a2.humanId);
      expect(t.humanId).not.toBe(a1.humanId);
      expect(a1.humanId.startsWith("mock:")).toBe(true);
    }
  });
  it("reader returns nationality", async () => {
    const r = await verifyReaderProof(mock("reader", "author", "iigs|reader|n|1", { nationality: "MT" }), "iigs|reader|n|1");
    expect(r).toMatchObject({ ok: true, nationality: "MT" });
  });
  it("rejects signal mismatch, kind mismatch, mode mismatch", async () => {
    expect(await verifyOwnerProof(mock("owner", "author", "other"), SIGNAL)).toMatchObject({ ok: false, code: "signal_mismatch" });
    expect(await verifyOwnerProof(mock("reader", "author"), SIGNAL)).toMatchObject({ ok: false, code: "wrong_kind" });
    expect(await verifyOwnerProof(live("owner", ownerResult()), SIGNAL)).toMatchObject({ ok: false, code: "mode_mismatch" });
  });
});

describe("live mode", () => {
  beforeEach(() => setEnv("live"));

  it("rejects mock proofs", async () => {
    expect(await verifyOwnerProof(mock("owner", "author"), SIGNAL)).toMatchObject({ ok: false, code: "mode_mismatch" });
  });

  it("owner: calls the v4 verify endpoint and returns session_id as humanId", async () => {
    const f = okFetch({ success: true, environment: "staging", session_id: SESSION, results: [] });
    vi.stubGlobal("fetch", f);
    const res = ownerResult();
    const r = await verifyOwnerProof(live("owner", res), SIGNAL);
    expect(r).toEqual({ ok: true, humanId: SESSION });
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://developer.world.org/api/v4/verify/rp_test");
    expect(init.method).toBe("POST");
    const body = JSON.parse(String(init.body));
    expect(body.environment).toBe("staging");
    expect(body.session_id).toBe(SESSION);
    expect(body.responses[0].identifier).toBe("selfie");
  });

  it("owner: signal mismatch (proof for another action) is refused without calling the verifier", async () => {
    const f = okFetch(); vi.stubGlobal("fetch", f);
    const r = await verifyOwnerProof(live("owner", ownerResult("iigs|disarm|seal1||1")), SIGNAL);
    expect(r).toMatchObject({ ok: false, code: "signal_mismatch" });
    expect(f).not.toHaveBeenCalled();
  });

  it("owner: wrong environment, wrong credential, wrong shape", async () => {
    vi.stubGlobal("fetch", okFetch());
    expect(await verifyOwnerProof(live("owner", ownerResult(SIGNAL, { environment: "production" })), SIGNAL)).toMatchObject({ code: "wrong_environment" });
    const r = ownerResult(); (r.responses[0] as Record<string, unknown>).identifier = "proof_of_human"; (r.responses[0] as Record<string, unknown>).issuer_schema_id = 1;
    expect(await verifyOwnerProof(live("owner", r), SIGNAL)).toMatchObject({ code: "credential_unavailable" });
    expect(await verifyOwnerProof(live("owner", ownerResult(SIGNAL, { session_id: undefined, action: "iigs-owner" })), SIGNAL)).toMatchObject({ code: "wrong_proof_type" });
    expect(await verifyOwnerProof(live("owner", "junk"), SIGNAL)).toMatchObject({ code: "bad_proof" });
  });

  it("owner: replayed proof is refused", async () => {
    vi.stubGlobal("fetch", okFetch());
    const res = ownerResult();
    expect((await verifyOwnerProof(live("owner", res), SIGNAL)).ok).toBe(true);
    expect(await verifyOwnerProof(live("owner", res), SIGNAL)).toMatchObject({ code: "replayed_proof" });
  });

  it("owner: sybil threshold", async () => {
    process.env.WORLD_MAX_SYBIL_SCORE = "0";
    vi.stubGlobal("fetch", okFetch());
    expect(await verifyOwnerProof(live("owner", ownerResult()), SIGNAL)).toMatchObject({ code: "sybil_score_too_high" });
  });

  it("maps verifier failures", async () => {
    vi.stubGlobal("fetch", okFetch({ success: false, code: "all_verifications_failed", detail: "All proof verifications failed." }, 400));
    expect(await verifyOwnerProof(live("owner", ownerResult()), SIGNAL)).toMatchObject({ ok: false, code: "verification_failed" });
    vi.stubGlobal("fetch", okFetch({ success: false, code: "all_verifications_failed", detail: "x", results: [{ identifier: "selfie", success: false, code: "max_verifications_reached", detail: "limit" }] }, 400));
    expect(await verifyOwnerProof(live("owner", ownerResult()), SIGNAL)).toMatchObject({ code: "max_verifications" });
    vi.stubGlobal("fetch", okFetch({ success: false, code: "app_not_migrated", detail: "nope" }, 400));
    expect(await verifyOwnerProof(live("owner", ownerResult()), SIGNAL)).toMatchObject({ code: "config_error" });
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("offline"); }));
    expect(await verifyOwnerProof(live("owner", ownerResult()), SIGNAL)).toMatchObject({ code: "verify_unreachable" });
  });

  it("a failed verification does not burn the nonce (retry allowed)", async () => {
    const res = ownerResult();
    vi.stubGlobal("fetch", okFetch({ success: false, code: "x", detail: "y" }, 400));
    expect((await verifyOwnerProof(live("owner", res), SIGNAL)).ok).toBe(false);
    vi.stubGlobal("fetch", okFetch());
    expect((await verifyOwnerProof(live("owner", res), SIGNAL)).ok).toBe(true);
  });

  const RSIGNAL = "iigs|reader|nonce|1700";
  const readerResult = (over: Record<string, unknown> = {}) => ({
    protocol_version: "4.0", nonce: "0xr" + ++n, action: "iigs-reader", environment: "staging", identity_attested: true,
    responses: [{ identifier: "passport", issuer_schema_id: 9303, signal_hash: hashSignal(RSIGNAL), proof: ["1", "2", "3", "4", "5"], nullifier: "0x10", expires_at_min: 1 }],
    ...over,
  });

  it("reader: attested nationality passes; humanId from nullifier", async () => {
    const f = okFetch(); vi.stubGlobal("fetch", f);
    const ctx = await createRpContext("reader", RSIGNAL, { nationality: "IN" });
    const r = await verifyReaderProof(live("reader", readerResult({ nonce: ctx!.nonce }), RSIGNAL, { nationality: "IN" }), RSIGNAL);
    expect(r).toEqual({ ok: true, humanId: "world:16", nationality: "IN" });
    expect(JSON.parse(String((f.mock.calls[0] as unknown as [string, RequestInit])[1].body)).action).toBe("iigs-reader");
  });

  it("reader: not attested / no claim -> nationality_unavailable; wrong action refused", async () => {
    vi.stubGlobal("fetch", okFetch());
    expect(await verifyReaderProof(live("reader", readerResult({ identity_attested: false }), RSIGNAL, { nationality: "IN" }), RSIGNAL)).toMatchObject({ code: "nationality_unavailable" });
    expect(await verifyReaderProof(live("reader", readerResult(), RSIGNAL), RSIGNAL)).toMatchObject({ code: "nationality_unavailable" });
    expect(await verifyReaderProof(live("reader", readerResult({ action: "iigs-owner" }), RSIGNAL, { nationality: "IN" }), RSIGNAL)).toMatchObject({ code: "wrong_proof_type" });
  });

  it("reader: unsigned signal falls back to issued-nonce binding", async () => {
    process.env.WORLD_MODE = "live";
    vi.stubGlobal("fetch", okFetch());
    const ctx = await createRpContext("reader", RSIGNAL, { nationality: "IN" });
    const res = readerResult({ nonce: ctx!.nonce });
    (res.responses[0] as Record<string, unknown>).signal_hash = "0x0";
    expect((await verifyReaderProof(live("reader", res, RSIGNAL, { nationality: "IN" }), RSIGNAL)).ok).toBe(true);
    const res2 = readerResult(); (res2.responses[0] as Record<string, unknown>).signal_hash = "0x0";
    expect(await verifyReaderProof(live("reader", res2, RSIGNAL, { nationality: "IN" }), RSIGNAL)).toMatchObject({ code: "signal_mismatch" });
  });

  it("reader nationality is bound to the issued request: prove one nationality, claim another -> nationality_mismatch", async () => {
    vi.stubGlobal("fetch", okFetch());
    const us = await createRpContext("reader", RSIGNAL, { nationality: "US" });
    expect(await verifyReaderProof(live("reader", readerResult({ nonce: us!.nonce }), RSIGNAL, { nationality: "IN" }), RSIGNAL)).toMatchObject({ code: "nationality_mismatch" });
  });
  it("reader: a nonce we never issued -> refused", async () => {
    vi.stubGlobal("fetch", okFetch());
    expect((await verifyReaderProof(live("reader", readerResult(), RSIGNAL, { nationality: "IN" }), RSIGNAL)).ok).toBe(false);
  });
});

describe("createRpContext", () => {
  it("mock -> null", async () => { expect(await createRpContext("owner", SIGNAL)).toBeNull(); });
  it("live -> signed rp_context (owner has no action, reader does)", async () => {
    setEnv("live");
    const o = await createRpContext("owner", SIGNAL);
    const r = await createRpContext("reader", SIGNAL);
    for (const c of [o, r]) {
      expect(c).toMatchObject({ rp_id: "rp_test" });
      expect(c!.signature).toMatch(/^0x[0-9a-f]{130}$/);
      expect(c!.nonce).toMatch(/^0x[0-9a-f]{64}$/);
      expect(c!.expires_at).toBeGreaterThan(c!.created_at);
    }
    expect(o!.signature).not.toBe(r!.signature);
  });
  it("live without key throws", async () => {
    setEnv("live"); process.env.WORLD_SIGNING_KEY = "";
    await expect(createRpContext("owner", SIGNAL)).rejects.toThrow(/WORLD_SIGNING_KEY/);
  });
});
