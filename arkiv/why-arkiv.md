# Why Arkiv

1. **Expiration *is* our dead-man's switch.** A heartbeat is an entity that expires after the check-in interval. Arkiv's native
   expiry does the "if I go silent" part for us — no cron job of ours, no database row someone could quietly update.
2. **Public, owner-filtered, queryable state.** Anyone — the reader page, the extension, the Chainlink CRE workflow, a journalist
   double-checking us — can run the same query and get the same answer: is this seal armed, cancelled or released, and when is the
   next deadline? Trust comes from `$owner` filtering (only our World-verifier and release-mirror addresses count), not from our server.
3. **No database we can be forced to delete.** The threat model is a powerful adversary who wants evidence to disappear. A seized
   server, a subpoena or a hacked admin panel cannot erase entities on a public chain-backed store; ciphertext lives on Swarm, the
   release record on Sepolia.
4. **Typed, indexed attributes.** We filter by `dep`, `sealId`, `ownerNullifier` and the schema tag, and we page the release sweeper's
   bulk reads — something a log-only or blob store (IPFS) can't do without an extra indexer we would have to run and be trusted for.
5. **Cheap writes for frequent heartbeats.** Check-ins happen every few hours or days per seal; Arkiv makes each one a tiny
   short-lived entity instead of permanent chain state.
