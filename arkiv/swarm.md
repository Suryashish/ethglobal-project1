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
- **Testnet (Rabdi) example:** `iigs.seal` entity `0xcba666c7dd96ff6f511e35d035dc8861a0af53d63ab35414576a3733b44858a5`
  ([explorer](https://rabdi.explorer.arkiv.network/entity/0xcba666c7dd96ff6f511e35d035dc8861a0af53d63ab35414576a3733b44858a5)) →
  `swarmRef` `c3552da66dfb097119cf28a2c84bb0a9d1f86d60cab2a2d411ca91cacaca0227`
  ([ciphertext on Swarm](https://api.gateway.ethswarm.org/bytes/c3552da66dfb097119cf28a2c84bb0a9d1f86d60cab2a2d411ca91cacaca0227)),
  released by Chainlink CRE in Sepolia tx `0x45755733f12997d4c7017a4312cb0610b5dd70c7bc19115f91b649e6a5e7ed72`
  and mirrored as `iigs.release` `0x14529849633fc44e8eb4225a0c586b6f5260f41045b5d3b065bf507ddfa3464b`.

## Bee node / service, postage batch
- Default: the public Swarm gateway **`https://api.gateway.ethswarm.org`** (mainnet), `POST /bytes` with batch id `000…000`
  (the gateway stamps uploads itself) and `GET /bytes/<ref>` (CORS `*`, so the browser and the extension read directly).
- Own node: set `SWARM_BEE_URL=http://localhost:1633` and `SWARM_BATCH_ID=<batch>` — the upload route uses bee-js
  (`new Bee(url).data.upload(batchId, bytes)`), no code change.
- Postage batch ID: `0000000000000000000000000000000000000000000000000000000000000000` (all zeros). Who provided it: the
  **public Swarm gateway `api.gateway.ethswarm.org`**, which stamps uploads with its own postage stamps. No wallet of ours bought a
  batch.

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
- **mm:ss** — sealing a file in the Vault: the encrypted file is uploaded to Swarm and the seal's `swarmRef` is written to Arkiv.
- **mm:ss** — after release, the reader page fetches the ciphertext from Swarm, checks `contentHash` and decrypts the file in the browser
  (same screen as [`screenshots/11-reader-released-file-swarm.png`](../screenshots/11-reader-released-file-swarm.png)).

## What got in the way
- bee-js 13 renamed the upload API (`uploadData` → `bee.data.upload`); older docs still show the old call.
- Running our own Bee testnet node needs Sepolia ETH **and** sBZZ plus a postage batch that takes minutes to become usable — the public
  gateway accepting an all-zero batch id unblocked us immediately.
