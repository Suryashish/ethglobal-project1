import { describe, expect, it } from "vitest";
import {
  createSeal, formatSealedPost, fromHex, generateKeypair, toBase64, toHex, unwrapKey, fromBase64, validateDraft, type SealDraft,
} from "@iigs/core";
import { scanRoot } from "../lib/scan";
import { selectCard, sealedLine } from "../lib/card";
import { expiresAtMs, formatCountdown } from "../lib/format";
import { decodeDraft, encodeDraft } from "../lib/draft";
import { decryptFromB64 } from "../lib/decrypt";
import { buildCard } from "../lib/cardView";
import { buildDraft, InlineTooLongError } from "../lib/compose";
import { normalizeConfig, normalizeStates, type WireState } from "../lib/wire";

const ID = "abcd1234efgh5678";
const ID2 = "zzzz0000yyyy1111";
const post = (id: string) => formatSealedPost({ sealId: id, baseUrl: "http://localhost:3000", releaseAt: 1800000000, countries: ["IN"] });

describe("scan", () => {
  it("finds ids in X-like tweets (token + link href), ignores others", () => {
    document.body.innerHTML = `
      <article><div data-testid="tweetText"><span>${post(ID)}</span></div></article>
      <article><div data-testid="tweetText"><span>hello world</span></div></article>
      <article><div data-testid="tweetText"><span>see </span><a href="https://t.co/x" title="http://localhost:3000/s/${ID2}">localhost:3000/s/zzzz…</a></div></article>`;
    const f = scanRoot(document);
    expect(f.map((x) => x.ids)).toEqual([[ID], [ID2]]);
  });
  it("finds ids in Reddit-like bodies and generic article fallback", () => {
    document.body.innerHTML = `
      <shreddit-post><div slot="text-body"><p>${post(ID)}</p></div></shreddit-post>
      <article><section><span>Some site post text. ⟦IIGS:${ID2}⟧ more</span></section></article>`;
    const f = scanRoot(document);
    expect(f.length).toBe(2);
    expect(f[0]!.ids).toEqual([ID]);
    expect(f[1]!.ids).toEqual([ID2]);
  });
  it("skips marked nodes and does not double-match nested containers", () => {
    document.body.innerHTML = `<div slot="text-body"><div class="md">${post(ID)}</div></div>`;
    const f1 = scanRoot(document);
    expect(f1.length).toBe(2); // before marking, both match
    f1[0]!.el.setAttribute("data-iigs-mark", ID);
    expect(scanRoot(document).length).toBe(0);
  });
});

const base = (over: Omit<Partial<WireState>, "seal"> & { seal?: Partial<WireState["seal"]> } = {}): WireState => ({
  seal: { sealId: ID, kind: "TIMER", releaseAt: 2000, intervalSec: 0, audience: "PUBLIC", countries: [], contentType: "inline", ...over.seal },
  status: "ARMED", disarm: null, release: null, checkins: [], nextDeadline: 2000, nextDeadlineRule: "TIMER", ...over,
}) as WireState;

describe("card state selection", () => {
  const now = 1000;
  it("sealed with countdown", () => {
    const m = selectCard(base(), now, null);
    expect(m).toMatchObject({ kind: "sealed", opensInSec: 1000 });
    expect(sealedLine(m as any, now)).toBe("Sealed · opens in 16m 40s");
  });
  it("deadline passed while ARMED → releasing", () => expect(selectCard(base(), 2001, null).kind).toBe("releasing"));
  it("RELEASING / DISARMED / missing", () => {
    expect(selectCard(base({ status: "RELEASING" }), now, null).kind).toBe("releasing");
    expect(selectCard(base({ status: "DISARMED" }), now, null).kind).toBe("cancelled");
    expect(selectCard(null, now, null).kind).toBe("missing");
  });
  it("released public vs gated (with/without reader token)", () => {
    expect(selectCard(base({ status: "RELEASED" }), now, null).kind).toBe("open-public");
    const g = base({ status: "RELEASED", seal: { audience: "GATED", countries: ["IN"] } });
    expect(selectCard(g, now, null)).toMatchObject({ kind: "open-gated", reader: "none" });
    const tok = { token: "t", nationality: "IN", expiresAtMs: 5_000_000 };
    expect(selectCard(g, now, tok)).toMatchObject({ kind: "open-gated", reader: "verified", nationality: "IN" });
    expect(selectCard(g, now, { ...tok, expiresAtMs: 500 })).toMatchObject({ reader: "none" });
  });
  it("armed gated shows countries on the sealed card", () => {
    expect(selectCard(base({ seal: { audience: "GATED", countries: ["IN", "MT"] } }), now, null)).toMatchObject({ kind: "sealed", gated: ["IN", "MT"] });
  });
  it("renders card DOM per kind", () => {
    const sealed = buildCard(document, ID, { model: selectCard(base({ seal: { audience: "GATED", countries: ["IN"] } }), now, null), now })!;
    expect(sealed.textContent).toContain("sealed by a verified human");
    expect(sealed.textContent).toContain("Visible to verified readers from 🇮🇳 IN");
    expect(buildCard(document, ID, { model: { kind: "cancelled" } })!.textContent).toContain("Cancelled by author — this will never open");
    expect(buildCard(document, ID, { model: { kind: "releasing", gated: [] } })!.textContent).toContain("releasing via Chainlink CRE");
    expect(buildCard(document, ID, { model: { kind: "missing" } })).toBeNull();
    let verified = 0;
    const gated = buildCard(document, ID, { model: { kind: "open-gated", countries: ["IN"], reader: "none" }, onVerify: () => verified++ })!;
    gated.querySelector("button")!.click();
    expect(verified).toBe(1);
    const denied = buildCard(document, ID, { model: { kind: "open-gated", countries: ["IN"], reader: "verified", nationality: "US" }, dec: { status: "denied" } })!;
    expect(denied.textContent).toContain("Not available in your country");
    const open = buildCard(document, ID, { model: { kind: "open-public" }, dec: { status: "ok", text: "<b>hi</b>" } })!;
    expect(open.querySelector(".plain")!.textContent).toBe("<b>hi</b>");
    expect(open.querySelector("b")).toBeNull();
  });
});

describe("format", () => {
  it("countdown", () => {
    expect(formatCountdown(3 * 86400 + 4 * 3600 + 59)).toBe("3d 4h");
    expect(formatCountdown(4 * 3600 + 5 * 60)).toBe("4h 5m");
    expect(formatCountdown(312)).toBe("5m 12s");
    expect(formatCountdown(42)).toBe("42s");
    expect(formatCountdown(0)).toBe("now");
    expect(formatCountdown(-5)).toBe("now");
  });
  it("expiresAt units", () => {
    expect(expiresAtMs(1_800_000_000)).toBe(1_800_000_000_000);
    expect(expiresAtMs(1_800_000_000_000)).toBe(1_800_000_000_000);
  });
});

describe("compose + handoff + decrypt", () => {
  const escrow = generateKeypair();
  const gated = generateKeypair();
  const cfg = { escrowPublicKey: toHex(escrow.publicKey), gatedPublicKey: toHex(gated.publicKey) };

  it("draft base64url round-trip is identical and valid", () => {
    const d = buildDraft({ text: "héllo 🔒 wörld", releaseAt: Math.floor(Date.now() / 1000) + 300, heartbeatSec: 120, countries: ["in", "MT"] }, cfg);
    expect(validateDraft(d)).toBeNull();
    expect(d).toMatchObject({ kind: "BOTH", audience: "GATED", countries: ["IN", "MT"], source: "extension", contentType: "inline" });
    const enc = encodeDraft(d);
    expect(enc).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(decodeDraft(enc)).toEqual(d);
  });
  it("timer public draft; long text is rejected for inline", () => {
    const d = buildDraft({ text: "x", releaseAt: Math.floor(Date.now() / 1000) + 120, heartbeatSec: 0, countries: [] }, cfg);
    expect(d).toMatchObject({ kind: "TIMER", audience: "PUBLIC", countries: [], intervalSec: 0 });
    expect(() => buildDraft({ text: "a".repeat(9000), releaseAt: 2e9, heartbeatSec: 0, countries: [] }, cfg)).toThrow(InlineTooLongError);
    expect(() => buildDraft({ text: "  ", releaseAt: 2e9, heartbeatSec: 0, countries: [] }, cfg)).toThrow();
  });
  it("decrypts a released PUBLIC seal using escrow-unwrapped key", () => {
    const out = createSeal({
      source: "extension", content: { type: "text", text: "the secret ✨" }, rule: { kind: "TIMER", releaseAt: 2e9 },
      audience: "PUBLIC", escrowPublicKey: escrow.publicKey, gatedPublicKey: gated.publicKey,
    });
    const key = unwrapKey(fromBase64(out.draft.wrappedKeyB64), escrow.secretKey);
    const d = decryptFromB64(out.draft.sealId, toBase64(key), out.draft.cipherInlineB64!, out.draft.contentHash);
    expect(d).toEqual({ kind: "text", text: "the secret ✨" });
    expect(() => decryptFromB64(out.draft.sealId, toBase64(key), out.draft.cipherInlineB64!, "0".repeat(64))).toThrow();
  });
  it("decrypts a GATED seal via the gated key", () => {
    const out = createSeal({
      source: "extension", content: { type: "text", text: "for India" }, rule: { kind: "TIMER", releaseAt: 2e9 },
      audience: "GATED", countries: ["IN"], escrowPublicKey: escrow.publicKey, gatedPublicKey: gated.publicKey,
    });
    const key = unwrapKey(fromBase64(out.draft.wrappedKeyB64), gated.secretKey);
    expect(decryptFromB64(out.draft.sealId, toBase64(key), out.draft.cipherInlineB64!)).toEqual({ kind: "text", text: "for India" });
    void fromHex;
  });
});

describe("wire normalizers", () => {
  it("states: map, wrapped and array forms", () => {
    const s = base();
    expect(normalizeStates({ states: { [ID]: s } }, [ID, ID2])).toEqual({ [ID]: s, [ID2]: null });
    expect(normalizeStates({ [ID]: s }, [ID])[ID]).toBe(s);
    expect(normalizeStates([s], [ID])[ID]).toBe(s);
  });
  it("config: tolerant key names", () => {
    const c = normalizeConfig({ baseUrl: "http://x", keys: { ESCROW_PUBLIC_KEY: "aa", gatedPublicKey: "bb" }, swarmGateway: "https://g/" });
    expect(c).toMatchObject({ escrowPublicKey: "aa", gatedPublicKey: "bb", swarmGateway: "https://g" });
    expect(() => normalizeConfig({})).toThrow();
  });
});
