# IF I GO SILENT: Build Plan (ETHGlobal Mumbai 2026)

> **One line:** a dead-man's switch for people who might be silenced. Sealed evidence and sealed social posts open **at a set time** or **if the author stops checking in**, optionally **only for readers from chosen countries**. Every "fate-changing" action needs a **live World ID check**. An **independent Chainlink CRE workflow** decides the release, and **Arkiv + Swarm** keep everything public and uncensorable.
>
> **Sponsor picks (locked):** Chainlink CRE · World (IDKit) · Arkiv (+ Swarm bonus)
> **Deadline:** **Sat Nov 7, 09:00 IST**. Plan for feature freeze at ~04:00 and video by ~07:00.

---

## 0. The pitch (memorize this)
> "In October 2017, Maltese journalist **Daphne Caruana Galizia** was killed by a car bomb. Her killers wanted her investigations to die with her. They didn't: **45 journalists from 18 outlets** finished them (The Daphne Project). But that took a nonprofit, a coalition, and luck.
> **IF I GO SILENT** makes it automatic. You seal your evidence or your post. If you stop checking in, or the timer runs out, it opens to the world, and nobody can stop it: not a government, not a hacker who steals your phone, not us.
> And because the switch is public, **the people who'd want to silence you know that silencing you publishes everything.** The switch protects you by existing."

Then go straight to the live demo (section 13).

---

## 1. What we're building (two surfaces, one engine)
| Surface | Who uses it | What it does |
|---|---|---|
| **A. The Vault** (web dashboard) | Journalists, whistleblowers, activists, anyone at risk | Seal files (evidence PDFs, photos, documents). Choose a release rule: **"if I go silent for N days"** (heartbeat) or **"at date/time T unless I cancel"** (timer). Check in with a face scan. Disarm, extend or release early. |
| **B. Silent Seal** (browser extension) | Anyone posting on X / Reddit (or any site) | Type "hello world", choose **"opens in 5 days"** and optionally **"only readers from 🇮🇳 India"**, and click Seal. The post shows up as sealed text. If you don't cancel from the dashboard, after 5 days **everyone with the extension sees the decrypted message right inside the X/Reddit feed**. Country-gated posts only open for readers who prove their nationality with World ID. |
| **Shared engine** | (invisible) | Encryption, key escrow, the **CRE release workflow**, Arkiv records, Swarm storage, World verification. |

### Release rules (any sealed item)
| Rule | Meaning | Example |
|---|---|---|
| **TIMER** | Opens at time T **unless the author disarms it** before T | "hello world", opens in 5 days |
| **HEARTBEAT** (dead-man) | Opens if the author **hasn't checked in for N hours/days** | Evidence that opens if I'm silent for 3 days |
| **TIMER + HEARTBEAT** (P1) | Opens at T **or** earlier if I go silent | A scheduled exposé that publishes early if something happens to me |

### Audience (who can read after release)
| Audience | Who can read | World credential |
|---|---|---|
| **PUBLIC** | Anyone (extension or web reader page) | none |
| **COUNTRY-GATED** | Only readers who prove nationality ∈ {chosen countries} | Passport / Identity Check with nationality |
| **HUMANS-ONLY** (P2) | Any verified unique human (blocks scraper bots) | Proof of Human |

### The golden rule
**Every action that changes a message's fate needs a live World ID check by the same human who sealed it:**
- arm
- check in
- disarm
- change the rule

A thief or coercer holding the phone can't do any of these.

---

## 2. Feature list with priorities
**P0 = must have for the demo · P1 = should have · P2 = stretch / roadmap**

### Vault (web app)
| # | Feature | Pri |
|---|---|---|
| V1 | Create a seal: upload a file **or** write text, then encrypt in the browser (the key never leaves the device unencrypted) | P0 |
| V2 | Choose rule TIMER (date/time) or HEARTBEAT (interval). Demo presets: 2 min / 5 min / 5 days | P0 |
| V3 | **Arm with World ID** (Selfie Check). Binds the seal to this human's nullifier | P0 |
| V4 | Encrypted file stored on **Swarm**. Metadata + status stored on **Arkiv** | P0 |
| V5 | Dashboard: list of seals with live countdowns (status ARMED / DISARMED / RELEASED) | P0 |
| V6 | **Check in** with World ID (resets heartbeat timers) | P0 |
| V7 | **Disarm** with World ID (cancels a seal forever) | P0 |
| V8 | **Public reader page** `/s/<id>`: shows "sealed until …" and an "armed by a verified human" badge, then decrypts in the browser after release | P0 |
| V9 | Audience: COUNTRY-GATED (pick countries) | P1 |
| V10 | Release early ("publish now", needs World ID) | P1 |
| V11 | TIMER + HEARTBEAT combined | P1 |
| V12 | Extend a timer (needs World ID) | P1 |
| V13 | **Duress check-in**: a special check-in that *looks* successful but triggers immediate release | P2 |
| V14 | Travel / pause mode (pause heartbeat up to X days, needs World ID) | P2 |
| V15 | Multiple independent verifiers / key holders (threshold) | P2 |
| V16 | Email/Telegram reminders before a heartbeat expires | P2 |

### Silent Seal (extension)
| # | Feature | Pri |
|---|---|---|
| E1 | Popup composer: text, timer (e.g., 5 days), optional countries, then **Seal**. The sealed text is inserted into the focused X/Reddit composer (clipboard fallback) | P0 |
| E2 | Sealed-post format: a short human-readable line plus a link `https://<domain>/s/<id>` and an inline token `⟦IIGS:<id>⟧` | P0 |
| E3 | Content script on x.com / reddit.com scans the feed (MutationObserver) for tokens and links, then queries Arkiv for status | P0 |
| E4 | Inline badges: 🔒 "Sealed · opens in 3d 4h · ✅ sealed by a verified human" / 🚫 "Cancelled by author" / 🔓 decrypted text rendered in place | P0 |
| E5 | Country-gated posts: "🌍 Visible to verified readers from IN". Click Verify, then World ID (once per reader, cached), then decrypt if allowed, or "Not available in your country" | P1 |
| E6 | Generic mode: works on any website (scan text nodes) | P1 |
| E7 | "My sealed posts" list in the popup (links to the dashboard) | P1 |
| E8 | Long messages and images go via Swarm instead of inline ciphertext | P2 |

> The dashboard is where the user **disarms** a post ("if I don't disable it from my dashboard, after 5 days anyone can view it"). The extension is just the **distribution channel**.

---

## 3. User flows
**Flow 1: Journalist seals evidence (HEARTBEAT)**
1. Opens the Vault, uploads `evidence.pdf`.
2. The browser encrypts it with a fresh key K, uploads the ciphertext to Swarm, and gets a Swarm reference.
3. Picks "if I'm silent for 3 days" and audience PUBLIC.
4. Taps "Arm". World ID Selfie Check on the phone. The backend verifies the proof and writes the Seal + the first CheckIn heartbeat to Arkiv.
5. The dashboard shows "ARMED · next check-in due in 3d".
6. Every couple of days she taps "I'm OK", does a face check, and the heartbeat is renewed.
7. **She goes silent.** The heartbeat expires and the CRE workflow sees no valid check-in, then releases key K. The reader page and extension can now decrypt `evidence.pdf`.

**Flow 2: Sealed social post (TIMER + country)**
1. In the extension: "hello world", opens in **5 days**, countries **🇮🇳 IN**, Seal. One World ID check (the first time), then the text is inserted into the X composer. Post.
2. Followers with the extension see 🔒 "Sealed · opens in 4d 23h · verified human".
3. If the author **disarms it from the dashboard** (World ID check), the post shows 🚫 forever, and the key is never released.
4. Otherwise, after 5 days the CRE marks it released (gated). A reader clicks "Verify nationality", passes World ID, and the key service checks IN ∈ allowlist and returns the key. The text appears decrypted in the feed. A reader from another country sees "Not available in your country".

**Flow 3: The attacker**
- Steals the journalist's phone and tries to check in or disarm. The World face check fails (or produces a different human's nullifier), so the request is refused, the heartbeat keeps running, and the evidence publishes on schedule.
- Seizes our server: the key escrow sits in the CRE workflow, not on our server (production story), and Arkiv + Swarm copies are public, so they can't "delete the database".

---

## 4. Architecture
```
                    ┌────────────────────────── WORLD (IDKit 4.x) ───────────────────────────┐
                    │ Selfie Check (owner actions)     Passport/Identity Check (reader nationality)│
                    └──────────────▲───────────────────────────────────▲──────────────────────┘
                                   │ proof                              │ proof
┌──────────────┐   seal/arm   ┌────┴──────────────────────┐   key?  ┌───┴──────────────────┐
│ Vault (web)  │─────────────►│ Backend (Next.js API)     │◄────────│ Silent Seal extension│
│ Next.js      │              │ • /api/world/verify       │         │ (WXT, MV3)           │
│ reader /s/id │              │ • Verifier: writes CheckIn│         │ compose ▸ seal ▸ post│
└──────┬───────┘              │   & Disarm to Arkiv       │         │ scan feed ▸ decrypt  │
       │ encrypted file       │ • Gated key service       │         └───┬──────────────────┘
       ▼                      │ • Release mirror (Sepolia │             │ reads status
┌──────────────┐              │   event ▸ Arkiv Release)  │             ▼
│ SWARM (Bee)  │◄── ref ──────┴──────┬────────────────────┘    ┌──────────────────────────┐
│ ciphertext   │                     │ writes                   │ ARKIV (Rabdi testnet)    │
└──────────────┘                     └─────────────────────────►│ Seal · CheckIn(expiring) │
                                                                │ Disarm · Release         │
                              ┌─────────────────────────────┐  └──────────▲───────────────┘
                              │ CHAINLINK CRE workflow       │   query    │
                              │ cron (every 30–60 s)         │────────────┘
                              │ • read ARMED seals (HTTP→Arkiv)
                              │ • decide: timer passed? heartbeat dead? disarmed?
                              │ • unwrap K (escrow secret) for PUBLIC seals
                              │ • runtime.report() → EVMClient.writeReport()
                              └──────────────┬──────────────┘
                                             ▼
                              ┌─────────────────────────────┐
                              │ SilentRelease.sol (Sepolia)  │  events: Released(id,key) /
                              │ ReceiverTemplate consumer    │          ReleasedGated(id)
                              └─────────────────────────────┘
```

**Key design choice: "the absence of data is the trigger."** A heartbeat is an Arkiv `CheckIn` entity whose **expiration = the check-in interval**. Checking in creates or extends it. If the author goes silent, **Arkiv expires the entity and it disappears from queries**. The CRE workflow sees "no live heartbeat" and releases. Arkiv's native expiration is the dead-man mechanism itself, which is our strongest `why-arkiv.md` argument.

**Which writes count?** Anyone can write entities under our schema name, and the owner's own wallet could be stolen. So **the CRE workflow and readers only trust `CheckIn` / `Disarm` / `Release` entities whose `$owner` is our known service addresses**, and the service only writes them after a successful World ID verification. A stolen device with the author's local key **can't** forge a check-in or disarm.

---

## 5. Data model (Arkiv)
Limits to respect:
- strings ≤ 128 bytes
- ≤ 128 KiB of `bytes` per write
- ≤ 32 attributes
- max expiration about 182.5 days
- everything public, so always filter by `$owner`

| Entity (schema) | Owner (`$owner`) | Attributes | Expiration |
|---|---|---|---|
| `iigs.seal` | author's local key (or service) | `sealId` str · `kind` str (TIMER/HEARTBEAT/BOTH) · `releaseAt` u64 · `intervalSec` u64 · `audience` str (PUBLIC/GATED) · `countries` str ("IN,MT") · `ownerNullifier` str (hex) · `contentType` str (inline/swarm) · `swarmRef` str (64-hex, ref of **our own ciphertext**) · `cipherInline` bytes · `wrappedKeyEscrow` bytes · `title` str · `createdAt` u64 | releaseAt + retention (or the max ~182 d) |
| `iigs.checkin` | **verifier service** | `sealId` · `at` u64 · `nullifierMatch` str (ok) | **= intervalSec** (heartbeat) |
| `iigs.disarm` | **verifier service** | `sealId` · `at` u64 | max |
| `iigs.release` | **release mirror** | `sealId` · `releasedAt` u64 · `key` bytes (PUBLIC only) · `gated` str · `sepoliaTx` str | max |

**Queries the product actually uses** (needed for the Arkiv prize: user-facing features must read from Arkiv):
- Extension or reader page: `select iigs.seal where sealId = X` plus `select iigs.release where sealId = X and $owner = MIRROR`
- CRE: `select iigs.seal where kind != … ` (all ARMED), then for each: `select iigs.checkin where sealId = X and $owner = VERIFIER` (empty means the heartbeat is dead)
- Dashboard: `select iigs.seal ownedBy(myKey)`, plus status joins

---

## 6. Crypto design (simple and auditable)
| Piece | Choice | Library |
|---|---|---|
| Content encryption | XChaCha20-Poly1305 (or AES-256-GCM) with a fresh random key **K** per seal | `@noble/ciphers` |
| Key escrow (PUBLIC seals) | K is wrapped to the **escrow public key** (X25519 sealed-box style). The escrow private key lives **only as a CRE secret** (`runtime.getSecret`) | `@noble/curves` (x25519) + `@noble/hashes` |
| Key escrow (GATED seals) | K is wrapped to the **gated key-service public key**. The service releases it only after an onchain gated-release flag **and** a valid World nationality proof | same |
| Inline post format | `🔒 Sealed by a verified human · opens <date> · <domain>/s/<id> ⟦IIGS:<id>⟧`. Short texts keep the ciphertext in Arkiv (`cipherInline`); long texts and files go to Swarm | — |
| Swarm safety | We upload **our own ciphertext** (plain Swarm upload), so the Swarm ref in Arkiv reveals nothing. ⚠️ **Never** store a Swarm *encrypted-upload* reference in an entity, because it contains its own key (Arkiv's explicit warning) | `@ethersphere/bee-js` |

Why `@noble/*`: pure JS, audited, and the same code runs in the browser, the extension, Node, and (very likely) inside the CRE workflow runtime. **Test that in the first 2 hours.**

---

## 7. The release engine (Chainlink CRE)
**Workflow `release-sweeper` (TypeScript), cron trigger every 30–60 s (CRE minimum is 30 s):**
```
on cron:
  seals = HTTP → Arkiv: all iigs.seal with status ARMED            (runtime.http.sendRequest)
  for seal in seals:
    if exists iigs.disarm(sealId, owner=VERIFIER): skip (cancelled)
    timerDue     = seal.kind has TIMER     and now >= seal.releaseAt
    heartbeatDead= seal.kind has HEARTBEAT and no live iigs.checkin(sealId, owner=VERIFIER)
    if timerDue or heartbeatDead:
       if seal.audience == PUBLIC: K = unwrap(seal.wrappedKeyEscrow, getSecret("ESCROW_SK"))
                                   report = encode(sealId, K)
       else:                       report = encode(sealId, GATED)
       runtime.report(report) → EVMClient.writeReport(SilentRelease, Sepolia)
```
**`SilentRelease.sol`** (Foundry, Sepolia; consumer via `ReceiverTemplate` / `IReceiver`):
- `onReport` stores `released[sealId]` and emits `Released(sealId, key)` or `ReleasedGated(sealId)`.
- It's idempotent (it can't release twice).
- Only the CRE forwarder can call it.

**Release mirror** (small Node worker): watches the Sepolia events with viem `watchContractEvent` and writes an `iigs.release` entity to Arkiv. Anyone can run this mirror, because the contract is the source of truth.

**Demo reality (say it in Q&A):** during the hackathon the workflow runs with `cre workflow simulate`, and a small runner script invokes it every ~30 s. In production it's **deployed to the CRE network** (a DON with consensus) and the escrow key lives in CRE's confidential secrets/TEE, so **no single party, including us, can release early or suppress a release.**

**Fallback if crypto doesn't run inside the CRE runtime:** CRE only decides and writes `Released(sealId)` (DON consensus that the rule fired). The mirror holds the escrow key and publishes K. That's still meaningful orchestration, with a weaker trust story, and we state that honestly.

---

## 8. The extension (Silent Seal)
- **Framework:** **WXT** (wxt.dev, Vite-based, MV3) + React + TypeScript. Shares `packages/core` with the web app.
- **Permissions:** `storage`, `activeTab`, `scripting`. Host permissions for `https://x.com/*`, `https://twitter.com/*`, `https://www.reddit.com/*` (optional `<all_urls>` for generic mode).
- **Compose (E1):**
  - Popup form (text, timer, countries) → `POST /api/seal` (the backend encrypts? **No**: encrypt **in the extension**, send only ciphertext + wrapped keys).
  - Inserts the sealed line into the focused composer with `document.execCommand('insertText', …)`, which works with X and Reddit rich editors. Clipboard fallback.
- **Read (E3–E5):**
  - A content script with a `MutationObserver` finds `⟦IIGS:<id>⟧` or `/s/<id>` in posts.
  - It batch-queries Arkiv (via the SDK or a tiny backend proxy if CORS blocks it), caches results, and renders a badge or the decrypted text inline (Shadow DOM so the site's CSS doesn't clash).
- **Reader World verification:** "Verify nationality" opens a tab on our site with the IDKit widget (more reliable than inside a popup). The backend verifies and returns a short-lived reader session token, stored in `chrome.storage.local`.
- **Non-extension users** click the link and see the **web reader page** (countdown, then decrypt). That's our growth loop, and it doubles as Arkiv "Reach" evidence.

---

## 9. World ID design (which credential, and why it's the *minimum sufficient*)
| Trust moment | Credential | Why this one (World judges reward this reasoning) | Alternative path we demo |
|---|---|---|---|
| **Arm / check in / disarm / change rule** | **Selfie Check** (face-bound, live presence) | The risk is "someone else is holding my phone". We need proof that **the same live human** is present. Orb is overkill; a passport proves nothing about presence. | Thief's face fails, so the check-in is refused and the heartbeat keeps running |
| **Read a country-gated post** | **Passport / Identity Check with nationality** | The question is "is this reader a national of X?", and nationality is exactly what's proven, nothing more (no name, no birthdate) | A reader from another country sees "not available in your country" |
| **Humans-only read** (P2) | **Proof of Human** | Only "is this a unique person?" matters (anti-scraping) | Bot or session without proof is refused |

**Same-human binding:**
- At arm time we store the nullifier for action `iigs-owner`.
- Every owner action requests a proof for the **same action**, so the same human yields the same nullifier, and we check it matches.
- The proof's **signal** = `hash(sealId, actionType, nonce)` so a proof can't be replayed.
- Verify **server-side** at `POST https://developer.world.org/api/v4/verify/{rp_id}` (never trust a client callback).
- ⚠️ Confirm at the World booth that repeated proofs for the same action are allowed. Alternative: use session proofs.

⚠️ **Must verify on day 1 at the World booth:**
1. `identityCheck` / passport **nationality** support in the sandbox or simulator (it's "Preview" in the docs).
2. Whether a nationality *allowlist* can be requested directly.

Fallback if it isn't available: ship country-gating as "P1, behind a flag" and demo it with the World ID Simulator, or move it to the roadmap.

**Optional upgrade (free, same sponsor pick):** run owner actions through **World IdP step-up** (`auth.world.org` OIDC, `acr=selfie-face`, stable sector-scoped `sub`). That also qualifies us for **World ID Agent Pass ($5k)**. Only do this if P0 is done.

---

## 10. 🏆 SPONSOR TRACKS WE ARE USING (keep these requirements in front of us)

### 10.1 Chainlink: **Best workflow with CRE**: $1,500
**Official requirements (Mumbai prize page):**
- [ ] Build, **simulate**, or deploy a CRE workflow used as an **orchestration layer** within the project ("simulation is enough!")
- [ ] The workflow integrates **at least one blockchain** with an **external API / system / data source / LLM / agent**
- [ ] Demonstrate a **successful simulation (CRE CLI)** or a live deployment on the CRE network
- [ ] It must be **meaningfully used** in the project

**How we satisfy it:**
- CRE *is* the release authority: cron → HTTP read of **Arkiv** (external system) → decision → **`writeReport` to Sepolia** (blockchain).
- Without CRE nothing ever releases, so it's load-bearing.

**Tech:**
- CLI: `curl -sSL https://app.chain.link/cre/install.sh | bash`, then `cre init`, then `cre workflow simulate`
- TS SDK: `cre.capabilities.cron.trigger({ schedule })`, `runtime.http.sendRequest`, `runtime.getSecret`, `runtime.report()` + `EVMClient.writeReport()`
- Consumer contract via `ReceiverTemplate` / `IReceiver`
- ⚠️ Verify the exact SDK package name from `cre init`, and that **Sepolia** (or Base Sepolia) is a supported chain selector

**Show it:**
- In the video, the **terminal running `cre workflow simulate`** (decision log) next to the Sepolia tx.
- In the README, the workflow file path, the contract address, and one release tx hash.

**Docs:** https://docs.chain.link/cre · templates https://github.com/smartcontractkit/cre-templates/

### 10.2 World: **Best Use of IDKit**: $2,500 (up to 2 teams × $1,250)
*(Optional same-pick extra: **World ID Agent Pass** $5k, if we do the World IdP step-up from section 9.)*

**Official requirements:**
- [ ] Integrate **IDKit** in a functioning application, mini app, or onchain flow
- [ ] Use at least one supported World ID credential and **verify the result on the server** or onchain
- [ ] **Explain the specific product event requiring trust** and **why the chosen credential is the minimum sufficient assurance**
- [ ] Demonstrate a **successful verification** and **one meaningful alternative path** (cancellation, unavailable credential, rejection, ineligible user)
- [ ] Include an **integration debrief**: time to first success, friction, missing capability or docs, the one improvement with the greatest impact. Put it in `WORLD_FEEDBACK.md` and the submission.

**How we satisfy it:**
- Two trust moments with two different, justified credentials (Selfie Check for owner actions, nationality for gated readers). The table in section 9 goes **verbatim into the README**.
- Alternative paths: the thief's check-in is rejected; a reader from another country is refused.

**Tech:**
- `@worldcoin/idkit` (React `IDKitRequestWidget`) + `@worldcoin/idkit-core`
- Backend `signRequest` → `rp_context`, then verify via `/api/v4/verify/{rp_id}`
- Nullifiers stored `UNIQUE(nullifier, action)` (`NUMERIC(78,0)`)
- Developer Portal (app_id, actions), World ID Simulator, iOS sandbox app (TestFlight)

**Docs:** https://docs.world.org/world-id/idkit/integrate · https://docs.world.org/world-id/idkit/credentials · https://docs.world.org/world-id/credentials/11 (Selfie) · https://docs.world.org/world-id/credentials/9303 (Passport)

### 10.3 Arkiv: **Build on Arkiv (from scratch)**: $4,000 (1st $3k, 2nd $1k) **+ Arkiv × Swarm bonus $500** (stackable, doesn't use a pick)
**Official requirements:**
- [ ] Built **from scratch at ETHGlobal Mumbai**, following ETHGlobal rules
- [ ] Writes to **Arkiv's current testnet** with `@arkiv-network/sdk` or JSON-RPC
- [ ] **At least one feature users see reads its data from Arkiv** ("Not counted: SDK installed but never used to read, or Arkiv used only as a log nothing reads")
- [ ] README: the **wallet address(es) that wrote the entities** + **one example query**
- [ ] `/arkiv/schema.md` and `/arkiv/friction.md`, plus one file per judging criterion
- [ ] Public repo with an **open-source license**; **say how AI was used**
- [ ] One Arkiv track prize per team (the Swarm bonus can stack)

**Judging (25% each), so write these files carefully:**
- `/arkiv/friction.md`: honest feedback on the SDK, docs, faucet and query language
- `/arkiv/reach.md`: who uses it and how it spreads (extension users, reader-page visits, sealed posts in the wild)
- `/arkiv/why-arkiv.md`: **"expiration *is* our dead-man's switch; public, owner-filtered, queryable state; no database we can be forced to delete"**
- `/arkiv/how-you-use-arkiv.md`: entities, queries, expiry and owner filtering (copy section 5)

**Swarm bonus**, `/arkiv/swarm.md` must cover:
- what's on Swarm vs Arkiv, and **which entity field holds the reference** (`iigs.seal.swarmRef`)
- **one entity key and its Swarm reference with a link**
- the **postage batch ID and the wallet that bought it**
- the **Bee node / service used**
- which files upload and read
- **steps to run one upload and one read**
- **the demo timestamp where Swarm is used**
- what got in the way

**Tech:**
- Arkiv:
  - `@arkiv-network/sdk` (viem-based): `createWalletClient` / `createPublicClient` with `rabdi({ accessKey })`, `defineSchema`, `createEntity`, `patchEntity`, `select().from().ownedBy().fetch()`, `ExpirationTime.fromDays()` / from blocks
  - RPC `https://rpc.rabdi.db-chain.testnet.arkiv.network`, chain **7794095**
  - Faucet `https://hub.arkiv.network/faucet`, access keys `https://hub.arkiv.network/access-keys`
  - MCP / AI tools `https://hub.arkiv.network/ai-tools`
  - ⚠️ Check the exact "extend expiration" call name in the docs
- Swarm:
  - `@ethersphere/bee-js` 12.x + a **Bee 2.8.x** node (Docker `ethersphere/bee`, testnet on **Sepolia**, needs Sepolia ETH + **sBZZ** from the Swarm Discord `#faucet`)
  - `bee.uploadData(batchId, bytes)` → `reference`, then `bee.downloadData(ref)`
  - ⚠️ **A fresh postage batch takes several minutes to become usable, so buy it in hour 0.** Ask at the Arkiv booth whether they provide a Bee endpoint or stamps.

**Docs:** https://docs.arkiv.network · https://docs.ethswarm.org · https://bee-js.ethswarm.org/docs/upload-download/

---

## 11. Tech stack (exact)
| Layer | Choice |
|---|---|
| Monorepo | **pnpm workspaces** (+ Turborepo optional) |
| Web app | **Next.js (App Router) + TypeScript + Tailwind + shadcn/ui**, deployed on Vercel |
| Backend | Next.js API routes (verify, verifier writes, gated key service) + a small **Node worker** (release mirror, CRE runner) on Railway or locally |
| Extension | **WXT + React + TypeScript (MV3)** |
| Crypto | `@noble/ciphers`, `@noble/curves`, `@noble/hashes` |
| Identity | `@worldcoin/idkit`, `@worldcoin/idkit-core` |
| Data | `@arkiv-network/sdk` (Rabdi testnet) |
| Storage | `@ethersphere/bee-js` + a Bee node (Sepolia testnet) |
| Orchestration | Chainlink **CRE CLI + TS SDK**, workflow `release-sweeper` |
| Contracts | **Foundry**, `SilentRelease.sol` on **Sepolia** |
| Chain I/O | **viem** (contract reads, event watching) |
| AI coding tools | Claude Code etc. **Attribute this in the README and keep prompts/specs in `/docs/ai/`** (ETHGlobal rule) |

## 12. Repo layout
```
if-i-go-silent/
├─ apps/web/            # Vault dashboard, /s/[id] reader, API routes
├─ apps/extension/      # WXT extension (popup composer + content scripts)
├─ apps/worker/         # release mirror (Sepolia → Arkiv) + CRE sim runner
├─ packages/core/       # seal/unseal, key wrap, post format, Arkiv schemas & queries, types
├─ workflows/release-sweeper/   # CRE workflow (TS) + config + secrets template
├─ contracts/           # Foundry: SilentRelease.sol + tests + deploy script
├─ arkiv/               # schema.md friction.md reach.md why-arkiv.md how-you-use-arkiv.md swarm.md
├─ docs/                # architecture diagram, ai/ (prompts, specs), threat-model.md
├─ WORLD_FEEDBACK.md    # IDKit integration debrief
├─ LICENSE (MIT)  README.md
```

---

## 13. Build timeline (until Sat 09:00 IST)
Assumes 4 people:
- **A**: CRE + contract
- **B**: Arkiv + Swarm + core crypto
- **C**: World + backend
- **D**: extension + UI + video

With 3 people, C and D share the UI. Hours are relative to kickoff (**H0 = now**). **Commit every hour.**

| When | A (CRE/contract) | B (Arkiv/Swarm/core) | C (World/backend) | D (extension/UI) |
|---|---|---|---|---|
| **H0–2: risk spikes** | `cre init` + simulate a cron+HTTP hello world; test `@noble` inside the workflow | **Buy the Swarm postage batch first**; Arkiv write/read/expire + `ownedBy` query | IDKit Selfie verify on the sandbox; **ask the World booth about nationality** | WXT skeleton; inject a button and insert text into the X composer |
| H2–6 | `SilentRelease.sol` + tests + Sepolia deploy; `writeReport` round trip | `packages/core`: seal/unseal, key wrap, Arkiv schemas + queries | Verifier service: arm / check-in / disarm then Arkiv writes | Vault UI: create seal, list, countdowns |
| H6–10 | Full `release-sweeper` logic (TIMER + HEARTBEAT, PUBLIC) | Swarm upload/download for files; reader page decrypt | Release mirror (event → Arkiv) | Extension content script: detect tokens, badges, decrypt inline |
| **H10: integration checkpoint** | **End-to-end PUBLIC flow works: seal → post → silence → release → decrypt in X** | | | |
| H10–14 | CRE runner every 30 s; gated release path | `/arkiv/*.md` drafts | **Country-gated**: reader verify + key service | Extension: gated flow + "not in your country" |
| H14–17 | Hardening, idempotency, README section | `swarm.md` (batch ID, wallet, refs) | `WORLD_FEEDBACK.md`; thief path demo | UI polish, generic-site mode (P1) |
| **~04:00: FEATURE FREEZE** | | | | |
| 04:00–07:00 | Architecture diagram | Final docs + addresses + example query | Rehearse the demo with real phones | **Record the 2:45–2:59 video** (human voice, screen-recorded) |
| 07:00–08:30 | **Submit:** title, description, repo, video, **select Chainlink + World + Arkiv (+ Swarm bonus)**, choose the **Finalist + Partner** path. Paste the World debrief. | | | |

**Cut order if behind:**
1. Generic-site mode
2. TIMER + HEARTBEAT combo
3. Reddit (keep X)
4. Country gating (keep as a flagged demo)
5. Files via Swarm (use inline Arkiv bytes, ≤128 KiB). ⚠️ This loses the $500 Swarm bonus, so cut it last.

---

## 14. Demo script (4 minutes, Finalist judging)
1. **0:00–0:25 The story.** Daphne Caruana Galizia, 45 journalists, "killing the messenger shouldn't kill the message."
2. **0:25–1:15 Seal.**
   - The "journalist" uploads `evidence.pdf` and picks "silent for 2 min".
   - **Face scan on a real phone** (World), then ARMED. Show the Arkiv entity in the explorer.
   - She also posts on **X** via the extension: "hello Mumbai 👋", opens in 3 min, 🇮🇳 only. A second screen shows the sealed post with "🔒 · verified human".
3. **1:15–1:45 The thief.** A teammate grabs her phone and tries to disarm. The face check fails and the heartbeat keeps running.
4. **1:45–2:45 She goes silent.**
   - She walks off stage. A countdown is on screen.
   - **The CRE terminal logs "heartbeat dead → releasing"**, then the Sepolia tx appears.
   - **The evidence opens by itself** on the public reader page.
5. **2:45–3:30 The social post opens.**
   - The X feed: the sealed post **turns into "hello Mumbai 👋" right in the timeline**, for a judge who verifies nationality with World ID.
   - A reader with another nationality sees "not available in your country".
6. **3:30–4:00 Close.** "No server we own decides. Chainlink CRE decides, Arkiv remembers, Swarm stores, and World proves it was really her. **The switch protects you by existing.**"

**Video (2:45–2:59):** the same beats, compressed. Show the **CRE simulate output**, the **Arkiv entity / query**, the **Swarm ref**, and the **World verification + rejection**: one clear shot per sponsor.

---

## 15. Q&A prep (the hard questions)
| Question | Answer |
|---|---|
| "Who holds the key before release?" | In production, a CRE confidential workflow (DON + TEE secrets), not us. In this demo it's a CRE secret in simulation. We built the fallback and say so. |
| "What if your servers are seized?" | Seal records are public on Arkiv, ciphertext is on Swarm, and the release decision is on CRE / Sepolia. Our backend only verifies World proofs. Roadmap: multiple independent verifiers (P2). |
| "What if she's forced to check in?" | World proves presence, not free will. That's why we have a **duress check-in** (P2) that looks normal but triggers immediate release. |
| "Why not just timelock encryption (drand)?" | Timelock can't be **cancelled** or **renewed by a heartbeat**. Once the round passes, anyone decrypts. We need "release *unless* the human acts", which needs an independent decider. (Roadmap: tlock + CRE double-lock so even the DON can't open early.) |
| "Can a gated reader leak the text?" | Yes. Gating controls **who gets first, verified access**, not copying. It's for targeting an audience (e.g., citizens of the country the story is about), not DRM. |
| "Isn't the 'armed' status a risk?" | It's the **deterrent**. Like an insurance file, the switch works because adversaries know it exists. Content stays encrypted. |
| "How is this different from Lortnoc Tahc (Tokyo winner)?" | Lortnoc hides messages for **access-controlled reading now** (steganography plus World/ENS rules). Ours decides **when** a message opens, based on **time and the author's continued presence**, with an independent CRE release oracle, Arkiv heartbeats and country-gated release. The extension is just one distribution channel; the product is the switch. |
| "Why Arkiv instead of a database or IPFS?" | Expiring entities give us the heartbeat. Public owner-filtered queries mean anyone can verify status. And there's no single operator who can be forced to delete. |

---

## 16. Risks & fallbacks
| Risk | Fallback |
|---|---|
| Swarm testnet stamps slow or unavailable | Ask the Arkiv booth; otherwise inline ciphertext in Arkiv `bytes` (≤128 KiB) and drop the $500 bonus |
| `@noble` crypto doesn't run in the CRE runtime | CRE writes `Released(sealId)` only; the mirror unwraps and publishes K (state the weaker trust) |
| World nationality (Identity Check) not available | Country gating behind a flag, demoed with the simulator, or moved to the roadmap. The core demo still works. |
| X composer insertion breaks | Clipboard fallback ("Copied, paste it"); Reddit as a backup site |
| CRE chain support | Use whichever EVM testnet CRE supports (check `cre` config); the contract is chain-agnostic |
| Arkiv CORS from the extension | Route reads through `/api/arkiv-proxy` (still Arkiv data; document it) |
| Time | Follow the cut order in section 13. Never cut the HEARTBEAT → CRE → release → decrypt path. |

## 17. Submission checklist
- [ ] Public repo, MIT license, **steady commit history**
- [ ] README: pitch, architecture diagram, **World credential table (section 9)**, CRE workflow path + contract address + release tx, **Arkiv writer addresses + one query**, Swarm batch ID + ref, how to run
- [ ] **AI attribution** section + `/docs/ai/` prompts and specs
- [ ] `/arkiv/schema.md`, `friction.md`, `reach.md`, `why-arkiv.md`, `how-you-use-arkiv.md`, `swarm.md`
- [ ] `WORLD_FEEDBACK.md` (time to first success, friction, missing docs, top improvement)
- [ ] Demo video **2:45–2:59**, ≥720p, human voice, no TTS, screen-recorded
- [ ] Live demo link (Vercel) + extension `.zip` / load-unpacked instructions
- [ ] Prize selection: **Chainlink CRE · World IDKit (+ Agent Pass if done) · Arkiv Build on Arkiv + Arkiv × Swarm bonus**
- [ ] Path: **Finalist + Partner Prizes**

### Sources
- Mumbai prize requirements: `context/01_prizes_full.md` (from https://ethglobal.com/events/mumbai/prizes)
- Tech details: `context/02a_tech_identity_privacy_data.md`, `context/02b_tech_payments_ai_defi.md`
- CRE SDK (cron, HTTP, report/writeReport, simulate): https://docs.chain.link/cre/reference/sdk/core-ts · https://docs.chain.link/cre/overview.md
- bee-js upload/download: https://bee-js.ethswarm.org/docs/upload-download/ · Swarm docs https://docs.ethswarm.org/docs/develop/access-the-swarm/introduction
- World ID passport credential / nationality attributes: https://www.biometricupdate.com/202412/world-id-keeps-growing-with-passport-credential-option
- The Daphne Project: https://en.wikipedia.org/wiki/The_Daphne_Project
- Tokyo comparison (Lortnoc Tahc): `winningideas.md` #13
