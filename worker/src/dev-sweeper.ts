/**
 * DEV FALLBACK ONLY — NOT the production trust model; CRE is.
 * Replays what the Chainlink CRE `release-sweeper` workflow does, using a local key as the
 * contract's forwarder. Use it only when `cre workflow simulate --broadcast` is unavailable.
 */
import { SILENT_RELEASE_ABI, encodeReleaseReport, type ReleaseItem } from "@iigs/core";
import { arkivPublicClient, loadSweepSnapshot } from "@iigs/core/arkiv";
import { createPublicClient, createWalletClient, http, parseAbi, type Hex, type PublicClient, type WalletClient } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { fileURLToPath } from "node:url";
import { loadSweeperConfig } from "./config.js";
import { errMsg, makeLogger, sleep } from "./log.js";
import { batches, planSweep } from "./sweep-core.js";

const ON_REPORT_ABI = parseAbi(["function onReport(bytes metadata, bytes report)"]);

/** Sends `onReport("0x", report)`; the wallet account must be the contract's forwarder. */
export async function sendReport(
  pub: PublicClient,
  wallet: WalletClient,
  contract: Hex,
  items: ReleaseItem[],
): Promise<{ hash: Hex; status: string }> {
  const report = encodeReleaseReport(items);
  const hash = await wallet.writeContract({
    chain: wallet.chain ?? null,
    account: wallet.account!,
    address: contract,
    abi: ON_REPORT_ABI,
    functionName: "onReport",
    args: ["0x", report],
  });
  const rc = await pub.waitForTransactionReceipt({ hash });
  return { hash, status: rc.status };
}

async function main() {
  const L = makeLogger("dev-sweeper");
  const cfg = loadSweeperConfig();
  L.warn("DEV FALLBACK ONLY — this is NOT the production trust model; Chainlink CRE is. Do not use for the real demo flow if CRE works.");
  const arkiv = arkivPublicClient(cfg.arkiv);
  const account = privateKeyToAccount(cfg.sweeperPrivateKey);
  const transport = http(cfg.chain.rpcUrl);
  const pub = createPublicClient({ transport }) as PublicClient;
  const wallet = createWalletClient({ account, transport });
  const addr = cfg.chain.releaseAddress;
  const fwd = (await pub.readContract({ address: addr, abi: [{ type: "function", name: "forwarder", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] }], functionName: "forwarder" })) as string;
  if (fwd.toLowerCase() !== account.address.toLowerCase()) {
    L.error(`SWEEPER_PRIVATE_KEY address ${account.address} is not the contract forwarder (${fwd}); onReport will revert.`);
  }
  L.info(`sweeping Arkiv dep="${cfg.arkiv.dep}" every ${cfg.intervalSec}s → ${addr}`);
  for (;;) {
    try {
      const now = Math.floor(Date.now() / 1000);
      const states = await loadSweepSnapshot(arkiv, cfg.arkiv, now);
      const plan = await planSweep(states, {
        escrowSecretKey: cfg.escrowSecretKey,
        now,
        isReleasedOnChain: async (id) =>
          (await pub.readContract({ address: addr, abi: SILENT_RELEASE_ABI, functionName: "isReleased", args: [id] })) as boolean,
      });
      for (const s of plan.skipped) L.warn(`skip ${s.sealId}: ${s.reason}`);
      if (plan.items.length === 0) L.info(`${states.length} seals checked, nothing due`);
      for (const b of batches(plan.items)) {
        const r = await sendReport(pub, wallet, addr, b);
        L.info(`released ${b.map((i) => `${i.sealId.slice(0, 8)}…(${plan.reasons[i.sealId]})`).join(", ")} → tx ${r.hash} (${r.status})`);
      }
    } catch (e) {
      L.error(`sweep failed: ${errMsg(e)}`);
    }
    await sleep(cfg.intervalSec * 1000);
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((e) => {
    console.error(e instanceof Error && e.name === "ConfigError" ? e.message : errMsg(e));
    process.exit(1);
  });
}
