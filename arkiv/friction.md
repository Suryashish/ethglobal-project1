# Arkiv — friction log (honest)

What worked well
- The 1.0 SDK is excellent: typed schemas (`defineSchema`), a query builder checked against the schema at compile time, `executeBatch`
  (we create a seal and its first heartbeat atomically), `ExpirationTime.fromSeconds`, and clear errors.
- Reads against Rabdi worked on the first try; the RPC sends CORS `*`, so the reader page can query Arkiv straight from the browser.
- `ghcr.io/arkiv-network/arkiv-reth-dev` gave us a full local node for end-to-end tests without faucet funds.

Friction
1. **Reserved words**: `key` is reserved in the query language, so an attribute named `key` can't be used — we found it in
   `names.ts`, not the docs. A lint-time error message in `defineSchema` would help (it does throw at runtime).
2. **No `in` operator** for a list of values; batch lookups need `or(eq(...), eq(...), …)`.
3. **Raw JSON-RPC for non-SDK runtimes** (our Chainlink CRE workflow compiles to WASM and can't use the SDK): the `arkiv_query` string
   format and `select` options aren't documented outside the SDK source; we reverse-engineered them from `DEBUG=arkiv:*` logs.
4. **Local dev node**: finding the right image took a while (the `arkiv-op-node` repo's docker-compose still uses the old `golembase`
   API). The dev image defaults to 250 ms blocks while the SDK converts durations at 2 s/block, so expirations run 8× fast unless you pass
   `--dev.block-time 2s` — worth a note in the docs.
5. **Faucet / access keys** require the hub UI — no CLI or API path for automated test setups.
6. Expiration is block-granular (2 s), so a heartbeat can outlive its nominal deadline by up to one block; we store `expiresAtSec`
   explicitly for the UI.
