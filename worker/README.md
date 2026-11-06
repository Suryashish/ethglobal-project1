# @iigs/worker

Node processes around the Chainlink CRE release engine. Run with `pnpm --filter @iigs/worker <script>` (or `pnpm <script>` inside `worker/`).

| script | what it does |
|---|---|
| `mirror` | Backfills then polls (6 s) Sepolia `Released` / `ReleasedGated` logs of `SilentRelease` and writes one MIRROR-owned `iigs.release` Arkiv entity per seal (key bytes for PUBLIC, `gated=1` for GATED, `sepoliaTx`, `reason="cre"`, `releasedAt` = block timestamp). Idempotent (checks Arkiv first), cursor in `worker/.state/mirror-<chainId>-<address>.json`, chunked `getLogs` that shrinks on RPC range errors, retries with backoff. If the MIRROR wallet has 0 tGLM it logs an actionable error and keeps retrying. |
| `cre-runner` | Every `CRE_INTERVAL_SEC` (30) runs `cre workflow simulate <workflow> --broadcast --non-interactive --trigger-index 0 -T <target>` in `CRE_PROJECT_DIR`. Never overlaps, kills a run after `CRE_TIMEOUT_SEC` (180), streams output with `[cre]` prefix, highlights release/tx lines (`>>>`), and prints a `cre login` hint when not logged in. |
| `dev-sweeper` | **DEV FALLBACK ONLY, not the production trust model: CRE is.** Every 30 s: `loadSweepSnapshot` -> `decideRelease` -> unwrap escrow key (PUBLIC) -> batches of <=10 -> `onReport("0x", report)` from `SWEEPER_PRIVATE_KEY`, which must be the contract's `forwarder`. Skips ids where `isReleased` is already true. |

## Commands
```
pnpm --filter @iigs/worker mirror
pnpm --filter @iigs/worker cre-runner
pnpm --filter @iigs/worker dev-sweeper
pnpm --filter @iigs/worker test        # vitest (the anvil test needs `anvil` on PATH, uses port 8546)
pnpm --filter @iigs/worker typecheck
npx tsx scripts/live-check.ts           # (in worker/) MIRROR balance + live Arkiv write/read with IIGS_DEP=test
```

## Env
Loaded from `../.secrets/keys.env`, then `worker/.env` (overrides), then the process environment (wins). Values are never logged.

- Shared: `ARKIV_ACCESS_KEY` (""), `IIGS_DEP` ("dev"), `VERIFIER_ADDRESS`, `MIRROR_ADDRESS`, optional `ARKIV_RPC_URL`.
- Chain: `CHAIN_RPC_URL` (default `SEPOLIA_RPC_URL` or publicnode Sepolia), `CHAIN_ID` (11155111), `SILENT_RELEASE_ADDRESS`.
- mirror: `MIRROR_PRIVATE_KEY`, `START_BLOCK` (required unless CHAIN_ID=31337; set it to the deploy block), `MIRROR_POLL_MS` (6000).
- dev-sweeper: `ESCROW_SECRET_KEY`, `SWEEPER_PRIVATE_KEY`, `SWEEP_INTERVAL_SEC` (30).
- cre-runner: `CRE_BIN` (`~/.cre/bin/cre`), `CRE_PROJECT_DIR` (`<repo>/workflows`), `CRE_WORKFLOW_PATH` (`./release-sweeper`), `CRE_TARGET` (`staging-settings`), `CRE_TRIGGER_INDEX` (0), `CRE_INTERVAL_SEC`, `CRE_TIMEOUT_SEC`, `CRE_ENV_FILE`, `CRE_EXTRA_ARGS`. Auth: `cre login` or `CRE_API_KEY`.

## Trust model
The contract is the source of truth for releases. The mirror is a convenience copy into Arkiv and is **replaceable: anyone can run it** (readers filter Arkiv by the MIRROR address, but the same data is in the Sepolia event log). The dev-sweeper is a local stand-in for the CRE DON and is **not** a trust-minimised release path.
