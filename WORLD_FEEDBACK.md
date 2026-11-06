# World ID / IDKit integration debrief

Project: IF I GO SILENT (dead-man's switch). Credentials: Selfie Check (owner actions), Identity Check nationality (country-gated readers).

## What was and was not verified
- **Verified locally in this session**: IDKit 4.6 typings (presets, widgets, session API); `signRequest` runs offline and returns `{sig, nonce, createdAt, expiresAt}`; `hashSignal`; server logic with `fetch` mocked against the request/response shapes in the `/api/v4/verify` OpenAPI (20 vitest tests: owner, reader, signal/kind/mode/env mismatch, replay, failure mapping).
- **Not verified live**: no Developer Portal app, RP, signing key or phone was available while building, so no real proof has gone through the Portal yet. Whether Identity Check nationality is enabled, how the Portal reports it, and whether the simulator supports 4.0 sessions are from docs only.

## Time to first success
Docs-reading to a mocked end-to-end server verification: about 1.5 hours. Time to a real first proof: not measured (blocked on Portal credentials and Selfie Check / Identity Check enablement).

## Friction
1. **Selfie Check + "same human, repeatedly" is not obvious.** The classic mental model (store nullifier, compare later) breaks in 4.0: uniqueness proofs are single-use per action. The answer is buried in `/idkit/session-proofs` and a line in the Selfie Check page; the integrate guide never mentions it. We redesigned our binding around `session_id`.
2. **Docs disagree with the SDK about the preset.** `credentials` says use `selfieCheck()` preset for one-time checks but `CredentialRequest("selfie")` + sessions for recurring; the 4.6 README calls `selfieCheck` the primary path. Sessions cannot use `.preset(...)` (constraints only), so the "preset" mental model does not carry over.
3. **Identity Check is the only way to ask for nationality, and it is a single-attribute equality (alpha-3).** No allowlist, no `any([...])` over identity attributes (it is a preset, not a constraint), so a country-gated post needs the reader to pick a country first. The result carries `identity_attested` but I could not find where the Portal says which attributes were attested, so the server has to trust the client-claimed country plus the boolean.
4. **Signal handling differs by preset**: `identityCheck` only takes `legacy_signal`; it is unclear whether the 4.0 proof commits to anything, so we added a server-issued-nonce check.
5. **Staging story is split**: `integrate` says simulator + `environment: "staging"`; the new Sandbox section needs TestFlight/Play access and says verify against the production endpoint; the simulator page says "staging only" and Selfie Check testing is documented only for Sandbox. It was unclear which one can produce a Selfie Check session proof without a phone.
6. Error documentation for `/v4/verify` lists three examples only; max-verifications / nullifier-replay failures are not specified there, only as IDKit client codes, so server error mapping is by substring.

## Missing capability or docs
- A documented way to verify a country allowlist (or multiple nationalities) in one request.
- A Portal response field listing attested identity attributes and the signal for Identity Check.
- A hosted simulator path for Selfie Check sessions, and a single "testing matrix" page (credential x environment x simulator/sandbox).
- Docs for how the Portal "max verifications" setting works in 4.0 (it appears in error codes but not in setup docs).

## Single improvement with the greatest impact
A "repeated checks by the same human" recipe on the main integrate page, with a decision table: uniqueness (once per action) vs session (returning human), including the Selfie Check example end to end and which verify fields to store (`session_id`) versus not (`session_nullifier`). It would have saved the most time and prevents an entire class of broken designs.
