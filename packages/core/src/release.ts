/**
 * The release rule — a pure function shared by the CRE workflow, the dev sweeper and the UI.
 *
 *   timerDue      = releaseAt > 0 && now >= releaseAt
 *   heartbeatDead = intervalSec > 0 && no live VERIFIER-owned iigs.checkin for this seal
 *   release       = !disarmed && !released && (timerDue || heartbeatDead)
 *
 * "The absence of data is the trigger": a heartbeat is an Arkiv entity whose expiration equals the
 * interval, so when the author goes silent it simply disappears from queries.
 *
 * "Release now" and "extend" are implemented by the verifier patching the seal's releaseAt, so a
 * HEARTBEAT seal released early gets releaseAt = now and the timer branch fires.
 */
import type { SealStatus } from "./types.js";

/** Seconds after creation during which a missing heartbeat is not treated as death (indexing lag). */
export const HEARTBEAT_GRACE_SEC = 20;

export type ReleaseInput = {
  releaseAt: number;
  intervalSec: number;
  createdAt: number;
  disarmed: boolean;
  released: boolean;
  heartbeatAlive: boolean;
  now: number;
};

export type ReleaseDecision =
  | { release: true; reason: "TIMER" | "HEARTBEAT" }
  | { release: false; reason: "DISARMED" | "ALREADY_RELEASED" | "WAITING" };

export function decideRelease(i: ReleaseInput): ReleaseDecision {
  if (i.disarmed) return { release: false, reason: "DISARMED" };
  if (i.released) return { release: false, reason: "ALREADY_RELEASED" };
  if (i.releaseAt > 0 && i.now >= i.releaseAt) return { release: true, reason: "TIMER" };
  const inGrace = i.now < i.createdAt + HEARTBEAT_GRACE_SEC;
  if (i.intervalSec > 0 && !i.heartbeatAlive && !inGrace) return { release: true, reason: "HEARTBEAT" };
  return { release: false, reason: "WAITING" };
}

export type StatusInput = {
  releaseAt: number;
  intervalSec: number;
  createdAt: number;
  disarmed: boolean;
  released: boolean;
  /** expiresAtSec of live check-ins. */
  liveCheckinExpiries: number[];
  now: number;
};

export function computeStatus(i: StatusInput): {
  status: SealStatus;
  nextDeadline: number | null;
  nextDeadlineRule: "TIMER" | "HEARTBEAT" | null;
} {
  if (i.disarmed) return { status: "DISARMED", nextDeadline: null, nextDeadlineRule: null };
  if (i.released) return { status: "RELEASED", nextDeadline: null, nextDeadlineRule: null };
  const heartbeatAlive = i.liveCheckinExpiries.length > 0;
  const d = decideRelease({ ...i, heartbeatAlive });
  const candidates: { t: number; rule: "TIMER" | "HEARTBEAT" }[] = [];
  if (i.releaseAt > 0) candidates.push({ t: i.releaseAt, rule: "TIMER" });
  if (i.intervalSec > 0) {
    const hb = heartbeatAlive ? Math.max(...i.liveCheckinExpiries) : i.now;
    candidates.push({ t: hb, rule: "HEARTBEAT" });
  }
  candidates.sort((a, b) => a.t - b.t);
  const next = candidates[0] ?? null;
  return {
    status: d.release ? "RELEASING" : "ARMED",
    nextDeadline: next ? next.t : null,
    nextDeadlineRule: next ? next.rule : null,
  };
}

/**
 * Has this seal's OWN rule fired, judged only from its Arkiv records (timer passed, or no live heartbeat),
 * ignoring any "released" marker? Used to refuse release claims that do not match the seal's rule — e.g. a fake
 * on-chain release event, which must never unlock a gated key or be mirrored as a release.
 */
export function ruleHasFired(
  s: {
    seal: { releaseAt: number; intervalSec: number; createdAt: number };
    checkins: { expiresAtSec: number }[];
    disarm: unknown | null;
  },
  now = Math.floor(Date.now() / 1000),
): boolean {
  if (s.disarm) return false;
  const live = s.checkins.filter((c) => c.expiresAtSec > now).map((c) => c.expiresAtSec);
  return (
    computeStatus({
      releaseAt: s.seal.releaseAt,
      intervalSec: s.seal.intervalSec,
      createdAt: s.seal.createdAt,
      disarmed: false,
      released: false,
      liveCheckinExpiries: live,
      now,
    }).status === "RELEASING"
  );
}
