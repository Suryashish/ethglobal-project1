# Reach — who uses it and how it spreads

**Who**: journalists, whistleblowers, activists and anyone at risk who needs "if something happens to me, this comes out" — plus ordinary
social users who want time-capsule posts ("opens in 5 days", "only readers from 🇮🇳 India").

**How it spreads**
1. **Every sealed post travels in plain sight.** The extension inserts a *hidden post* into the author's X / Reddit composer: two
   ordinary-looking sentences ("Amber rivers wander slowly beneath the patient lantern. Softly, golden foxes drift toward the quiet
   harbor.") that encode the seal id ([`packages/core/src/cover.ts`](../packages/core/src/cover.ts)). Before release nothing marks it as a
   seal, so it is never taken down for what it says. Every follower carries it in their feed. When the seal opens, every extension user
   who scrolls past it sees the decrypted text right under the post. Authors who *want* the switch to be seen (see 3) share the
   public reader page `/s/<id>` instead, which shows a live countdown read straight from Arkiv.
2. **The extension turns feeds into Arkiv readers.** Each extension user's feed silently queries Arkiv for every hidden post it shows —
   reads scale with audience size, not with authors.
3. **Deterrence is public by design.** A journalist announces "my files are sealed; if I go silent they open" and links the reader page.
   The switch only works because people can see it — so being seen is the product.
4. **Newsrooms and NGOs** (press-freedom groups, legal-aid orgs) can arm seals for their at-risk reporters and run their own mirror.

## Numbers so far (live on Arkiv Rabdi, deployment `dep = "dev"`, read 2026-11-06 23:58 UTC)
These are our own end-to-end and demo runs during the hackathon, not outside users yet. All of them come from the queries below, with
no analytics server involved.

| What | Count |
|---|---|
| Seals armed (`iigs.seal`, VERIFIER-owned) | **40**: 20 TIMER · 19 HEARTBEAT · 1 BOTH |
| Audience | 34 PUBLIC · 6 country-gated (🇮🇳 IN ×6, 🇮🇩 ID ×1) |
| Where the ciphertext lives | 26 inline on Arkiv · 14 on Swarm |
| Created from | 38 Vault (web app) · 2 Silent Seal extension |
| Live heartbeats right now (`iigs.checkin` not yet expired) | **2** |
| Cancelled by the author (`iigs.disarm`) | 4 |
| Released by Chainlink CRE (`iigs.release`, MIRROR-owned) | **35 seals** (29 public, 6 gated) |

Run them yourself (raw JSON-RPC, no SDK or account needed):
```bash
q() { curl -s https://rpc.rabdi.db-chain.testnet.arkiv.network -H 'content-type: application/json' --data \
  "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"arkiv_query\",\"params\":[\"arkiv.schema = str('$1') AND dep = str('dev') AND \$owner = addr($2)\",{\"select\":{\"key\":true},\"limit\":\"0x64\"}]}" \
  | python3 -c 'import sys,json; print(len(json.load(sys.stdin)["result"]["data"]))'; }
q iigs.seal    0xF87fC983a8D75c67cdF4E0f80b1507a74A21fBD8   # seals armed
q iigs.checkin 0xF87fC983a8D75c67cdF4E0f80b1507a74A21fBD8   # live heartbeats (expired ones are gone: that IS the switch)
q iigs.disarm  0xF87fC983a8D75c67cdF4E0f80b1507a74A21fBD8   # cancellations
q iigs.release 0x9b95d050D551C8836578f32d92508467E7dA1638   # releases (count distinct sealId for seals; a few were mirrored twice)
```
Browse any entity in the explorer: https://rabdi.explorer.arkiv.network (e.g. a released seal:
[`0x4a376b74…4698`](https://rabdi.explorer.arkiv.network/entity/0x4a376b747355b5f252ae65dc6782bdbb5a0bd128de8696b3e2ae39bce58d4698)).

**What we will measure after launch** (same queries): seals armed, live heartbeats, posts that opened, and reader-page / extension reads.
