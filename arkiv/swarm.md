# Arkiv × Swarm — IF I GO SILENT

## What lives where
| Data | Where | Why |
|---|---|---|
| Encrypted evidence files and long texts (nonce ‖ XChaCha20-Poly1305 ciphertext) | **Swarm** | Large, immutable, content-addressed, censorship-resistant |
| Seal record: rule, audience, countries, owner binding, wrapped key, **`swarmRef`**, `contentHash` | **Arkiv** `iigs.seal` | Queryable, owner-filtered, expiring state |
| Short sealed posts (≤ 8 KiB ciphertext) | Arkiv `iigs.seal.cipherInline` | One read instead of two |

**The entity field that holds the reference is `iigs.seal.swarmRef`** (a 64-hex plain Swarm reference). We upload **our own ciphertext**
with a plain (unencrypted) Swarm upload, so the reference reveals nothing. We never store a Swarm *encrypted-upload* reference, because
those embed their own decryption key. `iigs.seal.contentHash` (sha256 of the ciphertext) lets every reader verify the Swarm bytes before
decrypting.

## Example (from our end-to-end run)
- Entity key: `0x1bccedb322937dbfe474d3d17b7c14648ed9b5c1f2a0f0cf0164ccfa8e215f26` (`iigs.seal`, a 20 147-byte encrypted PDF; local Arkiv dev node, dep `local`)
- Swarm reference: `0398df85c8b977e964bf0cd15ba1a275c6711e20f591387c2a392ce03747bf2f` →
  https://api.gateway.ethswarm.org/bytes/0398df85c8b977e964bf0cd15ba1a275c6711e20f591387c2a392ce03747bf2f (ciphertext — useless without the released key)
- _Testnet example (Rabdi entity key + reference): to be filled in after the testnet demo run._

## Bee node / service, postage batch
- Default: the public Swarm gateway **`https://api.gateway.ethswarm.org`** (mainnet), `POST /bytes` with batch id `000…000`
  (the gateway stamps uploads itself) and `GET /bytes/<ref>` (CORS `*`, so the browser and the extension read directly).
- Own node: set `SWARM_BEE_URL=http://localhost:1633` and `SWARM_BATCH_ID=<batch>` — the upload route uses bee-js
  (`new Bee(url).data.upload(batchId, bytes)`), no code change.
- Postage batch ID / buyer wallet: **gateway-provided** in the current build — _if we buy our own batch for the demo, record the batch ID
  and the wallet here._

## Which files upload and read
- Upload: [`frontend/src/app/api/swarm/upload/route.ts`](../frontend/src/app/api/swarm/upload/route.ts) → [`frontend/src/lib/server/swarm.ts`](../frontend/src/lib/server/swarm.ts) (bee-js), called from the Vault's create flow after in-browser encryption.
- Read: the reader page and the extension fetch `${SWARM_GATEWAY}/bytes/<swarmRef>` directly (fallback `GET /api/swarm/<ref>`), check
  `contentHash`, then decrypt with the released key.

## Run one upload and one read
```bash
# upload (any bytes; in the app these are ciphertext)
printf 'hello swarm' > /tmp/x.bin
curl -s -X POST http://localhost:3000/api/swarm/upload -H 'content-type: application/octet-stream' --data-binary @/tmp/x.bin
# → {"reference":"<64 hex>"}
curl -s https://api.gateway.ethswarm.org/bytes/<64 hex>        # → hello swarm
```
End to end (seal a file → Swarm → Arkiv → release → fetch from Swarm → decrypt): `frontend/scripts/e2e-release.mts` (seals B and C).

## Demo timestamp where Swarm is used
_To be filled in from the final video._

## What got in the way
- bee-js 13 renamed the upload API (`uploadData` → `bee.data.upload`); older docs still show the old call.
- Running our own Bee testnet node needs Sepolia ETH **and** sBZZ plus a postage batch that takes minutes to become usable — the public
  gateway accepting an all-zero batch id unblocked us immediately.
