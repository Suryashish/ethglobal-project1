# IF I GO SILENT

**A dead-man's switch for people who might be silenced.** Seal evidence or a social post. It opens **at a set time** or
**if you stop checking in**, optionally **only for readers from chosen countries**. Every action that changes a seal's fate needs a
**live World ID face check** by the same human who sealed it. An **independent Chainlink CRE workflow** decides the release, and
**Arkiv + Swarm** keep everything public and uncensorable.

> In October 2017, Maltese journalist Daphne Caruana Galizia was killed by a car bomb. Her killers wanted her investigations to
> die with her. They didn't — 45 journalists from 18 outlets finished them (The Daphne Project). But that took a coalition and luck.
> IF I GO SILENT makes it automatic. And because the switch is public, the people who'd want to silence you know that silencing
> you publishes everything. **The switch protects you by existing.**

ETHGlobal Mumbai 2026 · Sponsor tracks: **Chainlink CRE · World (IDKit) · Arkiv (+ Arkiv × Swarm)**

---

## What's in the box
| Surface | What it does |
|---|---|
| **Vault** (`frontend/`, Next.js) | Seal a file or text in the browser, pick **TIMER** / **HEARTBEAT** (dead-man) / **BOTH**, PUBLIC or **country-gated**, arm with World ID. Dashboard with live countdowns; **I'm OK** check-in, **Disarm**, **Release now**, **Extend** — each needs a World ID face check by the same human. |
| **Reader** (`/s/<id>`) | Reads the seal's state **straight from Arkiv in the browser**: sealed countdown → cancelled / releasing / **decrypted in the browser** (text, image, PDF). Gated seals ask the reader to prove nationality with World ID. |
| **Silent Seal** (`extension/`, WXT MV3) | Compose a sealed post in the popup ("hello world", opens in 5 days, 🇮🇳 only) → face check on the web app → the sealed line is inserted into your X / Reddit composer. Everyone with the extension sees a live badge in the feed and, after release, **the decrypted text right in the timeline**. |
| **Release engine** (`workflows/release-sweeper/`, Chainlink CRE) | Cron every 30 s → reads all seals / heartbeats / disarms / releases from **Arkiv** over HTTP → applies the rule → unwraps the content key for public seals with a CRE secret → `writeReport` to **`SilentRelease.sol`** on Sepolia. |
| **Mirror** (`worker/`) | Watches `SilentRelease` events and writes `iigs.release` entities to Arkiv. Anyone can run it — the contract is the source of truth. |

## Architecture
```
 World ID (IDKit 4.6)  Selfie Check sessions (owner)  ·  Identity Check nationality (gated reader)
          │ proof                                                     │ proof
 ┌────────┴─────────┐  seal / check-in / disarm   ┌───────────────────┴──┐
 │ Vault + reader    │──────────────────────────► │ Next.js API           │──► Arkiv (Rabdi): iigs.seal, iigs.checkin
 │ Silent Seal ext.  │  ciphertext (browser-enc.) │ verifies proofs       │     (expires = heartbeat!), iigs.disarm
 └────────┬─────────┘                            │ gated key service     │
          │ ciphertext                            └──────────────────────┘
          ▼                                                    ▲ reads (HTTP, arkiv_query)
     Swarm (Bee)                       Chainlink CRE release-sweeper ──writeReport──► SilentRelease.sol (Sepolia)
                                                                                         │ Released / ReleasedGated
                                       worker mirror ◄───────────────────────────────────┘ ──► Arkiv iigs.release
```
**The absence of data is the trigger.** A heartbeat is an Arkiv `iigs.checkin` whose expiration equals the check-in interval.
If the author goes silent, Arkiv expires it, it disappears from queries, and CRE releases.

## World ID: two trust moments, minimum sufficient credential
| Trust moment | Credential | Why this is the minimum sufficient assurance | Alternative path we demo |
|---|---|---|---|
| **Arm / check in / disarm / release now / extend** | **Selfie Check** (face-bound, live presence), via World ID **session proofs** so the same human can prove again | The risk is "someone else is holding my phone". We need the *same live human*. Orb is overkill; a passport proves nothing about presence. | A thief's check-in or disarm is refused (`403 different_human`) and the heartbeat keeps running |
| **Read a country-gated seal** | **Identity Check** with `nationality` attribute | The only question is "is this reader a national of X?" — exactly what's attested, nothing more (no name, no birthdate) | A reader from another country sees "Not available in your country" |

Every proof's signal commits to `(action, sealId, extra, issuedAt)` — for arming, to the digest of the exact ciphertext and rule — and
is verified **server-side** (`POST developer.world.org/api/v4/verify/{rp_id}`). Details: [`docs/world-integration.md`](docs/world-integration.md) ·
integration debrief: [`WORLD_FEEDBACK.md`](WORLD_FEEDBACK.md).

## Crypto (all in the browser / extension; `@noble/*`)
- Content: **XChaCha20-Poly1305** with a fresh key K per seal; AAD binds the ciphertext to its seal id.
- Key escrow: K wrapped to an **X25519** public key (HKDF-SHA256 sealed box). PUBLIC → the CRE escrow key (secret lives only as a CRE
  secret); GATED → the gated key service, which releases K only after the on-chain gated release **and** a valid World nationality proof.
- Swarm holds **our own ciphertext** (plain upload) — never a Swarm encrypted-upload reference (it would embed its own key).
- Code: [`packages/core`](packages/core) — the same code runs in the web app, the extension, the worker and (re-implemented with the same
  libraries) inside the CRE WASM runtime; compatibility is tested both ways.

## Sponsor evidence
**Chainlink CRE** — workflow: [`workflows/release-sweeper/workflow/main.ts`](workflows/release-sweeper/workflow/main.ts) · consumer:
[`contract/src/SilentRelease.sol`](contract/src/SilentRelease.sol) (IReceiver, forwarder-gated, idempotent) · Sepolia contract:
`TBD after deploy` · release tx: `TBD` · simulate: `cd workflows/release-sweeper && cre workflow simulate ./workflow -T staging-settings --non-interactive --trigger-index 0 --broadcast`.

**Arkiv** — writer addresses: VERIFIER `0xF87fC983a8D75c67cdF4E0f80b1507a74A21fBD8` (seal / checkin / disarm), MIRROR
`0x9b95d050D551C8836578f32d92508467E7dA1638` (release). Example query:
```ts
publicClient.select().from(SealSchema)                     // arkiv.schema = "iigs.seal"
  .where(and(eq("dep", "demo"), eq("sealId", "<id>")))
  .ownedBy("0xF87fC983a8D75c67cdF4E0f80b1507a74A21fBD8").fetch()
```
Docs: [`arkiv/schema.md`](arkiv/schema.md) · [`how-you-use-arkiv.md`](arkiv/how-you-use-arkiv.md) · [`why-arkiv.md`](arkiv/why-arkiv.md) ·
[`friction.md`](arkiv/friction.md) · [`reach.md`](arkiv/reach.md) · [`swarm.md`](arkiv/swarm.md).

**World** — [`packages/world`](packages/world) (IDKit 4.6 widgets + server verification), routes in `frontend/src/app/api/{seals,reader,world}`.

## Run it
Requirements: Node ≥ 22.10, pnpm 11, Foundry, Docker (for the local Arkiv node), Bun + CRE CLI (for the workflow).

```bash
pnpm install
cd packages/core && node ../../scripts/gen-keys.mjs && cd ../..   # writes .secrets/keys.env (gitignored)

# Fully local, no testnet funds needed: Arkiv dev node + anvil + web app + dev sweeper + mirror
scripts/local-stack.sh up
(cd frontend && ../packages/core/node_modules/.bin/tsx scripts/e2e-release.mts)   # end-to-end release test
open http://localhost:3000
scripts/local-stack.sh down
```
On testnet: fund the VERIFIER and MIRROR addresses with tGLM (hub.arkiv.network/faucet), deploy `SilentRelease` to Sepolia with the CRE
forwarder (see [`contract/README.md`](contract/README.md)), set `consumerAddress` in the workflow config, `cre login`, then run
`pnpm --filter @iigs/frontend dev`, `pnpm --filter @iigs/worker cre-runner` and `pnpm --filter @iigs/worker mirror`.

Extension: `pnpm --filter @iigs/extension build`, then load `extension/.output/chrome-mv3` unpacked (see [`extension/README.md`](extension/README.md)).

Tests: `pnpm -r test` (core, world, frontend, worker, extension unit) · `pnpm --filter @iigs/extension test:e2e` · `cd contract && forge test` ·
`cd workflows/release-sweeper/workflow && bun test`.

## Repo layout
```
packages/core      seal/open, key wrap, post format, release rule, signals, CRE report ABI, Arkiv schemas & queries
packages/world     World ID: IDKit widgets (live) + simulator (dev), server-side verification
frontend/          Next.js Vault, reader /s/[id], /arm + /verify-reader handoff pages, API routes
extension/         Silent Seal (WXT, MV3)
worker/            release mirror (chain → Arkiv), CRE simulate runner, dev sweeper (local stand-in for CRE)
contract/          Foundry: SilentRelease.sol + tests + deploy script
workflows/         Chainlink CRE release-sweeper (TypeScript → WASM)
arkiv/  docs/      prize write-ups, spec, threat model, AI attribution
```

## Honest trust notes
- In this hackathon build the CRE workflow runs with `cre workflow simulate`; in production it is deployed to a CRE DON where the escrow
  key is a confidential secret — no single party, including us, can release early or suppress a release.
- Our backend verifies World proofs and writes Arkiv entities with the VERIFIER key; a stolen phone can't forge a check-in. Roadmap:
  multiple independent verifiers.
- Gating controls **who gets first, verified access**, not copying — it is audience targeting, not DRM.
- World proves presence, not free will (coercion) — roadmap: a duress check-in that looks normal but releases immediately.

## AI attribution
Built with **Claude Code** (Anthropic): a lead agent designed the architecture and wrote `packages/core`, the contract and the integration
tests, and delegated components to parallel sub-agents (contract tests + CRE workflow, World ID, web app, extension, worker, browser QA).
All code was reviewed and verified by running the test suites and end-to-end flows. Prompts and specs: [`docs/ai/`](docs/ai).

License: [MIT](LICENSE)
