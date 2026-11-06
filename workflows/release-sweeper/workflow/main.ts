/**
 * IF I GO SILENT — release-sweeper (Chainlink CRE workflow)
 *
 *   cron (30 s) → HTTP → Arkiv JSON-RPC (seals / check-ins / disarms / releases)
 *               → release rule (timer due | heartbeat dead) → unwrap content key (PUBLIC) with the
 *                 escrow secret → runtime.report(abi.encode(ReleaseItem[])) → EVM writeReport
 *               → SilentRelease.sol (Ethereum Sepolia) → Released / ReleasedGated events.
 */
import {
  bytesToHex as creBytesToHex,
  consensusIdenticalAggregation,
  CronCapability,
  EVMClient,
  getNetwork,
  handler,
  HTTPClient,
  type HTTPSendRequester,
  ok,
  prepareReportRequest,
  Runner,
  type Runtime,
  text,
  TxStatus,
} from "@chainlink/cre-sdk";
import { z } from "zod";
import { buildQuery, buildRequestBody, PAGE_SIZE, parseQueryResponse, SCHEMA, SELECT_ATTRS } from "./src/arkiv";
import { hexToBytes, utf8 } from "./src/bytes";
import { encodeReleaseReport } from "./src/report";
import { buildItems, buildSnapshot, planSweep, type Snapshot } from "./src/sweep";

const configSchema = z.object({
  schedule: z.string(),
  arkivRpcUrl: z.string().url(),
  dep: z.string(),
  verifierAddress: z.string().regex(/^0x[0-9a-fA-F]{40}$/),
  mirrorAddress: z.string().regex(/^0x[0-9a-fA-F]{40}$/),
  consumerAddress: z.string().regex(/^0x[0-9a-fA-F]{40}$/),
  chainSelectorName: z.string(),
  gasLimit: z.string(),
  maxBatch: z.number().int().positive().max(25),
  maxPages: z.number().int().positive().max(20),
});
type Config = z.infer<typeof configSchema>;

/** One Arkiv JSON-RPC call (a page), run inside the node-mode HTTP request. */
function arkivPage(req: HTTPSendRequester, cfg: Config, query: string, attrs: readonly string[], offset: number) {
  const res = req
    .sendRequest({
      url: cfg.arkivRpcUrl,
      method: "POST",
      headers: { "content-type": "application/json" },
      body: utf8(buildRequestBody(query, attrs, offset)),
    })
    .result();
  if (!ok(res)) throw new Error(`Arkiv HTTP ${res.statusCode}`);
  return parseQueryResponse(JSON.parse(text(res)));
}

function arkivAll(req: HTTPSendRequester, cfg: Config, query: string, attrs: readonly string[]) {
  const rows: Record<string, unknown>[] = [];
  for (let page = 0; page < cfg.maxPages; page++) {
    const p = arkivPage(req, cfg, query, attrs, page * PAGE_SIZE);
    rows.push(...p.rows);
    if (p.rows.length < PAGE_SIZE) break;
  }
  return rows;
}

/** Node-mode: the 4 bulk queries → compact snapshot as a JSON string (identical across nodes). */
const fetchSnapshot = (req: HTTPSendRequester, cfg: Config): string => {
  const q = (schema: string, owner: string) => buildQuery(schema, cfg.dep, owner);
  const seals = arkivAll(req, cfg, q(SCHEMA.seal, cfg.verifierAddress), SELECT_ATTRS.seal);
  const checkins = arkivAll(req, cfg, q(SCHEMA.checkin, cfg.verifierAddress), SELECT_ATTRS.checkin);
  const disarms = arkivAll(req, cfg, q(SCHEMA.disarm, cfg.verifierAddress), SELECT_ATTRS.disarm);
  const releases = arkivAll(req, cfg, q(SCHEMA.release, cfg.mirrorAddress), SELECT_ATTRS.release);
  return JSON.stringify(buildSnapshot(seals, checkins, disarms, releases));
};

/** Node-mode: wrappedKeyEscrow (hex) for the PUBLIC seals about to be released → JSON {sealId: hex}. */
const fetchWrappedKeys = (req: HTTPSendRequester, cfg: Config, ids: string[]): string => {
  const out: Record<string, string> = {};
  for (const id of ids) {
    const rows = arkivPage(req, cfg, buildQuery(SCHEMA.seal, cfg.dep, cfg.verifierAddress, id), SELECT_ATTRS.wrappedKey, 0).rows;
    const w = rows[0]?.wrappedKeyEscrow;
    if (typeof w === "string") out[id] = w;
  }
  return JSON.stringify(out);
};

export const onCron = (runtime: Runtime<Config>): string => {
  const cfg = runtime.config;
  const now = Math.floor(runtime.now().getTime() / 1000);
  const http = new HTTPClient();

  // 1) Arkiv snapshot (external system) with DON consensus
  const snap = JSON.parse(
    http.sendRequest(runtime, fetchSnapshot, consensusIdenticalAggregation<string>())(cfg).result(),
  ) as Snapshot;
  runtime.log(`sweep @${now}: ${snap.seals.length} seal(s), ${snap.dis.length} disarmed, ${snap.rel.length} released (dep=${cfg.dep})`);

  // 2) release rule
  const plans = planSweep(snap, now);
  for (const p of plans) runtime.log(p.line);
  const due = plans.filter((p) => p.release);
  if (due.length === 0) {
    runtime.log("nothing to release");
    return "idle";
  }
  const batch = due.slice(0, cfg.maxBatch);
  if (due.length > batch.length) runtime.log(`${due.length - batch.length} more due seal(s) deferred to the next run (batch limit ${cfg.maxBatch})`);

  // 3) PUBLIC seals: fetch escrow-wrapped key, unwrap with the escrow secret
  const publicIds = batch.filter((p) => p.audience === "PUBLIC").map((p) => p.id);
  let wrapped: Record<string, string> = {};
  let secret: Uint8Array | null = null;
  if (publicIds.length > 0) {
    wrapped = JSON.parse(
      http.sendRequest(runtime, fetchWrappedKeys, consensusIdenticalAggregation<string>())(cfg, publicIds).result(),
    );
    secret = hexToBytes(runtime.getSecret({ id: "ESCROW_SECRET_KEY" }).result().value);
  }
  const { items, errors } = buildItems(batch, wrapped, secret, cfg.maxBatch);
  for (const e of errors) runtime.log(`ERROR ${e}`);
  if (items.length === 0) return "nothing deliverable";

  // 4) report → SilentRelease on Sepolia
  const network = getNetwork({ chainFamily: "evm", chainSelectorName: cfg.chainSelectorName, isTestnet: true });
  if (!network) throw new Error(`unknown chain selector name: ${cfg.chainSelectorName}`);
  const evm = new EVMClient(network.chainSelector.selector);
  const reportHex = encodeReleaseReport(items);
  const report = runtime.report(prepareReportRequest(reportHex)).result();
  const resp = evm
    .writeReport(runtime, { receiver: cfg.consumerAddress, report, gasConfig: { gasLimit: cfg.gasLimit } })
    .result();
  if (resp.txStatus !== TxStatus.SUCCESS) throw new Error(`writeReport failed: ${resp.errorMessage || resp.txStatus}`);
  const tx = resp.txHash ? creBytesToHex(resp.txHash) : "0x(no tx hash — simulation without --broadcast)";
  runtime.log(`released ${items.length} seal(s) [${items.map((i) => i.sealId + (i.gated ? ":GATED" : ":PUBLIC")).join(", ")}] → SilentRelease ${cfg.consumerAddress} tx ${tx}`);
  return tx;
};

const initWorkflow = (config: Config) => {
  const cron = new CronCapability();
  return [handler(cron.trigger({ schedule: config.schedule }), onCron)];
};

export async function main() {
  const runner = await Runner.newRunner<Config>({ configSchema });
  await runner.run(initWorkflow);
}
