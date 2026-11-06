import { formatCountdown } from "./format";
import type { WireState } from "./wire";

export type ReaderCtx = { token: string; nationality: string; expiresAtMs: number } | null;

export type CardModel =
  | { kind: "missing" }
  | { kind: "sealed"; opensInSec: number | null; deadline: number | null; rule: "TIMER" | "HEARTBEAT" | null; gated: string[] }
  | { kind: "cancelled" }
  | { kind: "releasing"; gated: string[] }
  | { kind: "open-public" }
  | { kind: "open-gated"; countries: string[]; reader: "none" | "verified"; nationality?: string };

/** Pure: chooses what to show for a seal. */
export function selectCard(state: WireState | null | undefined, now: number, reader: ReaderCtx): CardModel {
  if (!state) return { kind: "missing" };
  const gated = state.seal.audience === "GATED" ? state.seal.countries ?? [] : [];
  if (state.status === "DISARMED") return { kind: "cancelled" };
  if (state.status === "RELEASED") {
    if (gated.length) {
      const ok = reader && reader.expiresAtMs > now * 1000;
      return { kind: "open-gated", countries: gated, reader: ok ? "verified" : "none", nationality: ok ? reader!.nationality : undefined };
    }
    return { kind: "open-public" };
  }
  if (state.status === "RELEASING") return { kind: "releasing", gated };
  const deadline = state.nextDeadline ?? (state.seal.releaseAt > 0 ? state.seal.releaseAt : null);
  if (deadline !== null && deadline <= now) return { kind: "releasing", gated };
  return {
    kind: "sealed",
    deadline,
    opensInSec: deadline === null ? null : deadline - now,
    rule: state.nextDeadlineRule ?? (state.seal.releaseAt > 0 ? "TIMER" : "HEARTBEAT"),
    gated,
  };
}

export function sealedLine(m: Extract<CardModel, { kind: "sealed" }>, now: number): string {
  if (m.deadline === null) return "Sealed · opens if the author goes silent";
  const when = formatCountdown(m.deadline - now);
  return m.rule === "HEARTBEAT" ? `Sealed · opens in ${when} unless the author checks in` : `Sealed · opens in ${when}`;
}
