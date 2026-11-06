# SilentRelease (Foundry)

`src/SilentRelease.sol` is the on-chain release record for IF I GO SILENT. The Chainlink CRE `release-sweeper`
workflow delivers `abi.encode((string sealId, bool gated, bytes key)[])` through the CRE forwarder to `onReport`.
PUBLIC seals emit `Released(idHash, sealId, key)`; GATED seals emit `ReleasedGated(idHash, sealId)`. Idempotent
(already-released ids and bad key lengths are skipped with `ReleaseSkipped`, never reverted). Only `forwarder` may call.

Receiver pattern verified against Chainlink's `IReceiver` / `ReceiverTemplate`
(cre-templates `starter-templates/automation-migration/contracts/evm/src/ReceiverTemplate.sol`):
`onReport(bytes metadata, bytes report)`, ERC165 `supportsInterface`, metadata =
`workflowId(32) | workflowName(10) | workflowOwner(20) | reportName(2)` (owner at byte offset 42, what `_workflowOwner` reads).

## Test / build
```
forge build
forge test -vv          # 14 tests (batch, idempotency, bad key, only-forwarder, owner-only, metadata, ERC165, fuzz)
```

## Forwarder addresses, Ethereum Sepolia (`ethereum-testnet-sepolia`)
Source: https://docs.chain.link/cre/guides/workflow/using-evm-client/forwarder-directory-ts (checked on-chain: both have code)

| use | contract | address |
|---|---|---|
| `cre workflow simulate --broadcast` | MockKeystoneForwarder | `0x15fC6ae953E024d975e77382eEeC56A9101f9F88` |
| deployed workflow (DON) | KeystoneForwarder | `0xF8344CFd5c43616a4366C34E3EEE75af79a74482` |

Deploy the consumer with the forwarder that matches how the workflow runs: **simulation → Mock**, production → real.
(`setForwarder` lets the owner switch later without redeploying.) In simulation the report metadata's workflow owner is the
simulating account, so leave `expectedWorkflowOwner` unset until the workflow is deployed.

## Deploy
```
set -a; . ../.secrets/keys.env; set +a       # SEPOLIA_DEPLOYER_PRIVATE_KEY (never print it)
export SEPOLIA_RPC_URL=https://ethereum-sepolia-rpc.publicnode.com
FORWARDER_ADDRESS=0x15fC6ae953E024d975e77382eEeC56A9101f9F88 \
forge script script/Deploy.s.sol --rpc-url $SEPOLIA_RPC_URL --broadcast --private-key $SEPOLIA_DEPLOYER_PRIVATE_KEY
# optional: WORKFLOW_OWNER=0x… also sets expectedWorkflowOwner
```
Deployer `0x70Ea17eF08A94B9B2Af4d7F8045395E606eE46c1` — Sepolia balance was **0 ETH** when checked (fund it before deploying).
Then put the printed address in `workflows/release-sweeper/workflow/config/config.*.json` (`consumerAddress`) and `SILENT_RELEASE_ADDRESS`.

Verified locally: `Deploy.s.sol` on anvil, then a report produced by `@iigs/core` `encodeReleaseReport` delivered by the
forwarder account emitted `Released` / `ReleasedGated` / `ReleaseSkipped` (decoded with viem + `SILENT_RELEASE_ABI`).
