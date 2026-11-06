# release-sweeper — Chainlink CRE workflow

Cron (every 30 s) → HTTP `arkiv_query` against the Arkiv Rabdi RPC (seals / check-ins / disarms owned by VERIFIER, releases owned by MIRROR,
all filtered by `dep` and schema tag) → the release rule (identical to `packages/core/src/release.ts`) → for PUBLIC seals unwrap the content
key with the escrow X25519 secret (CRE secret `ESCROW_SECRET_KEY`) → `runtime.report(abi.encode(ReleaseItem[]))` → `EVMClient.writeReport`
to `SilentRelease.sol` on Ethereum Sepolia (`ethereum-testnet-sepolia`).

```
workflows/release-sweeper/           CRE project root (project.yaml, secrets.yaml, .env)
  workflow/main.ts                   cron handler (SDK glue)
  workflow/src/{arkiv,release,crypto,report,sweep,bytes}.ts   pure logic (unit-tested)
  workflow/config/config.{staging,production}.json
  workflow/test/                     bun tests (+ fixtures.json generated with @iigs/core wrapKey/encodeReleaseReport)
```

## Setup
```
cd workflows/release-sweeper/workflow && bun install     # also runs cre-setup (downloads Javy)
cp ../.env.example ../.env                               # then fill in:
#   ESCROW_SECRET_KEY_ENV = ESCROW_SECRET_KEY from .secrets/keys.env (hex32, the CRE "secret")
#   CRE_ETH_PRIVATE_KEY   = key that signs the Sepolia tx under --broadcast (64 hex, no 0x; needs Sepolia ETH)
```
Set `consumerAddress` in `workflow/config/config.staging.json` to the deployed `SilentRelease` (see `contract/README.md`;
for simulation deploy it with the Mock forwarder `0x15fC6ae953E024d975e77382eEeC56A9101f9F88`).

## Login (human only, interactive)
`cre login` opens a browser flow. **`cre workflow simulate` refuses to run without it** (`Authentication required: not logged in and
no CRE_API_KEY set`); for non-interactive use set `CRE_API_KEY`. Nothing else about simulation needs an account.

## Simulate
Run from the project root (`workflows/release-sweeper`):
```
# dry run: decisions are logged, the report is built, writeReport is simulated (no tx)
~/.cre/bin/cre workflow simulate ./workflow -T staging-settings --non-interactive --trigger-index 0

# real tx on Sepolia (needs funded CRE_ETH_PRIVATE_KEY and a deployed consumer)
~/.cre/bin/cre workflow simulate ./workflow -T staging-settings --non-interactive --trigger-index 0 --broadcast
```
The cron trigger fires once per invocation; a runner re-invokes it every ~30 s. Production limits are enforced by default
(`--limits default`: 15 HTTP calls, 25 kB consensus observation, 100 kB response); this workflow stays well inside them (≤ 4 queries x `maxPages`
plus one per PUBLIC seal being released; the snapshot sent to consensus is compact).

## Where the decision log appears
stdout of `cre workflow simulate` (`runtime.log` lines), e.g.
```
sweep @1800000000: 4 seal(s), 0 disarmed, 1 released (dep=dev)
seal 7kq…: timer due → releasing (PUBLIC)
seal m2x…: heartbeat dead → releasing (GATED)
seal p9a…: waiting (next deadline in 83s)
seal d4c…: disarmed
released 2 seal(s) [7kq…:PUBLIC, m2x…:GATED] → SilentRelease 0x… tx 0x…
```

## Tests
```
cd workflow && bun test     # 19 tests: query building, response parsing, core-compat unwrap, report == core encoding, decision fixtures,
                            #           live Arkiv read (needs internet), full onCron handler with mocked HTTP/EVM/secrets
bun x cre-compile main.ts /tmp/sweeper.wasm   # compile to WASM (Javy/QuickJS) — also type-checks and rejects unsupported APIs
```

## Design notes
* Consensus: the Arkiv fetch runs in node mode and returns one compact JSON string (seals w/o ciphertext, max check-in expiry per seal, disarmed/released ids),
  aggregated with `consensusIdenticalAggregation`. `now` is `runtime.now()` (DON time). The wrapped escrow key is fetched in a second node-mode call only for PUBLIC seals about to be released.
* A check-in with `expiresAtSec <= now` is ignored even if Arkiv still indexes it (same as `assembleState`).
* A seal whose key cannot be unwrapped is logged (`ERROR seal …`) and skipped; it never blocks the rest of the batch. Batch size = `maxBatch` (10).
* The Arkiv RPC is the public rate-limited endpoint; add an access key to `arkivRpcUrl` if needed.
