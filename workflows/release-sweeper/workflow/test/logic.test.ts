import { describe, expect, test } from "bun:test";
import fx from "./fixtures.json";
import { buildQuery, buildRequestBody, decodeAttr, parseQueryResponse, SCHEMA, SELECT_ATTRS } from "../src/arkiv";
import { hexToBytes } from "../src/bytes";
import { unwrapKey } from "../src/crypto";
import { decideRelease } from "../src/release";
import { encodeReleaseReport } from "../src/report";
import { buildItems, buildSnapshot, pickBatch, planSweep } from "../src/sweep";

const V = "0xF87fC983a8D75c67cdF4E0f80b1507a74A21fBD8";
const M = "0x9b95d050D551C8836578f32d92508467E7dA1638";

describe("query building (matches what @arkiv-network/sdk sends)", () => {
  test("query string", () => {
    expect(buildQuery(SCHEMA.seal, "dev", V)).toBe(`arkiv.schema = str('iigs.seal') AND dep = str('dev') AND $owner = addr(${V})`);
    expect(buildQuery(SCHEMA.release, "dev", M)).toContain("iigs.release");
  });
  test("injection is rejected", () => {
    expect(() => buildQuery(SCHEMA.seal, "dev') OR (1=1", V)).toThrow();
    expect(() => buildQuery(SCHEMA.seal, "dev", "0x12")).toThrow();
    expect(() => buildQuery(SCHEMA.seal, "dev", V, "x') OR ('a'='a")).toThrow();
  });
  test("request body: no cipherInline, hex paging", () => {
    const b = JSON.parse(buildRequestBody(buildQuery(SCHEMA.seal, "dev", V), SELECT_ATTRS.seal, 100));
    expect(b.method).toBe("arkiv_query");
    expect(b.params[1].limit).toBe("0x64");
    expect(b.params[1].offset).toBe("0x64");
    expect(b.params[1].select.attributes.cipherInline).toBeUndefined();
    expect(b.params[1].select.attributes.wrappedKeyEscrow).toBeUndefined();
    expect(b.params[1].select.attributes.sealId).toBe(true);
  });
});

describe("response parsing", () => {
  test("u64 hex, bytes hex, str", () => {
    const page = parseQueryResponse({
      jsonrpc: "2.0",
      id: 1,
      result: {
        blockNumber: "0x458a4",
        data: [
          {
            key: "0xabc",
            attributes: [
              { name: "sealId", type: "str", value: "s1" },
              { name: "releaseAt", type: "u64", value: "0x6720a3c0" },
              { name: "intervalSec", type: "u64", value: "0x0" },
              { name: "wrappedKeyEscrow", type: "bytes", value: "0xAABB" },
              { name: "arkiv.schema", type: "str", value: "iigs.seal" },
            ],
          },
        ],
      },
    });
    expect(page.rows).toEqual([
      { $key: "0xabc", sealId: "s1", releaseAt: 0x6720a3c0, intervalSec: 0, wrappedKeyEscrow: "0xaabb", "arkiv.schema": "iigs.seal" },
    ]);
  });
  test("empty + errors", () => {
    expect(parseQueryResponse({ result: { data: [], blockNumber: "0x1" } }).rows).toEqual([]);
    expect(() => parseQueryResponse({ error: { code: -32001, message: "bad" } })).toThrow(/-32001/);
    expect(() => parseQueryResponse({})).toThrow();
  });
  test("decodeAttr variants", () => {
    expect(decodeAttr("u64", 5)).toBe(5);
    expect(decodeAttr("u64", "12")).toBe(12);
    expect(() => decodeAttr("u64", "zz")).toThrow();
  });
});

describe("escrow unwrap — compatible with @iigs/core wrapKey", () => {
  const sk = hexToBytes(fx.escrowSecretKey);
  for (const [id, wrapped] of Object.entries(fx.wrapped)) {
    test(`unwraps ${id}`, () => {
      const k = unwrapKey(hexToBytes(wrapped), sk, id);
      expect("0x" + Buffer.from(k).toString("hex")).toBe((fx.keys as Record<string, string>)[id]!);
    });
  }
  test("tampering / wrong key fails", () => {
    const w = hexToBytes(Object.values(fx.wrapped)[0]!);
    w[60] ^= 1;
    const id0 = Object.keys(fx.wrapped)[0]!;
    expect(() => unwrapKey(w, sk, id0)).toThrow();
    expect(() => unwrapKey(hexToBytes(Object.values(fx.wrapped)[0]!), new Uint8Array(32).fill(7), id0)).toThrow();
    expect(() => unwrapKey(new Uint8Array(10), sk, id0)).toThrow(/wrong length/);
    // bound to its seal: the same wrapped key under another seal id is refused
    expect(() => unwrapKey(hexToBytes(Object.values(fx.wrapped)[0]!), sk, "some-other-seal")).toThrow();
  });
});

describe("report encoding equals @iigs/core encodeReleaseReport", () => {
  test("identical bytes", () => {
    expect(encodeReleaseReport(fx.items as never)).toBe(fx.expectedReport);
  });
});

// Mirrors packages/core/test/core.test.ts
describe("decideRelease (core fixtures)", () => {
  const base = { releaseAt: 0, intervalSec: 0, createdAt: 1000, disarmed: false, released: false, heartbeatAlive: true, now: 2000 };
  test("timer", () => {
    expect(decideRelease({ ...base, releaseAt: 2001 })).toEqual({ release: false, reason: "WAITING" });
    expect(decideRelease({ ...base, releaseAt: 2000 })).toEqual({ release: true, reason: "TIMER" });
  });
  test("heartbeat + grace", () => {
    expect(decideRelease({ ...base, intervalSec: 120 })).toEqual({ release: false, reason: "WAITING" });
    expect(decideRelease({ ...base, intervalSec: 120, heartbeatAlive: false })).toEqual({ release: true, reason: "HEARTBEAT" });
    expect(decideRelease({ ...base, intervalSec: 120, heartbeatAlive: false, createdAt: 1990 }).release).toBe(false);
    expect(decideRelease({ ...base, intervalSec: 120, heartbeatAlive: false, createdAt: 1980 }).release).toBe(true);
  });
  test("disarm and idempotency win", () => {
    expect(decideRelease({ ...base, releaseAt: 1, disarmed: true }).reason).toBe("DISARMED");
    expect(decideRelease({ ...base, releaseAt: 1, released: true }).reason).toBe("ALREADY_RELEASED");
  });
});

describe("sweep planning", () => {
  const NOW = 10_000;
  const seal = (id: string, o: Record<string, unknown>) => ({ sealId: id, kind: "TIMER", audience: "PUBLIC", releaseAt: 0, intervalSec: 0, createdAt: 5000, ...o });
  const snap = buildSnapshot(
    [
      seal("timer-due", { releaseAt: NOW - 1 }),
      seal("timer-wait", { releaseAt: NOW + 83 }),
      seal("hb-dead", { kind: "HEARTBEAT", intervalSec: 60, audience: "GATED" }),
      seal("hb-alive", { kind: "HEARTBEAT", intervalSec: 60 }),
      seal("hb-grace", { kind: "HEARTBEAT", intervalSec: 60, createdAt: NOW - 5 }),
      seal("hb-stale-checkin", { kind: "HEARTBEAT", intervalSec: 60 }), // checkin row still indexed but expiresAtSec <= now
      seal("disarmed", { releaseAt: 1 }),
      seal("done", { releaseAt: 1 }),
    ],
    [
      { sealId: "hb-alive", expiresAtSec: NOW + 40 },
      { sealId: "hb-alive", expiresAtSec: NOW - 40 },
      { sealId: "hb-stale-checkin", expiresAtSec: NOW },
    ],
    [{ sealId: "disarmed" }],
    [{ sealId: "done" }],
  );
  const plans = Object.fromEntries(planSweep(snap, NOW).map((p) => [p.id, p]));
  test("decisions + log lines", () => {
    expect(plans["timer-due"]).toMatchObject({ release: true, reason: "TIMER", line: "seal timer-due: timer due → releasing (PUBLIC)" });
    expect(plans["timer-wait"]!.line).toBe("seal timer-wait: waiting (next deadline in 83s)");
    expect(plans["hb-dead"]).toMatchObject({ release: true, reason: "HEARTBEAT", line: "seal hb-dead: heartbeat dead → releasing (GATED)" });
    expect(plans["hb-alive"]!.release).toBe(false);
    expect(plans["hb-alive"]!.line).toBe("seal hb-alive: waiting (next deadline in 40s)");
    expect(plans["hb-grace"]!.release).toBe(false);
    expect(plans["hb-stale-checkin"]!.release).toBe(true); // check-in with expiresAtSec <= now is dropped
    expect(plans["disarmed"]!.line).toBe("seal disarmed: disarmed");
    expect(plans["done"]!.line).toBe("seal done: already released");
  });
  test("snapshot is deterministic & compact", () => {
    expect(snap.hb["hb-alive"]).toBe(NOW + 40);
    expect(snap.seals.map((s) => s.id)).toEqual([...snap.seals.map((s) => s.id)].sort());
  });
  test("buildItems: PUBLIC unwrapped, GATED empty, bad seal skipped, batch limit", () => {
    const p = (id: string, aud: "PUBLIC" | "GATED") => ({ id, audience: aud, release: true, reason: "TIMER", line: "" });
    const sk = hexToBytes(fx.escrowSecretKey);
    const r = buildItems(
      [p("seal-pub-1", "PUBLIC"), p("seal-gated-1", "GATED"), p("missing", "PUBLIC"), p("seal-pub-2", "PUBLIC")],
      fx.wrapped,
      sk,
      10,
    );
    expect(r.items).toEqual([
      { sealId: "seal-pub-1", gated: false, key: (fx.keys as Record<string, string>)["seal-pub-1"] },
      { sealId: "seal-gated-1", gated: true, key: "0x" },
      { sealId: "seal-pub-2", gated: false, key: (fx.keys as Record<string, string>)["seal-pub-2"] },
    ]);
    expect(r.errors.length).toBe(1);
    expect(buildItems([p("seal-pub-1", "PUBLIC"), p("seal-pub-2", "PUBLIC")], fx.wrapped, sk, 1).items.length).toBe(1);
  });
  test("pickBatch rotates: poisoned seals at the front cannot starve the rest", () => {
    const due = Array.from({ length: 25 }, (_, i) => `s${String(i).padStart(2, "0")}`);
    const seen = new Set<string>();
    for (let run = 0; run < 3; run++) for (const id of pickBatch(due, 1_700_000_000 + run * 30, 10)) seen.add(id);
    expect(seen.size).toBe(25); // ceil(25/10) = 3 runs cover everyone
    expect(pickBatch(due.slice(0, 4), 123, 10)).toEqual(due.slice(0, 4));
  });
  test("buildItems: a wrapped key copied from another seal is NOT released (bound to its seal)", () => {
    const p = (id: string) => ({ id, audience: "PUBLIC" as const, release: true, reason: "TIMER", line: "" });
    const sk = hexToBytes(fx.escrowSecretKey);
    const stolen = { "seal-pub-2": (fx.wrapped as Record<string, string>)["seal-pub-1"]! };
    const r = buildItems([p("seal-pub-2")], stolen, sk, 10);
    expect(r.items).toEqual([]);
    expect(r.errors[0]).toMatch(/cannot unwrap/);
  });
});
