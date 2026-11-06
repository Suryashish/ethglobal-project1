# Agent briefs (condensed)

User prompt to the lead agent: "Start building on this project properly, use Next and other technologies as required, test things
properly, keep verifying that they are working, test the workflows, build this exactly as planned, make sure content media can be
uploaded to Swarm. The whole plan is in if-i-go-silent-plan.md. Use Sonnet sub-agents to go fast; make sure things are accurate."

Every sub-agent was told: read the plan and `docs/ai/spec.md`; own only its directory; code against `@iigs/core` without modifying it;
test rigorously and report exact commands + results + anything unverified.

1. **Contract + CRE** — verify `SilentRelease.sol` against Chainlink's IReceiver/ReceiverTemplate (metadata layout), forge tests, deploy
   script with the Sepolia (Mock)KeystoneForwarder; build the `release-sweeper` TS workflow: cron 30 s → raw `arkiv_query` over the CRE
   HTTP capability → `decideRelease` → X25519 unwrap with a CRE secret → `abi.encode(ReleaseItem[])` → `writeReport`; spike whether
   @noble + viem run in the CRE WASM runtime; tests incl. cross-compat with core's `wrapKey`.
2. **World ID** — research IDKit 4.6 (Selfie Check, nationality via Identity Check, same-human binding, signals, v4 verify, simulator);
   implement live mode + a dev simulator behind the fixed interface; server-side verification; tests; integration doc + WORLD_FEEDBACK.md.
3. **Web app** — every API route and page in the spec; browser-side Arkiv reads on the reader page; Swarm via bee-js; serious dark UI;
   unit tests for auth/thief/gated logic; curl every route; headless page checks.
4. **Extension** — WXT MV3 popup composer, `/arm` handoff, bridge content script, X/Reddit feed scanning with Shadow-DOM cards,
   decrypt-in-place, gated reader flow, composer insertion; unit + Chrome-for-Testing E2E.
5. **Worker** — release mirror (events → Arkiv, idempotent, cursor), CRE simulate runner, dev sweeper fallback; unit + anvil integration.
6. **Browser QA** — drive the real pages and the real extension against the running local stack; fix root causes.
