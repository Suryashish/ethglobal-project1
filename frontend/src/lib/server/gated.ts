/** Gated key release rules (pure; the route wires in Arkiv/Sepolia + unwrapKey). */
import { ruleHasFired, type SealState } from "@iigs/core";
import { ApiError } from "./errors";
import { verifyReaderToken, type ReaderClaims } from "./token";

export function checkGatedRelease(
  state: Pick<SealState, "seal" | "status" | "release" | "checkins" | "disarm">,
  token: unknown,
  secret: Uint8Array | string,
  opts: { chainReleased?: boolean; nowSec?: number } = {},
): ReaderClaims {
  if (state.seal.audience !== "GATED") {
    throw new ApiError(400, "not_gated", "This seal is public; its key is published on release.");
  }
  if (state.status === "DISARMED") throw new ApiError(409, "not_released", "This seal was cancelled and will never open.");
  const released = state.release !== null || opts.chainReleased === true;
  if (!released) throw new ApiError(409, "not_released", "This seal has not been released yet.");
  // Defense in depth: a release marker alone is not enough. The seal's own rule (timer passed / heartbeat gone)
  // must have fired according to its Arkiv records, so a forged or premature on-chain release never unlocks K.
  if (!ruleHasFired(state, opts.nowSec)) {
    throw new ApiError(409, "not_released", "This seal's release rule has not fired yet.");
  }
  const t = verifyReaderToken(secret, token, opts.nowSec);
  if (!t.ok) {
    throw new ApiError(401, t.reason === "expired" ? "token_expired" : "bad_token", "Reader session invalid or expired. Verify your nationality again.");
  }
  if (!state.seal.countries.includes(t.claims.n)) {
    throw new ApiError(403, "not_in_country", "Not available in your country.");
  }
  return t.claims;
}
