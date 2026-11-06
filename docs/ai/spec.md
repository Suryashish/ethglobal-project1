# IF I GO SILENT — implementation spec (shared contract between components)

> Source of truth for product intent: `/if-i-go-silent-plan.md`. This file pins the **interfaces**
> every component codes against. If you need to change an interface, note it in your final report.

## Repo layout (pnpm workspace, Node 24, pnpm 11)
```
packages/core/            @iigs/core   — DONE. crypto, seal/open, post format, release rule, signals, CRE report ABI, Arkiv schemas/reads/writes
packages/world/           @iigs/world  — World ID (IDKit 4.x) server verify + React client component, incl. MOCK mode
frontend/                 @iigs/frontend — Next.js (App Router) Vault + reader /s/[id] + API routes
extension/                @iigs/extension — WXT MV3 "Silent Seal"
worker/                   @iigs/worker — release mirror (Sepolia events → Arkiv) + CRE simulate runner + dev sweeper
contract/                 Foundry: SilentRelease.sol (+ tests, deploy script)
workflows/release-sweeper CRE TypeScript workflow (own bun project, NOT in the pnpm workspace)
arkiv/ docs/              docs
.secrets/keys.env         generated service keys (gitignored) — VERIFIER_*, MIRROR_*, SEPOLIA_DEPLOYER_*, ESCROW_*, GATED_*, READER_TOKEN_SECRET
```
`@iigs/core` is consumed as TypeScript source (`exports` point at `src/*.ts`, imports use `.js` suffixes).
Next.js needs `transpilePackages: ["@iigs/core", "@iigs/world"]`. Use it via `"@iigs/core": "workspace:*"`.

### `@iigs/core` API (read `packages/core/src/*.ts` — it is the authority)
- `createSeal(input) → { draft: SealDraft, ciphertext, needsSwarmUpload, key }` — encrypts in the browser.
  If `needsSwarmUpload`, upload `ciphertext` to Swarm, then set `draft.swarmRef = reference`.
- `openSeal({ sealId, key, ciphertext, contentHash }) → Envelope` (`{header:{kind:"text"}|{kind:"file",name,mime,size}, body}`)
- `unwrapKey(wrapped, secretKey)`, `wrapKey`, `fromBase64/toBase64/fromHex/toHex`
- `formatSealedPost({sealId, baseUrl, releaseAt, countries}) → string`, `findSealIds(text) → string[]`, `sealToken`, `readerUrl`
- `ownerSignal(action, sealId, issuedAt, extra)`, `readerSignal(nonce, issuedAt)`, `parseSignal`, `isFresh`, `draftDigest(draft)`
- `decideRelease`, `computeStatus`, `encodeReleaseReport/decodeReleaseReport`, `SILENT_RELEASE_ABI`
- `validateDraft(draft) → error string | null` (server must call it)
- `@iigs/core/arkiv`: `arkivPublicClient(cfg)`, `arkivWalletClient(cfg, pk)`, `getSealState`, `getSealStates`,
  `listSealsByOwner`, `loadSweepSnapshot`, `writeArmedSeal`, `writeCheckin`, `writeDisarm`, `patchReleaseAt`,
  `writeRelease`, schemas, `ARKIV_EXPLORER` (https://rabdi.explorer.arkiv.network)

### Release rule (implemented in `core/src/release.ts`, re-implemented in the CRE workflow)
`timerDue = releaseAt>0 && now>=releaseAt`; `heartbeatDead = intervalSec>0 && no live VERIFIER iigs.checkin && now >= createdAt+20`;
release iff `!disarmed && !released && (timerDue || heartbeatDead)`. Release-now / extend = verifier patches seal.releaseAt.

### Arkiv entities (all carry indexed `dep` = deployment tag; trusted only if `$owner` matches)
| schema | $owner | notes |
|---|---|---|
| `iigs.seal` | VERIFIER | written (with first checkin, in ONE batch tx) after the arm World proof |
| `iigs.checkin` | VERIFIER | expiration = intervalSec (Arkiv expiry IS the dead-man switch) |
| `iigs.disarm` | VERIFIER | |
| `iigs.release` | MIRROR | `releasedKey` bytes (PUBLIC only), `gated` "0"/"1", `sepoliaTx`, `reason` |

### CRE report → `SilentRelease.sol`
`abi.encode(ReleaseItem[] items)` with `struct ReleaseItem { string sealId; bool gated; bytes key; }`.
Contract events: `Released(bytes32 indexed idHash, string sealId, bytes key)`, `ReleasedGated(bytes32 indexed idHash, string sealId)`
where `idHash = keccak256(bytes(sealId))`. Views: `isReleased(string) → bool`, `releasedAt(string) → uint64`.
Idempotent: an already-released id in a batch is skipped (no revert). Only the configured forwarder may deliver reports.

## Environment variables
Server (frontend):
```
IIGS_DEP=dev                         # deployment tag in every Arkiv entity
ARKIV_ACCESS_KEY=                    # optional; "" = public rate-limited endpoint
VERIFIER_PRIVATE_KEY=0x…             # Arkiv wallet that writes seal/checkin/disarm
GATED_SECRET_KEY=<hex32>             # X25519 secret of the gated key service
READER_TOKEN_SECRET=<hex32>          # HMAC secret for reader session tokens
SWARM_BEE_URL=https://api.gateway.ethswarm.org   # or http://localhost:1633 for own Bee
SWARM_BATCH_ID=0000…0000 (64 hex)    # postage batch; the public gateway accepts all-zero
SEPOLIA_RPC_URL=https://ethereum-sepolia-rpc.publicnode.com
WORLD_MODE=mock|live
WORLD_APP_ID, WORLD_RP_ID, WORLD_SIGNING_KEY, WORLD_ENVIRONMENT=staging|production
WORLD_ACTION_OWNER=iigs-owner, WORLD_ACTION_READER=iigs-reader
```
Public (`NEXT_PUBLIC_*`): `BASE_URL` (e.g. http://localhost:3000), `IIGS_DEP`, `ARKIV_ACCESS_KEY`,
`VERIFIER_ADDRESS`, `MIRROR_ADDRESS`, `ESCROW_PUBLIC_KEY` (hex32), `GATED_PUBLIC_KEY` (hex32),
`SWARM_GATEWAY` (read URL, default https://api.gateway.ethswarm.org), `SILENT_RELEASE_ADDRESS`,
`SEPOLIA_EXPLORER` (https://sepolia.etherscan.io), `WORLD_MODE`, `WORLD_APP_ID`, `WORLD_ENVIRONMENT`.

## World ID interface (`@iigs/world`)
Two trust moments (plan §9): **owner** actions (arm / checkin / disarm / release-now / extend) use
**Selfie Check**; **reader** of a country-gated seal uses a **passport / identity credential with nationality**.

```ts
// @iigs/world  (shared types)
export type WorldKind = "owner" | "reader";
export type WorldProofEnvelope = {
  mode: "mock" | "live";
  kind: WorldKind;
  signal: string;          // the exact signal string the proof commits to
  result: unknown;         // raw IDKit result (live) or MockProof (mock)
};
// @iigs/world/server
export type OwnerVerifyResult = { ok: true; humanId: string } | { ok: false; code: string; message: string };
export type ReaderVerifyResult = { ok: true; humanId: string; nationality: string | null } | { ok: false; code: string; message: string };
export function verifyOwnerProof(env: WorldProofEnvelope, expectedSignal: string): Promise<OwnerVerifyResult>;
export function verifyReaderProof(env: WorldProofEnvelope, expectedSignal: string): Promise<ReaderVerifyResult>;
export function createRpContext(kind: WorldKind, signal: string): Promise<unknown>;   // live: signRequest(); mock: null
// @iigs/world/client  ("use client")
export function WorldVerifyButton(props: {
  kind: WorldKind; signal: string; label: string; disabled?: boolean; className?: string;
  onVerified: (env: WorldProofEnvelope) => Promise<void> | void;  // throw → shown as error in the button
  onError?: (message: string) => void;
}): JSX.Element;
```
- `humanId` must be **stable for the same human across repeated owner proofs** (this is the same-human binding stored
  as `ownerNullifier` at arm time and compared on every later owner action → the thief is refused with HTTP 403 `different_human`).
- MOCK mode (`WORLD_MODE=mock`, never default in production): the button opens a small modal "World ID simulator (dev)" where
  you pick an identity — **"Author (you)"** or **"Someone else (thief)"** — and, for reader proofs, a nationality from a list
  (IN, MT, US, GB, DE, FR, BR, NG, …). `humanId = "mock:" + sha256(identityName + ":" + kind)`. The server accepts mock proofs
  only when `WORLD_MODE=mock`.
- The frontend exposes `POST /api/world/rp-context {kind, signal}` → `createRpContext` (live mode needs it before opening IDKit).

## Frontend API routes (Next.js `frontend/src/app/api/**/route.ts`, `runtime = "nodejs"`)
All JSON. Errors: `{ error: code, message }` with a proper status.
| route | body | does |
|---|---|---|
| `GET /api/config` | — | public config (addresses, dep, pubkeys, baseUrl, worldMode, swarmGateway, contract) |
| `POST /api/swarm/upload` | raw bytes (`application/octet-stream`, ≤ 10 MiB) | `bee.uploadData(SWARM_BATCH_ID, bytes)` (bee-js) → `{ reference }` (plain, unencrypted upload of OUR ciphertext) |
| `GET /api/swarm/[ref]` | — | streams bytes from Bee/gateway (CORS-safe read path) |
| `POST /api/seals` | `{ draft, proof }` | `validateDraft`; proof signal must equal `ownerSignal("arm", sealId, issuedAt, draftDigest(draft))`, fresh; `verifyOwnerProof`; `writeArmedSeal(draft, humanId)` → `{ sealId, sealEntityKey, txHash, ownerNullifier }` |
| `POST /api/seals/[id]/checkin` | `{ proof }` | signal `ownerSignal("checkin", id, issuedAt)`; humanId must equal seal.ownerNullifier else 403 `different_human`; seal must be ARMED & have a heartbeat; `writeCheckin` |
| `POST /api/seals/[id]/disarm` | `{ proof }` | same checks; `writeDisarm` |
| `POST /api/seals/[id]/release-now` | `{ proof }` | same checks; `patchReleaseAt(now)` |
| `POST /api/seals/[id]/extend` | `{ proof, releaseAt }` | signal extra = `String(releaseAt)`; must be TIMER/BOTH and later than current; `patchReleaseAt` |
| `GET /api/seals/[id]` | — | `SealState` as JSON (Uint8Array → base64 strings: `cipherInlineB64`, `wrappedKeyB64`, `releasedKeyB64`) |
| `POST /api/seals/state` | `{ ids: string[] }` (≤ 50) | batch states (used by the extension; same JSON shape, keyed by id) |
| `GET /api/seals?owner=<humanId>` | — | seals by owner + states |
| `POST /api/reader/session` | `{ proof }` | signal `readerSignal(nonce, issuedAt)`; `verifyReaderProof` → `{ token, nationality, expiresAt }` (HMAC-SHA256 token over `{humanId, nationality, exp}` with READER_TOKEN_SECRET, 12 h) |
| `POST /api/reader/key` | `{ sealId, token }` | seal must be GATED and released (Arkiv `iigs.release` from MIRROR, or `isReleased` on Sepolia); token valid; nationality ∈ seal.countries → `{ keyB64 }` via `unwrapKey(wrapped, GATED_SECRET_KEY)`; else 403 `not_in_country` / 409 `not_released` |

Bigint/JSON: always convert to numbers/strings before `Response.json`.

## Pages
- `/` landing (pitch, how it works, links) · `/vault` dashboard (my seals: live countdowns, status chips, actions)
- `/vault/new` create seal (text or file; TIMER / HEARTBEAT / BOTH; presets 2 min / 5 min / 5 days; PUBLIC or country-gated; arm with World)
- `/s/[id]` public reader (sealed-until countdown, "armed by a verified human" badge, Arkiv entity + Swarm ref links, decrypts in the browser after release; gated → verify nationality)
- `/arm` — arms a draft handed over by the extension in the URL fragment: `/arm#d=<base64url(JSON SealDraft)>`; after success it does
  `window.postMessage({ source: "iigs-web", type: "IIGS_ARMED", sealId, ownerNullifier, post }, location.origin)`
- `/verify-reader` — reader nationality check; after success stores the token in `localStorage["iigs.reader"]` AND does
  `window.postMessage({ source: "iigs-web", type: "IIGS_READER_TOKEN", token, nationality, expiresAt }, location.origin)`
  (the extension's content script on the site origin listens and copies it into `chrome.storage.local`).

LocalStorage on the web app: `iigs.owner` = humanId of the author on this device; `iigs.seals` = JSON array of sealIds armed here.

## Demo presets
2 min, 5 min, 5 days. Heartbeat minimum 60 s. Sweeper cadence 30 s.
