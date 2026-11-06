# Arkiv schema — IF I GO SILENT

Network: **Rabdi testnet** (chain id `7794095`, RPC `https://rpc.rabdi.db-chain.testnet.arkiv.network`).
Defined in code at [`packages/core/src/arkiv/schemas.ts`](../packages/core/src/arkiv/schemas.ts) with `defineSchema` from `@arkiv-network/sdk/schema`.
Every schema is **named**, so each entity also carries the indexed tag `arkiv.schema = <name>`.

Everything on Arkiv is public and anyone can write entities under these names, so **every read filters by `$owner`**:
`iigs.seal`, `iigs.checkin` and `iigs.disarm` count only when written by the **VERIFIER** service (which writes only after a
server-verified World ID proof); `iigs.release` counts only when written by the **MIRROR** (which writes only what the
Sepolia `SilentRelease` contract emitted). Every entity also has an indexed `dep` (deployment tag) so test runs never mix with the demo.

| Schema | `$owner` | Expiration | Columns (✱ = indexed) |
|---|---|---|---|
| `iigs.seal` | VERIFIER | 180 days | `dep`✱ str · `sealId`✱ str · `kind` str (TIMER/HEARTBEAT/BOTH) · `releaseAt`✱ u64 (unix s, 0 = no timer) · `intervalSec` u64 (0 = no heartbeat) · `audience`✱ str (PUBLIC/GATED) · `countries` str ("IN,MT") · `ownerNullifier`✱ str (World ID same-human binding) · `contentType` str (inline/swarm) · `swarmRef` str? (64-hex plain Swarm reference of **our own ciphertext**) · `cipherInline` bytes? (nonce‖XChaCha20-Poly1305 ciphertext, ≤ 8 KiB) · `wrappedKeyEscrow` bytes (K wrapped to the CRE escrow or gated key-service X25519 key, 104 B) · `title` str · `createdAt`✱ u64 · `contentHash` str (sha256 of the ciphertext) · `sizeBytes` u64 · `source` str (vault/extension) |
| `iigs.checkin` | VERIFIER | **= `intervalSec`** — this is the heartbeat | `dep`✱ · `sealId`✱ · `at` u64 · `expiresAtSec` u64 · `nullifierMatch` str ("ok") |
| `iigs.disarm` | VERIFIER | 180 days | `dep`✱ · `sealId`✱ · `at` u64 |
| `iigs.release` | MIRROR | 180 days | `dep`✱ · `sealId`✱ · `releasedAt` u64 · `releasedKey` bytes? (K, PUBLIC seals only) · `gated` str ("0"/"1") · `sepoliaTx` str · `reason` str |

Notes
- `key` is a reserved word in Arkiv's query language, so the released key column is `releasedKey`.
- The seal and its first check-in are created in **one `executeBatch` transaction**, so no reader can ever observe a heartbeat seal without a heartbeat.
- "Release now" and "extend" are `patchEntity` on the seal's `releaseAt` by the VERIFIER (the seal is VERIFIER-owned, so nobody else can patch it).
