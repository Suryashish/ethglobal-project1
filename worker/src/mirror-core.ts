/** Pure / injectable mirror logic: Sepolia release events -> Arkiv iigs.release entities. */
import { fromHex } from "@iigs/core";
import { mkdirSync, readFileSync, renameSync, writeFileSync, existsSync } from "node:fs";
import { dirname } from "node:path";
import { errMsg, retry, type Logger } from "./log.js";

export type ReleaseLog = {
  eventName: "Released" | "ReleasedGated";
  args: { idHash?: string; sealId: string; key?: string };
  transactionHash: string;
  blockNumber: bigint;
  logIndex?: number;
};

export type ReleaseWrite = {
  sealId: string;
  key?: Uint8Array;
  gated: boolean;
  sepoliaTx: string;
  reason: string;
  releasedAt: number;
};

/** Maps a decoded contract log to the arguments of core's writeRelease. */
export function eventToRelease(log: ReleaseLog, blockTimestamp: number): ReleaseWrite {
  const base = { sealId: log.args.sealId, sepoliaTx: log.transactionHash, reason: "cre", releasedAt: blockTimestamp };
  if (log.eventName === "ReleasedGated") return { ...base, gated: true };
  const key = log.args.key && log.args.key !== "0x" ? fromHex(log.args.key) : undefined;
  return { ...base, gated: false, ...(key ? { key } : {}) };
}

// ---------------------------------------------------------------- cursor

export type Cursor = { nextBlock: number };

export function loadCursor(path: string): Cursor | null {
  try {
    if (!existsSync(path)) return null;
    const j = JSON.parse(readFileSync(path, "utf8"));
    return typeof j.nextBlock === "number" && j.nextBlock >= 0 ? { nextBlock: j.nextBlock } : null;
  } catch {
    return null;
  }
}

export function saveCursor(path: string, c: Cursor): void {
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.tmp`;
  writeFileSync(tmp, JSON.stringify(c));
  renameSync(tmp, path);
}

export function cursorPath(stateDir: string, chainId: number, address: string): string {
  return `${stateDir}/mirror-${chainId}-${address.toLowerCase()}.json`;
}

// ---------------------------------------------------------------- backfill

export type ChainReader = {
  getBlockNumber(): Promise<bigint>;
  getLogs(from: bigint, to: bigint): Promise<ReleaseLog[]>;
  getBlockTimestamp(block: bigint): Promise<number>;
};

export type ArkivSink = {
  has(sealId: string): Promise<boolean>;
  write(r: ReleaseWrite): Promise<{ entityKey: string; txHash: string }>;
};

export type MirrorDeps = {
  chain: ChainReader;
  arkiv: ArkivSink;
  log: Logger;
  warn?: Logger;
  loadCursor(): Cursor | null;
  saveCursor(c: Cursor): void;
  startBlock: number;
  initialChunk?: number;
  minChunk?: number;
  sleepFn?: (ms: number) => Promise<unknown>;
  retryBaseMs?: number;
};

export type MirrorState = { chunk: number; mirrored: Set<string> };

export function newMirrorState(initialChunk = 5000): MirrorState {
  return { chunk: initialChunk, mirrored: new Set() };
}

const short = (s: string) => (s.length > 10 ? `${s.slice(0, 8)}…` : s);

/** Mirrors one log. Returns "written" or "skipped" (already in Arkiv). Throws after retries. */
export async function mirrorEvent(deps: MirrorDeps, st: MirrorState, log: ReleaseLog, ts: number) {
  const rec = eventToRelease(log, ts);
  if (st.mirrored.has(rec.sealId) || (await deps.arkiv.has(rec.sealId))) {
    st.mirrored.add(rec.sealId);
    deps.log(`[mirror] ${short(rec.sealId)} already mirrored in Arkiv, skipping`);
    return "skipped" as const;
  }
  const res = await retry(() => deps.arkiv.write(rec), {
    attempts: 3,
    baseMs: deps.retryBaseMs ?? 1500,
    ...(deps.sleepFn ? { sleepFn: deps.sleepFn } : {}),
    onRetry: (e, n) => (deps.warn ?? deps.log)(`[mirror] Arkiv write failed (try ${n}): ${errMsg(e)}`),
  });
  st.mirrored.add(rec.sealId);
  deps.log(
    `[mirror] ${log.eventName} ${short(rec.sealId)} → Arkiv iigs.release ${res.entityKey} (tx ${log.transactionHash})`,
  );
  return "written" as const;
}

/**
 * One sync pass: scans [cursor|startBlock, head] in chunks (shrinking on RPC errors, growing back after
 * successes), mirrors each event, advancing + persisting the cursor after each fully-handled chunk.
 * Throws if a chunk cannot be completed (cursor stays put so the next pass retries it).
 */
export async function syncOnce(deps: MirrorDeps, st: MirrorState): Promise<{ written: number; skipped: number; head: bigint }> {
  const sl = deps.sleepFn;
  const head = await retry(() => deps.chain.getBlockNumber(), { attempts: 3, baseMs: deps.retryBaseMs ?? 1000, ...(sl ? { sleepFn: sl } : {}) });
  const cur = deps.loadCursor();
  let from = BigInt(Math.max(deps.startBlock, cur?.nextBlock ?? 0));
  const minChunk = deps.minChunk ?? 10;
  const maxChunk = deps.initialChunk ?? 5000;
  let written = 0;
  let skipped = 0;
  const tsCache = new Map<bigint, number>();

  while (from <= head) {
    const to = from + BigInt(st.chunk) - 1n > head ? head : from + BigInt(st.chunk) - 1n;
    let logs: ReleaseLog[];
    try {
      logs = await deps.chain.getLogs(from, to);
    } catch (e) {
      if (st.chunk > minChunk) {
        st.chunk = Math.max(minChunk, Math.floor(st.chunk / 2));
        (deps.warn ?? deps.log)(`[mirror] getLogs ${from}-${to} failed (${errMsg(e)}); shrinking chunk to ${st.chunk}`);
        continue;
      }
      throw e;
    }
    for (const l of logs) {
      let ts = tsCache.get(l.blockNumber);
      if (ts === undefined) {
        ts = await retry(() => deps.chain.getBlockTimestamp(l.blockNumber), { attempts: 3, baseMs: deps.retryBaseMs ?? 1000, ...(sl ? { sleepFn: sl } : {}) });
        tsCache.set(l.blockNumber, ts);
      }
      const r = await mirrorEvent(deps, st, l, ts);
      if (r === "written") written++;
      else skipped++;
    }
    from = to + 1n;
    deps.saveCursor({ nextBlock: Number(from) });
    if (st.chunk < maxChunk) st.chunk = Math.min(maxChunk, st.chunk * 2);
  }
  return { written, skipped, head };
}
