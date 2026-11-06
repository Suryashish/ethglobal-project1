/** Sweep planner: Arkiv snapshot -> release report items. Pure (injected clock / chain check). */
import { decideRelease, fromHex, unwrapKey, type ReleaseItem, type SealState } from "@iigs/core";
import type { Hex } from "viem";

export const MAX_BATCH = 10;

export type SweepPlan = {
  items: ReleaseItem[];
  reasons: Record<string, "TIMER" | "HEARTBEAT">;
  skipped: { sealId: string; reason: string }[];
};

export function planSweep(
  states: SealState[],
  opts: { escrowSecretKey: Hex; now: number; isReleasedOnChain?: (sealId: string) => Promise<boolean> | boolean },
): Promise<SweepPlan> {
  return planAsync(states, opts);
}

async function planAsync(
  states: SealState[],
  opts: { escrowSecretKey: Hex; now: number; isReleasedOnChain?: (sealId: string) => Promise<boolean> | boolean },
): Promise<SweepPlan> {
  const plan: SweepPlan = { items: [], reasons: {}, skipped: [] };
  const sk = fromHex(opts.escrowSecretKey);
  for (const s of states) {
    const d = decideRelease({
      releaseAt: s.seal.releaseAt,
      intervalSec: s.seal.intervalSec,
      createdAt: s.seal.createdAt,
      disarmed: s.disarm !== null,
      released: s.release !== null,
      heartbeatAlive: s.checkins.length > 0,
      now: opts.now,
    });
    if (!d.release) continue;
    const id = s.seal.sealId;
    if (opts.isReleasedOnChain && (await opts.isReleasedOnChain(id))) {
      plan.skipped.push({ sealId: id, reason: "already released on-chain" });
      continue;
    }
    if (s.seal.audience === "GATED") {
      plan.items.push({ sealId: id, gated: true, key: "0x" });
    } else {
      try {
        const k = unwrapKey(s.seal.wrappedKeyEscrow, sk);
        plan.items.push({ sealId: id, gated: false, key: `0x${Buffer.from(k).toString("hex")}` });
      } catch (e) {
        plan.skipped.push({ sealId: id, reason: `cannot unwrap escrow key: ${(e as Error).message}` });
        continue;
      }
    }
    plan.reasons[id] = d.reason;
  }
  return plan;
}

export function batches<T>(xs: T[], n = MAX_BATCH): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < xs.length; i += n) out.push(xs.slice(i, i + n));
  return out;
}
