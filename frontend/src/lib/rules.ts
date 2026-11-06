import type { SealRecord, SealState } from "@iigs/core";
import { flag, formatDateTime, humanInterval } from "./format";

export function ruleText(s: Pick<SealRecord, "kind" | "releaseAt" | "intervalSec">): string {
  const timer = `opens ${formatDateTime(s.releaseAt)}`;
  const hb = `opens if the author is silent for ${humanInterval(s.intervalSec)}`;
  if (s.kind === "TIMER") return timer;
  if (s.kind === "HEARTBEAT") return hb;
  return `${timer}, or earlier if the author is silent for ${humanInterval(s.intervalSec)}`;
}

export function audienceText(s: Pick<SealRecord, "audience" | "countries">): string {
  return s.audience === "GATED"
    ? `Visible to verified readers from ${s.countries.map((c) => `${flag(c)} ${c}`).join(", ")}`
    : "Public: anyone can read it once it opens";
}

/** A seal whose deadline has passed but which the sweeper has not released yet reads as RELEASING. */
export function effectiveStatus(state: SealState, nowSec: number): SealState["status"] {
  if (state.status === "ARMED" && nowSec > 0 && state.nextDeadline !== null && nowSec >= state.nextDeadline) {
    return "RELEASING";
  }
  return state.status;
}

export function deadlineLabel(rule: SealState["nextDeadlineRule"]): string {
  return rule === "HEARTBEAT" ? "Next check-in due in" : "Opens in";
}

/** A heartbeat seal whose check-in window is in its last quarter (or last minute). */
export function needsCheckIn(state: SealState, nowSec: number): boolean {
  if (state.status !== "ARMED" || state.nextDeadlineRule !== "HEARTBEAT" || !state.nextDeadline || nowSec === 0) return false;
  const left = state.nextDeadline - nowSec;
  return left > 0 && left <= Math.max(60, state.seal.intervalSec * 0.25);
}

/** Dashboard order: what needs you soonest first, then live seals, then finished ones (newest first). */
export function byUrgency(a: SealState, b: SealState): number {
  const rank = (s: SealState) => (s.status === "ARMED" || s.status === "RELEASING" ? 0 : s.status === "RELEASED" ? 1 : 2);
  const r = rank(a) - rank(b);
  if (r !== 0) return r;
  if (rank(a) === 0) return (a.nextDeadline ?? Infinity) - (b.nextDeadline ?? Infinity);
  return b.seal.createdAt - a.seal.createdAt;
}
