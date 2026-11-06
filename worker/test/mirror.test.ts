import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  cursorPath, eventToRelease, loadCursor, newMirrorState, saveCursor, syncOnce,
  type ChainReader, type MirrorDeps, type ReleaseLog, type ReleaseWrite,
} from "../src/mirror-core.js";

const KEY = `0x${"ab".repeat(32)}`;
const pub = (n: bigint, id: string, tx = "0xtx1"): ReleaseLog => ({
  eventName: "Released", args: { sealId: id, key: KEY }, transactionHash: tx, blockNumber: n,
});
const gated = (n: bigint, id: string): ReleaseLog => ({
  eventName: "ReleasedGated", args: { sealId: id }, transactionHash: "0xtx2", blockNumber: n,
});

function harness(logs: ReleaseLog[], head = 100n, opts: { failRanges?: (from: bigint, to: bigint) => boolean; existing?: string[]; writeFail?: number } = {}) {
  const written: ReleaseWrite[] = [];
  const calls: [bigint, bigint][] = [];
  let cursor: { nextBlock: number } | null = null;
  let wf = opts.writeFail ?? 0;
  const existing = new Set(opts.existing ?? []);
  const chain: ChainReader = {
    getBlockNumber: async () => head,
    getLogs: async (f, t) => {
      calls.push([f, t]);
      if (opts.failRanges?.(f, t)) throw new Error("query returned more than 10000 results");
      return logs.filter((l) => l.blockNumber >= f && l.blockNumber <= t);
    },
    getBlockTimestamp: async (n) => 1000 + Number(n),
  };
  const deps: MirrorDeps = {
    chain, log: () => {}, startBlock: 0, initialChunk: 50, minChunk: 5, retryBaseMs: 0, sleepFn: async () => {},
    arkiv: {
      has: async (id) => existing.has(id),
      write: async (r) => {
        if (wf-- > 0) throw new Error("no funds");
        written.push(r); existing.add(r.sealId);
        return { entityKey: "0xent", txHash: "0xat" };
      },
    },
    loadCursor: () => cursor, saveCursor: (c) => (cursor = c),
  };
  return { deps, written, calls, cursor: () => cursor };
}

describe("eventToRelease", () => {
  it("PUBLIC keeps key bytes", () => {
    const r = eventToRelease(pub(7n, "abc"), 1234);
    expect(r).toMatchObject({ sealId: "abc", gated: false, sepoliaTx: "0xtx1", reason: "cre", releasedAt: 1234 });
    expect(r.key).toHaveLength(32);
    expect(r.key![0]).toBe(0xab);
  });
  it("GATED has no key", () => {
    const r = eventToRelease(gated(7n, "abc"), 5);
    expect(r.gated).toBe(true);
    expect(r.key).toBeUndefined();
  });
});

describe("syncOnce", () => {
  it("writes events with block timestamps and persists cursor", async () => {
    const h = harness([pub(10n, "a"), gated(60n, "b")]);
    const r = await syncOnce(h.deps, newMirrorState(50));
    expect(r).toMatchObject({ written: 2, skipped: 0 });
    expect(h.written.map((w) => [w.sealId, w.gated, w.releasedAt])).toEqual([["a", false, 1010], ["b", true, 1060]]);
    expect(h.cursor()).toEqual({ nextBlock: 101 });
  });
  it("is idempotent: existing Arkiv release -> no write; rerun -> no double write", async () => {
    const h = harness([pub(10n, "a")], 100n, { existing: ["a"] });
    expect(await syncOnce(h.deps, newMirrorState(50))).toMatchObject({ written: 0, skipped: 1 });
    expect(h.written).toHaveLength(0);
    const h2 = harness([pub(10n, "z")]);
    const st = newMirrorState(50);
    await syncOnce(h2.deps, st);
    h2.deps.saveCursor({ nextBlock: 0 }); // simulate cursor loss
    await syncOnce(h2.deps, st);
    expect(h2.written).toHaveLength(1);
  });
  it("resumes from cursor", async () => {
    const h = harness([pub(10n, "a")]);
    h.deps.saveCursor({ nextBlock: 90 });
    await syncOnce(h.deps, newMirrorState(50));
    expect(h.calls[0]![0]).toBe(90n);
    expect(h.written).toHaveLength(0);
  });
  it("shrinks chunk on RPC range errors", async () => {
    const h = harness([pub(10n, "a")], 100n, { failRanges: (f, t) => t - f + 1n > 12n });
    const st = newMirrorState(50);
    const r = await syncOnce(h.deps, st);
    expect(r.written).toBe(1);
    expect(h.calls.some(([f, t]) => t - f + 1n > 12n)).toBe(true);
    expect(h.calls.filter(([f, t]) => t - f + 1n <= 12n).length).toBeGreaterThan(3);
  });
  it("throws if even the minimum chunk fails; cursor not advanced", async () => {
    const h = harness([], 100n, { failRanges: () => true });
    await expect(syncOnce(h.deps, newMirrorState(50))).rejects.toThrow();
    expect(h.cursor()).toBeNull();
  });
  it("retries a failing Arkiv write", async () => {
    const h = harness([pub(10n, "a")], 100n, { writeFail: 2 });
    expect((await syncOnce(h.deps, newMirrorState(50))).written).toBe(1);
  });
  it("write failing past retries keeps cursor so next pass retries", async () => {
    const h = harness([pub(10n, "a")], 100n, { writeFail: 99 });
    await expect(syncOnce(h.deps, newMirrorState(50))).rejects.toThrow();
    expect(h.cursor()).toBeNull();
  });
});

describe("cursor persistence", () => {
  it("round-trips and tolerates garbage", () => {
    const dir = mkdtempSync(join(tmpdir(), "iigs-"));
    const p = cursorPath(dir, 11155111, "0xABC");
    expect(p.endsWith("mirror-11155111-0xabc.json")).toBe(true);
    expect(loadCursor(p)).toBeNull();
    saveCursor(p, { nextBlock: 42 });
    expect(loadCursor(p)).toEqual({ nextBlock: 42 });
  });
});
