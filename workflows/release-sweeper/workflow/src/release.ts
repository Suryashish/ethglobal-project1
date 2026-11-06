/** The release rule — identical to @iigs/core `release.ts` (`decideRelease`). */
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
