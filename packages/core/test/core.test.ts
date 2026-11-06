import { describe, expect, it } from "vitest";
import {
  computeStatus,
  createSeal,
  decideRelease,
  decodeReleaseReport,
  decryptContent,
  draftDigest,
  encodeReleaseReport,
  encryptContent,
  findSealIds,
  formatSealedPost,
  fromBase64,
  fromHex,
  generateContentKey,
  generateKeypair,
  isFresh,
  newSealId,
  openSeal,
  ownerSignal,
  parseSignal,
  toBase64,
  toBase64Url,
  toHex,
  unwrapKey,
  validateDraft,
  wrapKey,
} from "../src/index.js";

describe("bytes", () => {
  it("round-trips hex and base64", () => {
    for (let len = 0; len < 40; len++) {
      const b = crypto.getRandomValues(new Uint8Array(len));
      expect(fromHex(toHex(b))).toEqual(b);
      expect(fromBase64(toBase64(b))).toEqual(b);
      expect(fromBase64(toBase64Url(b))).toEqual(b);
      expect(toBase64(b)).toBe(Buffer.from(b).toString("base64"));
    }
  });
});

describe("crypto", () => {
  it("encrypts and decrypts, bound to sealId", () => {
    const k = generateContentKey();
    const ct = encryptContent(k, "aaaaaaaaaaaaaaaa", new TextEncoder().encode("hello"));
    expect(new TextDecoder().decode(decryptContent(k, "aaaaaaaaaaaaaaaa", ct))).toBe("hello");
    expect(() => decryptContent(k, "bbbbbbbbbbbbbbbb", ct)).toThrow();
    expect(() => decryptContent(generateContentKey(), "aaaaaaaaaaaaaaaa", ct)).toThrow();
  });
  it("wraps and unwraps K to an X25519 key", () => {
    const kp = generateKeypair();
    const k = generateContentKey();
    const w = wrapKey(k, kp.publicKey);
    expect(w.length).toBe(104);
    expect(unwrapKey(w, kp.secretKey)).toEqual(k);
    expect(() => unwrapKey(w, generateKeypair().secretKey)).toThrow();
    const tampered = w.slice();
    tampered[70]! ^= 1;
    expect(() => unwrapKey(tampered, kp.secretKey)).toThrow();
  });
});

describe("seal / open", () => {
  const escrow = generateKeypair();
  const gated = generateKeypair();
  it("text seal is inline, opens with the escrowed key", () => {
    const out = createSeal({
      content: { type: "text", text: "hello world 👋" },
      rule: { kind: "TIMER", releaseAt: 2_000_000_000 },
      audience: "PUBLIC",
      escrowPublicKey: escrow.publicKey,
      gatedPublicKey: gated.publicKey,
      source: "vault",
    });
    expect(out.needsSwarmUpload).toBe(false);
    expect(validateDraft(out.draft)).toBeNull();
    const k = unwrapKey(fromBase64(out.draft.wrappedKeyB64), escrow.secretKey);
    const env = openSeal({ sealId: out.draft.sealId, key: k, ciphertext: fromBase64(out.draft.cipherInlineB64!), contentHash: out.draft.contentHash });
    expect(env.header.kind).toBe("text");
    expect(new TextDecoder().decode(env.body)).toBe("hello world 👋");
  });
  it("file seal goes to swarm and is gated-wrapped", () => {
    const bytes = crypto.getRandomValues(new Uint8Array(20_000));
    const out = createSeal({
      content: { type: "file", name: "evidence.pdf", mime: "application/pdf", bytes },
      rule: { kind: "HEARTBEAT", intervalSec: 120 },
      audience: "GATED",
      countries: ["in", "MT", "IN", "x"],
      escrowPublicKey: escrow.publicKey,
      gatedPublicKey: gated.publicKey,
      source: "vault",
    });
    expect(out.needsSwarmUpload).toBe(true);
    expect(out.draft.countries).toEqual(["IN", "MT"]);
    expect(validateDraft(out.draft)).toBe("bad swarmRef (must be a plain 64-hex reference)");
    out.draft.swarmRef = "a".repeat(64);
    expect(validateDraft(out.draft)).toBeNull();
    expect(() => unwrapKey(fromBase64(out.draft.wrappedKeyB64), escrow.secretKey)).toThrow();
    const k = unwrapKey(fromBase64(out.draft.wrappedKeyB64), gated.secretKey);
    const env = openSeal({ sealId: out.draft.sealId, key: k, ciphertext: out.ciphertext, contentHash: out.draft.contentHash });
    expect(env.header).toEqual({ kind: "file", name: "evidence.pdf", mime: "application/pdf", size: 20_000 });
    expect(env.body).toEqual(bytes);
    expect(() => openSeal({ sealId: out.draft.sealId, key: k, ciphertext: out.ciphertext, contentHash: "0".repeat(64) })).toThrow();
  });
  it("digest changes when the rule changes", () => {
    const out = createSeal({
      content: { type: "text", text: "x" },
      rule: { kind: "BOTH", releaseAt: 2_000_000_000, intervalSec: 300 },
      audience: "PUBLIC",
      escrowPublicKey: escrow.publicKey,
      gatedPublicKey: gated.publicKey,
      source: "extension",
    });
    const d1 = draftDigest(out.draft);
    expect(draftDigest({ ...out.draft, intervalSec: 301 })).not.toBe(d1);
  });
});

describe("post format", () => {
  it("formats and finds tokens and links", () => {
    const id = newSealId();
    expect(id).toMatch(/^[0-9a-z]{16}$/);
    const post = formatSealedPost({ sealId: id, baseUrl: "https://iigs.app/", releaseAt: 1_800_000_000, countries: ["IN"] });
    expect(post).toContain(`https://iigs.app/s/${id}`);
    expect(post).toContain(`⟦IIGS:${id}⟧`);
    expect(findSealIds(post)).toEqual([id]);
    const id2 = newSealId();
    expect(findSealIds(`look https://x.y/s/${id2} and ⟦IIGS:${id}⟧`).sort()).toEqual([id, id2].sort());
    expect(findSealIds(`/s/${id}extra`)).toEqual([]);
  });
});

describe("release rule", () => {
  const base = { releaseAt: 0, intervalSec: 0, createdAt: 1000, disarmed: false, released: false, heartbeatAlive: true, now: 2000 };
  it("timer", () => {
    expect(decideRelease({ ...base, releaseAt: 2001 })).toEqual({ release: false, reason: "WAITING" });
    expect(decideRelease({ ...base, releaseAt: 2000 })).toEqual({ release: true, reason: "TIMER" });
  });
  it("heartbeat", () => {
    expect(decideRelease({ ...base, intervalSec: 120 })).toEqual({ release: false, reason: "WAITING" });
    expect(decideRelease({ ...base, intervalSec: 120, heartbeatAlive: false })).toEqual({ release: true, reason: "HEARTBEAT" });
    expect(decideRelease({ ...base, intervalSec: 120, heartbeatAlive: false, createdAt: 1990 }).release).toBe(false);
  });
  it("disarm and idempotency win", () => {
    expect(decideRelease({ ...base, releaseAt: 1, disarmed: true }).reason).toBe("DISARMED");
    expect(decideRelease({ ...base, releaseAt: 1, released: true }).reason).toBe("ALREADY_RELEASED");
  });
  it("status picks the earliest deadline", () => {
    const s = computeStatus({ releaseAt: 5000, intervalSec: 60, createdAt: 1000, disarmed: false, released: false, liveCheckinExpiries: [2050, 2100], now: 2000 });
    expect(s).toEqual({ status: "ARMED", nextDeadline: 2100, nextDeadlineRule: "HEARTBEAT" });
  });
});

describe("signals & report", () => {
  it("signals parse and expire", () => {
    const s = ownerSignal("checkin", "abc", 1000);
    expect(parseSignal(s)).toEqual({ kind: "checkin", subject: "abc", extra: "", issuedAt: 1000 });
    expect(isFresh(1000, 1100)).toBe(true);
    expect(isFresh(1000, 1000 + 601)).toBe(false);
  });
  it("report round-trips", () => {
    const items = [
      { sealId: "aaaaaaaaaaaaaaaa", gated: false, key: ("0x" + "11".repeat(32)) as `0x${string}` },
      { sealId: "bbbbbbbbbbbbbbbb", gated: true, key: "0x" as `0x${string}` },
    ];
    expect(decodeReleaseReport(encodeReleaseReport(items))).toEqual(items);
  });
});
