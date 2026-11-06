# World ID integration (IDKit 4.6)

Package: `packages/world` (`@iigs/world`). Mock mode (default) works with no account; live mode talks to World ID 4.0.
Sources: docs.world.org `/world-id/idkit/integrate`, `/idkit/session-proofs`, `/idkit/credentials`, `/credentials/11`, `/credentials/9303`,
`/api-reference/developer-portal/verify`, `/sandbox/*`, and the IDKit 4.6 typings in `node_modules/@worldcoin/idkit{,-core}/dist/*.d.ts`.

## 1. Which credential, and why it is the minimum sufficient assurance

| Trust moment | Credential | Why this one | Alternative path we demo |
|---|---|---|---|
| **Arm / check in / disarm / release now / extend** | **Selfie Check** (`CredentialRequest("selfie")`, session proof) | The risk is "someone else is holding my phone". We need proof that the same live human is present. Orb is overkill (and excludes people without one); a passport proves nothing about presence. | Thief's face fails (or the session belongs to someone else): check-in is refused, the heartbeat keeps running. "Selfie Check not available" is surfaced with instructions. |
| **Read a country-gated post** | **Identity Check (preview), `nationality` attribute** over the Passport credential | The question is "is this reader a national of X?" and nationality is exactly what is attested: no name, no birthdate, no document number. | A reader from another country is refused ("not available in your country"); a World ID without a passport gets `nationality_unavailable`. |
| Humans-only read (P2) | Proof of Human | Only "unique person" matters (anti-scraping). | Not built. |

## 2. Same-human binding (the design, and why)

Finding: in World ID 4.0 a **uniqueness proof is one-time per action per human** (docs: "World ID 4.0 uniqueness proofs are one-time per action for each user. Use separate actions for separate one-time operations, and sessions for recurring checks"; IDKit error codes `max_verifications_reached`, `nullifier_replayed`). So "store the nullifier at arm time and compare it on every check-in" is impossible: the second proof for `iigs-owner` is refused, and nullifiers are not repeatable.

Chosen design: **Selfie Check session proofs**.
1. **Arm**: `IDKitSessionWidget` with `constraints = CredentialRequest("selfie", { signal })`, no `existing_session_id` -> creates a session. The server verifies the proof and returns `humanId = session_id` (`session_<hex>`); that is stored as `ownerNullifier`.
2. **Every later owner action**: the same widget with `existing_session_id = ownerNullifier` (`IDKit.proveSession`). The session is cryptographically bound to the user's credential, so only that human can produce a valid proof for it; each proof carries a fresh `session_nullifier` (per-proof replay protection, no action limit).
3. The server returns `humanId = session_id`; the frontend compares it with `seal.ownerNullifier` and answers 403 `different_human` otherwise. A thief who creates a new session gets a different id; a thief who tries to prove the saved id fails the proof.

Why not a uniqueness action with `session_id: "create"`: it would cap a human at `max_verifications` arms for the action. A plain session has no such cap (the docs note a session alone does not prevent the same person from enrolling more than once, which we do not need: binding is per seal).
Trade-off: the `session_id` is stored on-chain as `ownerNullifier` (public) because the client needs it to prove the session. It is an identifier, not a credential: proving requires the holder's World ID plus a live selfie.
Convenience: `WorldVerifyButton` takes an optional `sessionId` prop (pass `seal.ownerNullifier`); if omitted for a non-arm action it falls back to `localStorage["iigs.world.session.<sealId>"]`, written after a successful arm on that device.

The reader flow uses a normal uniqueness proof (action `iigs-reader`); its `humanId` is `world:<decimal nullifier>` and is not used for binding. Set the portal action's max verifications to unlimited (or higher) so a reader can verify for several seals / sessions.

## 3. Signal format and server verification

Signal strings come from the shared lib (`iigs|checkin|<sealId>||<issuedAt>` etc.). The client passes it as the credential `signal`; IDKit puts `hashSignal(signal)` into each response item as `signal_hash`, and the proof commits to it.
The server (`packages/world/src/server.ts`), for every proof:
1. Envelope: `kind`, `signal === expectedSignal`, `mode === WORLD_MODE` (mock proofs are rejected in live mode and live proofs in mock mode).
2. `protocol_version === "4.0"`, `environment === WORLD_ENVIRONMENT`.
3. Credential: owner = exactly one `selfie` item (`issuer_schema_id` 11) in a session result (`session_id`); reader = uniqueness result for `WORLD_ACTION_READER` with `identity_attested === true` and the claimed alpha-2 nationality.
4. Signal: every `signal_hash` equals `hashSignal(expectedSignal)`. If a proof carries no signal (Identity Check only takes a `legacy_signal`), the proof's `nonce` must be one our `createRpContext` issued for exactly that signal.
5. Optional `WORLD_MAX_SYBIL_SCORE` threshold on the Selfie Check `sybil_score`.
6. In-memory one-time nonce use (replay -> `replayed_proof`; multi-instance deployments need a shared store).
7. `POST https://developer.world.org/api/v4/verify/{rp_id}` with the untouched IDKit result plus `environment`; requires `success: true`, matching `environment` and (sessions) matching `session_id`.

Failure codes: `bad_proof wrong_kind signal_mismatch mode_mismatch wrong_proof_type wrong_environment verification_failed max_verifications credential_unavailable nationality_unavailable replayed_proof sybil_score_too_high config_error verify_unreachable`.
RP signing: `createRpContext(kind, signal)` -> `signRequest({ signingKeyHex })` (owner: no action, session proof; reader: with the reader action) -> `{ rp_id, nonce, created_at, expires_at, signature }`. The key never leaves the server.

## 4. Alternative paths (what judges see)
- **Thief / different human**: new session id -> 403 `different_human`; in the mock simulator choose "Someone else (thief)".
- **Cancellation**: closing the widget -> `onError("Verification cancelled.")`, nothing is written.
- **Credential unavailable**: IDKit `credential_unavailable` / `world_id_4_not_available` -> "Selfie Check is not available for this World ID. Open World App, complete Selfie Check, then try again." (mock: checkbox "Simulate: credential unavailable").
- **Reader from another country**: `identity_attributes_not_matched` (client) / `nationality_unavailable` or `not_in_country` (server).

## 5. Environment variables
Server only: `WORLD_MODE=mock|live`, `WORLD_APP_ID`, `WORLD_RP_ID`, `WORLD_SIGNING_KEY` (secret), `WORLD_ENVIRONMENT=staging|production|sandbox`, `WORLD_ACTION_OWNER=iigs-owner` (reserved; owner proofs are sessions and need no action), `WORLD_ACTION_READER=iigs-reader`; optional `WORLD_MAX_SYBIL_SCORE`, `WORLD_VERIFY_BASE`.
Browser (inlined by Next): `NEXT_PUBLIC_WORLD_MODE`, `NEXT_PUBLIC_WORLD_APP_ID`, `NEXT_PUBLIC_WORLD_ENVIRONMENT`, `NEXT_PUBLIC_WORLD_ACTION_OWNER`, `NEXT_PUBLIC_WORLD_ACTION_READER`.
Frontend route required: `POST /api/world/rp-context` `{kind, signal}` -> `createRpContext` (returns the rp_context JSON).

## 6. Developer Portal setup (human steps)
1. https://developer.world.org -> create a team and an **app** of type external (IDKit), not a mini app. Note `app_id` (`app_...`).
2. Enable **World ID 4.0** / configure the RP: note `rp_id` (`rp_...`) and the **signing key** (shown once; store it in `WORLD_SIGNING_KEY`, never in `NEXT_PUBLIC_*`). Wait until RP registration shows `registered` for the environment you use.
3. Create action **`iigs-reader`** in each environment you test (staging for the simulator, production for real phones), max verifications unlimited if offered. Owner proofs are session proofs and need no action (create `iigs-owner` anyway if the portal insists; it is unused).
4. Ask World (booth / Developer Portal contact) to enable **Selfie Check** and **Identity Check (preview)** for the app; both are gated.
5. Environments: `staging` + simulator https://simulator.worldcoin.org, or `sandbox` + the sandbox World ID app (Portal -> "World ID Sandbox" -> request TestFlight/Play access; verify still goes to the production verify endpoint). IDKit `environment`, the action environment and the app you scan with must all match; the server rejects proofs from any other environment.
6. Set the env vars above, `WORLD_MODE=live`, restart the frontend.
