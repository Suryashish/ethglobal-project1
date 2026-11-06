# How IF I GO SILENT uses Arkiv

Arkiv is the product's **public memory**: every seal, every heartbeat, every cancellation and every release is an Arkiv entity,
and every user-facing surface reads its state from Arkiv. Schema details: [schema.md](schema.md).

## Writes
| When | Who writes | What | Code |
|---|---|---|---|
| Author arms a seal (after a server-verified World ID Selfie Check) | VERIFIER | `iigs.seal` + first `iigs.checkin` in one `executeBatch` | `writeArmedSeal` in [`packages/core/src/arkiv/index.ts`](../packages/core/src/arkiv/index.ts) |
| Author taps "I'm OK" (World ID check, same human) | VERIFIER | new `iigs.checkin`, **expiration = heartbeat interval** | `writeCheckin` |
| Author disarms (World ID check) | VERIFIER | `iigs.disarm` | `writeDisarm` |
| Author releases early / extends (World ID check) | VERIFIER | `patchEntity` → `iigs.seal.releaseAt` | `patchReleaseAt` |
| Sepolia `SilentRelease` emits `Released` / `ReleasedGated` | MIRROR | `iigs.release` (with K for public seals) | `writeRelease`, [`worker/`](../worker) |

## Reads (all owner-filtered)
| Feature users see | Query |
|---|---|
| Public reader page `/s/<id>` (in the browser, straight from Arkiv) | `select * from iigs.seal where dep = D and sealId = X` `ownedBy(VERIFIER)` + the same for `iigs.checkin`, `iigs.disarm`, and `iigs.release ownedBy(MIRROR)` → countdown / cancelled / decrypt |
| Extension badges in the X / Reddit feed | the same four queries batched with `sealId = A or sealId = B …` (`getSealStates`) |
| Vault dashboard "my seals" | `select * from iigs.seal where dep = D and ownerNullifier = N ownedBy(VERIFIER)` |
| Chainlink CRE `release-sweeper` | raw `arkiv_query` JSON-RPC over the CRE HTTP capability: all seals / live check-ins / disarms (VERIFIER) and releases (MIRROR) for `dep`, without the ciphertext column → release decision |

Example (SDK):
```ts
const res = await publicClient
  .select()
  .from(SealSchema)                       // adds arkiv.schema = "iigs.seal"
  .where(and(eq("dep", "demo"), eq("sealId", "k3v9…")))
  .ownedBy(VERIFIER_ADDRESS)
  .fetch();
```

## Expiration is the dead-man's switch
A heartbeat is an `iigs.checkin` whose Arkiv **expiration equals the check-in interval**. Checking in writes a fresh one. If the
author goes silent, Arkiv expires the entity and it **disappears from queries**; the CRE workflow sees "no live heartbeat" and
releases. We never run a timer of our own for this: the absence of data is the trigger.
