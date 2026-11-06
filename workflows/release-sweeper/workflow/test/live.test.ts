/** Live read against the public Arkiv endpoint (reads are free; endpoint is rate limited). */
import { expect, test } from "bun:test";
import { buildQuery, buildRequestBody, parseQueryResponse, SCHEMA, SELECT_ATTRS } from "../src/arkiv";
import cfg from "../config/config.staging.json";

async function rpc(body: string) {
  // Same as the workflow: the access key (env ARKIV_ACCESS_KEY, optional) is the last URL path segment.
  const key = process.env.ARKIV_ACCESS_KEY?.trim();
  const url = key ? `${cfg.arkivRpcUrl.replace(/\/+$/, "")}/${encodeURIComponent(key)}` : cfg.arkivRpcUrl;
  const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body });
  expect(res.ok).toBe(true);
  return res.json();
}

test("Arkiv accepts all 4 sweep queries + the wrapped-key query", async () => {
  const cases: [string, string, readonly string[]][] = [
    [buildQuery(SCHEMA.seal, cfg.dep, cfg.verifierAddress), "seal", SELECT_ATTRS.seal],
    [buildQuery(SCHEMA.checkin, cfg.dep, cfg.verifierAddress), "checkin", SELECT_ATTRS.checkin],
    [buildQuery(SCHEMA.disarm, cfg.dep, cfg.verifierAddress), "disarm", SELECT_ATTRS.disarm],
    [buildQuery(SCHEMA.release, cfg.dep, cfg.mirrorAddress), "release", SELECT_ATTRS.release],
    [buildQuery(SCHEMA.seal, cfg.dep, cfg.verifierAddress, "abc123"), "wrapped", SELECT_ATTRS.wrappedKey],
  ];
  for (const [q, , attrs] of cases) {
    const page = parseQueryResponse(await rpc(buildRequestBody(q, attrs, 0)));
    expect(Array.isArray(page.rows)).toBe(true); // 0 rows for a fresh dep; a throw here would mean the query was rejected
    await Bun.sleep(300);
  }
}, 30_000);

test("a malformed query is rejected by the node (sanity: errors are surfaced)", async () => {
  expect(() => parseQueryResponse({ error: { code: -32001, message: "x" } })).toThrow();
  const j = await rpc(buildRequestBody("bogus ((", ["sealId"], 0));
  expect(j.error).toBeDefined();
});
