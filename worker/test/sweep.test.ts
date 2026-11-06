import { decodeReleaseReport, encodeReleaseReport, toHex } from "@iigs/core";
import { describe, expect, it } from "vitest";
import { batches, planSweep } from "../src/sweep-core.js";
import { NOW, escrowSk, seal } from "./fixtures.js";

describe("planSweep", () => {
  it("timer due -> PUBLIC release with exact unwrapped K; report round-trips", async () => {
    const a = seal({ id: "aaaaaaaaaaaaaaaa", releaseAt: NOW - 5 });
    const plan = await planSweep([a.state], { escrowSecretKey: escrowSk, now: NOW });
    expect(plan.items).toHaveLength(1);
    expect(plan.items[0]!.key).toBe(`0x${toHex(a.key)}`);
    expect(plan.reasons["aaaaaaaaaaaaaaaa"]).toBe("TIMER");
    const back = decodeReleaseReport(encodeReleaseReport(plan.items));
    expect(back).toEqual(plan.items);
  });
  it("gated timer -> gated item with empty key", async () => {
    const a = seal({ id: "gggggggggggggggg", releaseAt: NOW - 5, audience: "GATED" });
    const plan = await planSweep([a.state], { escrowSecretKey: escrowSk, now: NOW });
    expect(plan.items).toEqual([{ sealId: "gggggggggggggggg", gated: true, key: "0x" }]);
  });
  it("heartbeat dead releases; alive does not; grace period does not", async () => {
    const dead = seal({ id: "dead000000000000", intervalSec: 60, alive: false });
    const alive = seal({ id: "alive00000000000", intervalSec: 60, alive: true });
    const grace = seal({ id: "grace00000000000", intervalSec: 60, alive: false, createdAt: NOW - 5 });
    const plan = await planSweep([dead.state, alive.state, grace.state], { escrowSecretKey: escrowSk, now: NOW });
    expect(plan.items.map((i) => i.sealId)).toEqual(["dead000000000000"]);
    expect(plan.reasons["dead000000000000"]).toBe("HEARTBEAT");
  });
  it("disarmed, released, and not-yet-due are ignored", async () => {
    const states = [
      seal({ id: "dis0000000000000", releaseAt: NOW - 1, disarmed: true }).state,
      seal({ id: "rel0000000000000", releaseAt: NOW - 1, released: true }).state,
      seal({ id: "wait000000000000", releaseAt: NOW + 100 }).state,
    ];
    expect((await planSweep(states, { escrowSecretKey: escrowSk, now: NOW })).items).toEqual([]);
  });
  it("skips ids already released on-chain", async () => {
    const a = seal({ id: "chain00000000000", releaseAt: NOW - 1 });
    const plan = await planSweep([a.state], { escrowSecretKey: escrowSk, now: NOW, isReleasedOnChain: () => true });
    expect(plan.items).toEqual([]);
    expect(plan.skipped[0]!.reason).toMatch(/on-chain/);
  });
  it("bad wrapped key is skipped, not fatal", async () => {
    const a = seal({ id: "bad0000000000000", releaseAt: NOW - 1 });
    const b = seal({ id: "good000000000000", releaseAt: NOW - 1 });
    a.state.seal.wrappedKeyEscrow = new Uint8Array(104);
    const plan = await planSweep([a.state, b.state], { escrowSecretKey: escrowSk, now: NOW });
    expect(plan.items.map((i) => i.sealId)).toEqual(["good000000000000"]);
    expect(plan.skipped).toHaveLength(1);
  });
  it("batches at 10", () => {
    expect(batches(Array.from({ length: 23 }, (_, i) => i)).map((b) => b.length)).toEqual([10, 10, 3]);
  });
});
