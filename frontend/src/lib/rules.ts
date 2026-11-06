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
