/** Release mirror: Sepolia SilentRelease events -> Arkiv iigs.release. Replaceable: anyone can run it. */
import { SILENT_RELEASE_ABI } from "@iigs/core";
import { arkivPublicClient, arkivWalletClient, getRelease, writeRelease, type ArkivConfig } from "@iigs/core/arkiv";
import { createPublicClient, http, type Address } from "viem";
import { loadMirrorConfig, WORKER_DIR, type MirrorConfig } from "./config.js";
import { errMsg, makeLogger, sleep } from "./log.js";
import {
  cursorPath,
  loadCursor,
  newMirrorState,
  saveCursor,
  syncOnce,
  type ChainReader,
  type ArkivSink,
  type MirrorDeps,
  type ReleaseLog,
} from "./mirror-core.js";

const EVENTS = SILENT_RELEASE_ABI.filter((x) => x.type === "event");

export function viemChainReader(rpcUrl: string, address: Address): ChainReader {
  const client = createPublicClient({ transport: http(rpcUrl, { retryCount: 2 }) });
  return {
    getBlockNumber: () => client.getBlockNumber(),
    async getLogs(from, to) {
      const logs = await client.getLogs({ address, events: EVENTS, fromBlock: from, toBlock: to, strict: true });
      return logs.map((l) => ({
        eventName: l.eventName,
        args: l.args as ReleaseLog["args"],
        transactionHash: l.transactionHash,
        blockNumber: l.blockNumber,
        logIndex: l.logIndex,
      }));
    },
    async getBlockTimestamp(n) {
      return Number((await client.getBlock({ blockNumber: n })).timestamp);
    },
  };
}

export function arkivCfg(c: MirrorConfig): ArkivConfig {
  return { ...c.arkiv };
}

export function realArkivSink(c: MirrorConfig, log: (m: string) => void): ArkivSink & { balance(): Promise<bigint> } {
  const cfg = arkivCfg(c);
  const pub = arkivPublicClient(cfg);
  const wallet = arkivWalletClient(cfg, c.mirrorPrivateKey);
  return {
    has: async (sealId) => (await getRelease(pub, cfg, sealId)) !== null,
    async write(r) {
      try {
        return await writeRelease(wallet, cfg, r);
      } catch (e) {
        const bal = await pub.getBalance({ address: c.arkiv.mirror }).catch(() => null);
        if (bal === 0n) {
          log(`[mirror] ACTION NEEDED: MIRROR wallet ${c.arkiv.mirror} has 0 tGLM on Arkiv Rabdi — fund it from the Arkiv faucet; retrying.`);
        }
        throw e;
      }
    },
    balance: () => pub.getBalance({ address: c.arkiv.mirror }),
  };
}

export async function main() {
  const L = makeLogger("mirror");
  const cfg = loadMirrorConfig();
  const sink = realArkivSink(cfg, L.error);
  const path = cursorPath(`${WORKER_DIR}/.state`, cfg.chain.chainId, cfg.chain.releaseAddress);
  const deps: MirrorDeps = {
    chain: viemChainReader(cfg.chain.rpcUrl, cfg.chain.releaseAddress),
    arkiv: sink,
    log: L.info,
    warn: L.warn,
    loadCursor: () => loadCursor(path),
    saveCursor: (c) => saveCursor(path, c),
    startBlock: cfg.startBlock,
    // Public load-balanced RPCs (e.g. publicnode) reject getLogs at the very head; stay 2 blocks behind on real chains.
    confirmations: Number(process.env.MIRROR_CONFIRMATIONS ?? (cfg.chain.chainId === 31337 ? 0 : 2)),
  };
  L.info(`watching ${cfg.chain.releaseAddress} on chain ${cfg.chain.chainId} from block ${cfg.startBlock} → Arkiv dep="${cfg.arkiv.dep}", mirror ${cfg.arkiv.mirror}`);
  try {
    const bal = await sink.balance();
    if (bal === 0n) L.error(`MIRROR wallet ${cfg.arkiv.mirror} has 0 tGLM on Arkiv — writes will fail until it is funded (faucet).`);
    else L.info(`MIRROR tGLM balance: ${bal} wei`);
  } catch (e) {
    L.warn(`could not read MIRROR balance: ${errMsg(e)}`);
  }
  const st = newMirrorState();
  for (;;) {
    try {
      const r = await syncOnce(deps, st);
      if (r.written || r.skipped) L.info(`synced to block ${r.head}: ${r.written} written, ${r.skipped} skipped`);
    } catch (e) {
      L.error(`sync failed, will retry: ${errMsg(e)}`);
    }
    await sleep(cfg.pollMs);
  }
}

import { fileURLToPath } from "node:url";
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((e) => {
    console.error(e instanceof Error && e.name === "ConfigError" ? e.message : errMsg(e));
    process.exit(1);
  });
}
