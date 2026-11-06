import { createSeal, fromHex, type SealDraft } from "@iigs/core";
import type { PublicConfig } from "./wire";

export type ComposeInput = {
  text: string;
  /** Unix seconds of the timer release. */
  releaseAt: number;
  /** 0 = no heartbeat; otherwise seconds (≥ 60) → rule BOTH. */
  heartbeatSec: number;
  countries: string[];
};

export class InlineTooLongError extends Error {}

/** Encrypts on-device; returns the draft to hand to the web app. Plaintext never leaves this function. */
export function buildDraft(input: ComposeInput, config: Pick<PublicConfig, "escrowPublicKey" | "gatedPublicKey">): SealDraft {
  const text = input.text.trim();
  if (!text) throw new Error("Write something to seal.");
  const rule = input.heartbeatSec > 0
    ? ({ kind: "BOTH", releaseAt: input.releaseAt, intervalSec: input.heartbeatSec } as const)
    : ({ kind: "TIMER", releaseAt: input.releaseAt } as const);
  const out = createSeal({
    source: "extension",
    content: { type: "text", text },
    rule,
    audience: input.countries.length ? "GATED" : "PUBLIC",
    countries: input.countries,
    escrowPublicKey: fromHex(config.escrowPublicKey),
    gatedPublicKey: fromHex(config.gatedPublicKey),
  });
  if (out.needsSwarmUpload) {
    throw new InlineTooLongError("That post is too long to seal inline (about 8 KB max). Shorten it — Swarm storage for long posts is not in the extension yet.");
  }
  return out.draft;
}
