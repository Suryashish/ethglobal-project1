/** Pure sweep logic: compact snapshot assembly, per-seal decisions, report item construction. */
import { bytesToHex, hexToBytes } from "./bytes";
import { unwrapKey } from "./crypto";
import { decideRelease, HEARTBEAT_GRACE_SEC } from "./release";
import type { ReleaseItem } from "./report";

export type SealLite = { id: string; kind: string; aud: "PUBLIC" | "GATED"; rel: number; int: number; cr: number };

/** What the (node-mode) Arkiv fetch returns; small + deterministic so DON nodes reach identical consensus. */
export type Snapshot = {
  seals: SealLite[];
  /** sealId → max `expiresAtSec` over that seal's VERIFIER-owned check-ins. */
  hb: Record<string, number>;
  dis: string[];
  rel: string[];
};

type Row = Record<string, unknown>;
const str = (v: unknown) => (typeof v === "string" ? v : "");
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);

export function buildSnapshot(sealRows: Row[], checkinRows: Row[], disarmRows: Row[], releaseRows: Row[]): Snapshot {
  const seals = new Map<string, SealLite>();
  for (const r of sealRows) {
    const id = str(r.sealId);
    if (!id) continue;
    const s: SealLite = {
      id,
      kind: str(r.kind),
      aud: str(r.audience) === "GATED" ? "GATED" : "PUBLIC",
      rel: num(r.releaseAt),
      int: num(r.intervalSec),
      cr: num(r.createdAt),
    };
    // duplicates: keep the earliest createdAt (deterministic)
    const prev = seals.get(id);
    if (!prev || s.cr < prev.cr) seals.set(id, s);
  }
  const hb: Record<string, number> = {};
  for (const r of checkinRows) {
    const id = str(r.sealId);
    if (!id) continue;
    hb[id] = Math.max(hb[id] ?? 0, num(r.expiresAtSec));
  }
  const ids = (rows: Row[]) => [...new Set(rows.map((r) => str(r.sealId)).filter(Boolean))].sort();
  return {
    seals: [...seals.values()].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)),
    hb: Object.fromEntries(Object.keys(hb).sort().map((k) => [k, hb[k]!])),
    dis: ids(disarmRows),
    rel: ids(releaseRows),
  };
}

export type SealPlan = {
  id: string;
  audience: "PUBLIC" | "GATED";
  release: boolean;
  /** "TIMER" | "HEARTBEAT" when release, else "WAITING" | "DISARMED" | "ALREADY_RELEASED" */
  reason: string;
  line: string;
};

export function planSweep(snap: Snapshot, now: number): SealPlan[] {
  const dis = new Set(snap.dis);
  const rel = new Set(snap.rel);
  return snap.seals.map((s): SealPlan => {
    // Arkiv expiry is block-granular: also ignore check-ins whose own deadline has passed.
    const expiry = snap.hb[s.id] ?? 0;
    const heartbeatAlive = expiry > now;
    const d = decideRelease({
      releaseAt: s.rel,
      intervalSec: s.int,
      createdAt: s.cr,
      disarmed: dis.has(s.id),
      released: rel.has(s.id),
      heartbeatAlive,
      now,
    });
    const p = (line: string): SealPlan => ({ id: s.id, audience: s.aud, release: d.release, reason: d.reason, line: `seal ${s.id}: ${line}` });
    if (d.release) {
      return p(d.reason === "TIMER" ? `timer due → releasing (${s.aud})` : `heartbeat dead → releasing (${s.aud})`);
    }
    if (d.reason === "DISARMED") return p("disarmed");
    if (d.reason === "ALREADY_RELEASED") return p("already released");
    const cands: number[] = [];
    if (s.rel > 0) cands.push(s.rel);
    if (s.int > 0) cands.push(heartbeatAlive ? expiry : s.cr + HEARTBEAT_GRACE_SEC);
    const next = cands.length ? Math.min(...cands) : null;
    return p(next === null ? "waiting" : `waiting (next deadline in ${Math.max(0, next - now)}s)`);
  });
}

/**
 * Which due seals this run handles. The window ROTATES with the 30 s cron tick, so seals that can never be
 * released (e.g. armed with a garbage wrapped key) cannot sit at the front forever and starve everyone else:
 * every due seal is attempted at least once every ceil(due / maxBatch) runs. Deterministic across DON nodes.
 */
export function pickBatch<T>(due: T[], now: number, maxBatch: number, tickSec = 30): T[] {
  if (due.length <= maxBatch) return due;
  const start = (Math.floor(now / tickSec) * maxBatch) % due.length;
  return [...due.slice(start), ...due.slice(0, start)].slice(0, maxBatch);
}

export type BuiltItems = { items: ReleaseItem[]; errors: string[] };

/**
 * Builds report items for the seals to release (first `maxBatch`).
 * PUBLIC → unwrap K from the escrow-wrapped key; GATED → empty key. A seal whose key cannot be unwrapped is
 * skipped (and reported in `errors`) so one bad seal never blocks the rest of the batch.
 */
export function buildItems(
  plans: SealPlan[],
  wrappedKeyHexById: Record<string, string>,
  escrowSecretKey: Uint8Array | null,
  maxBatch: number,
): BuiltItems {
  const items: ReleaseItem[] = [];
  const errors: string[] = [];
  for (const p of plans.filter((x) => x.release).slice(0, maxBatch)) {
    if (p.audience === "GATED") {
      items.push({ sealId: p.id, gated: true, key: "0x" });
      continue;
    }
    try {
      const w = wrappedKeyHexById[p.id];
      if (!w) throw new Error("no wrappedKeyEscrow found");
      if (!escrowSecretKey) throw new Error("escrow secret not available");
      const k = unwrapKey(hexToBytes(w), escrowSecretKey, p.id);
      items.push({ sealId: p.id, gated: false, key: `0x${bytesToHex(k)}` });
    } catch (e) {
      errors.push(`seal ${p.id}: cannot unwrap content key (${e instanceof Error ? e.message : String(e)}) — skipped`);
    }
  }
  return { items, errors };
}
