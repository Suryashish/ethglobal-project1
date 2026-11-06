/**
 * Integration test of the real handler (`onCron`) against the CRE SDK test runtime with mocked
 * capabilities: Arkiv (HTTP), consensus, secrets and the EVM writeReport. No network, no WASM.
 */
import { expect } from "bun:test";
import { EvmMock, HttpActionsMock, newTestRuntime, test } from "@chainlink/cre-sdk/test";
import { getNetwork } from "@chainlink/cre-sdk";
import cfg from "../config/config.staging.json";
import fx from "./fixtures.json";
import { onCron } from "../main";
import { encodeReleaseReport } from "../src/report";

const NOW = 1_800_000_000;
const attrs = (o: Record<string, [string, unknown]>) => ({
  key: "0x01",
  attributes: Object.entries(o).map(([name, [type, value]]) => ({ name, type, value })),
});
const hexq = (n: number) => "0x" + n.toString(16);
const sealRow = (id: string, aud: string, extra: Record<string, [string, unknown]> = {}) =>
  attrs({ sealId: ["str", id], kind: ["str", "TIMER"], audience: ["str", aud], releaseAt: ["u64", hexq(NOW - 5)], intervalSec: ["u64", "0x0"], createdAt: ["u64", hexq(NOW - 600)], ...extra });

function setup(writes: { report?: Uint8Array }) {
  const net = getNetwork({ chainFamily: "evm", chainSelectorName: cfg.chainSelectorName, isTestnet: true })!;
  const http = HttpActionsMock.testInstance();
  http.sendRequest = (input) => {
    const body = JSON.parse(new TextDecoder().decode(input.body));
    const q: string = body.params[0];
    let data: unknown[] = [];
    if (q.includes("iigs.seal") && q.includes("sealId = str('seal-pub-1')")) {
      data = [attrs({ sealId: ["str", "seal-pub-1"], wrappedKeyEscrow: ["bytes", (fx.wrapped as Record<string, string>)["seal-pub-1"]] })];
    } else if (q.includes("iigs.seal")) {
      data = [sealRow("seal-pub-1", "PUBLIC"), sealRow("seal-gated-1", "GATED"), sealRow("seal-waiting", "PUBLIC", { releaseAt: ["u64", hexq(NOW + 83)] }), sealRow("seal-done", "PUBLIC")];
    } else if (q.includes("iigs.release")) {
      data = [attrs({ sealId: ["str", "seal-done"] })];
    }
    return { statusCode: 200, body: Buffer.from(JSON.stringify({ jsonrpc: "2.0", id: 1, result: { data, blockNumber: "0x1" } })).toString("base64") };
  };
  const evm = EvmMock.testInstance(net.chainSelector.selector);
  evm.writeReport = (input) => {
    writes.report = input.report?.rawReport;
    return { txStatus: "TX_STATUS_SUCCESS", txHash: Buffer.alloc(32, 0xab).toString("base64") };
  };
}

test("onCron: releases PUBLIC (unwrapped) + GATED, skips waiting/done", () => {
  const writes: { report?: Uint8Array } = {};
  setup(writes);
  const secrets = new Map([["main", new Map([["ESCROW_SECRET_KEY", fx.escrowSecretKey]])]]);
  const rt = newTestRuntime(secrets, { timeProvider: () => NOW * 1000 }, cfg);
  const out = onCron(rt as never);
  const logs = rt.getLogs().join("\n");
  expect(logs).toContain("seal seal-pub-1: timer due → releasing (PUBLIC)");
  expect(logs).toContain("seal seal-gated-1: timer due → releasing (GATED)");
  expect(logs).toContain("seal seal-waiting: waiting (next deadline in 83s)");
  expect(logs).toContain("seal seal-done: already released");
  expect(typeof out).toBe("string");
  expect(writes.report).toBeDefined();
  expect(logs).toContain("tx 0x" + "ab".repeat(32));
  // the delivered payload (after the 109-byte report header) equals core's encoding of the expected items
  const payload = "0x" + Buffer.from(writes.report!).subarray(109).toString("hex");
  const expected = encodeReleaseReport([
    { sealId: "seal-gated-1", gated: true, key: "0x" },
    { sealId: "seal-pub-1", gated: false, key: (fx.keys as Record<string, string>)["seal-pub-1"] as `0x${string}` },
  ]);
  expect(payload).toBe(expected);
});
