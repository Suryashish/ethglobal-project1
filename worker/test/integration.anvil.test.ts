/** Local integration: anvil (port 8546) + real SilentRelease + sweeper send path + mirror pipeline. */
import { decodeReleaseReport, toHex } from "@iigs/core";
import { spawn, type ChildProcess } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createPublicClient, createWalletClient, http, type Hex, type PublicClient } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { foundry } from "viem/chains";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { viemChainReader } from "../src/mirror.js";
import { newMirrorState, syncOnce, type ReleaseWrite } from "../src/mirror-core.js";
import { sendReport } from "../src/dev-sweeper.js";
import { planSweep } from "../src/sweep-core.js";
import { NOW, escrowSk, seal } from "./fixtures.js";

const PORT = 8546;
const RPC = `http://127.0.0.1:${PORT}`;
const PK: Hex = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"; // anvil #0
const art = JSON.parse(readFileSync(resolve(__dirname, "../../contract/out/SilentRelease.sol/SilentRelease.json"), "utf8"));
let anvil: ChildProcess;

beforeAll(async () => {
  anvil = spawn("anvil", ["--port", String(PORT), "--block-time", "1"], { stdio: "ignore" });
  const c = createPublicClient({ chain: foundry, transport: http(RPC) });
  for (let i = 0; i < 50; i++) {
    try { await c.getBlockNumber(); return; } catch { await new Promise((r) => setTimeout(r, 200)); }
  }
  throw new Error("anvil did not start");
}, 20000);
afterAll(() => anvil?.kill());

describe("anvil end-to-end", () => {
  it("sweeper send -> events -> mirror records; re-send is skipped and not double-mirrored", async () => {
    const account = privateKeyToAccount(PK);
    const pub = createPublicClient({ chain: foundry, transport: http(RPC) });
    const wallet = createWalletClient({ account, chain: foundry, transport: http(RPC) });
    const dh = await wallet.deployContract({ abi: art.abi, bytecode: art.bytecode.object as Hex, args: [account.address] });
    const rc = await pub.waitForTransactionReceipt({ hash: dh });
    const addr = rc.contractAddress!;

    const a = seal({ id: "pubseal000000001", releaseAt: NOW - 1 });
    const g = seal({ id: "gatedseal0000001", releaseAt: NOW - 1, audience: "GATED" });
    const plan = await planSweep([a.state, g.state], { escrowSecretKey: escrowSk, now: NOW });
    expect(decodeReleaseReport).toBeDefined();
    const r1 = await sendReport(pub as PublicClient, wallet, addr, plan.items);
    expect(r1.status).toBe("success");

    // Mirror pipeline with fake Arkiv.
    const store = new Map<string, ReleaseWrite>();
    const deps = {
      chain: viemChainReader(RPC, addr),
      arkiv: {
        has: async (id: string) => store.has(id),
        verify: async () => ({ ok: true as const }),
        write: async (r: ReleaseWrite) => { store.set(r.sealId, r); return { entityKey: "0xe", txHash: "0xt" }; },
      },
      log: () => {}, startBlock: 0,
      loadCursor: () => null, saveCursor: () => {},
    };
    const res = await syncOnce(deps, newMirrorState(1000));
    expect(res.written).toBe(2);
    const pubRec = store.get("pubseal000000001")!;
    expect(pubRec.gated).toBe(false);
    expect(toHex(pubRec.key!)).toBe(toHex(a.key));
    expect(pubRec.sepoliaTx).toBe(r1.hash);
    expect(pubRec.reason).toBe("cre");
    const blk = await pub.getBlock({ blockNumber: rc.blockNumber });
    expect(pubRec.releasedAt).toBeGreaterThanOrEqual(Number(blk.timestamp));
    const gRec = store.get("gatedseal0000001")!;
    expect(gRec.gated).toBe(true);
    expect(gRec.key).toBeUndefined();

    // Re-send same report: contract emits ReleaseSkipped, no new Released logs.
    const r2 = await sendReport(pub as PublicClient, wallet, addr, plan.items);
    expect(r2.status).toBe("success");
    const receipt2 = await pub.getTransactionReceipt({ hash: r2.hash });
    expect(receipt2.logs).toHaveLength(2); // two ReleaseSkipped
    expect(await pub.readContract({ address: addr, abi: art.abi, functionName: "isReleased", args: ["pubseal000000001"] })).toBe(true);
    const again = await syncOnce(deps, newMirrorState(1000));
    expect(again.written).toBe(0);
    expect(store.size).toBe(2);
  }, 60000);
});
