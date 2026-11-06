import { generateContentKey, generateKeypair, wrapKey, toHex, type SealState } from "@iigs/core";

export const NOW = 1_800_000_000;
export const escrow = generateKeypair();
export const escrowSk = `0x${toHex(escrow.secretKey)}` as const;

export function seal(over: {
  id: string;
  releaseAt?: number;
  intervalSec?: number;
  createdAt?: number;
  audience?: "PUBLIC" | "GATED";
  disarmed?: boolean;
  released?: boolean;
  alive?: boolean;
}): { state: SealState; key: Uint8Array } {
  const key = generateContentKey();
  const wrapped = wrapKey(key, escrow.publicKey, over.id);
  const state = {
    seal: {
      entityKey: "0x01",
      sealId: over.id,
      kind: "TIMER",
      releaseAt: over.releaseAt ?? 0,
      intervalSec: over.intervalSec ?? 0,
      audience: over.audience ?? "PUBLIC",
      countries: [],
      ownerNullifier: "n",
      contentType: "inline",
      swarmRef: "",
      wrappedKeyEscrow: wrapped,
      title: "",
      createdAt: over.createdAt ?? NOW - 1000,
      contentHash: "",
      sizeBytes: 0,
      source: "vault",
    },
    status: "ARMED",
    disarm: over.disarmed ? { entityKey: "0x02", sealId: over.id, at: 1 } : null,
    release: over.released
      ? { entityKey: "0x03", sealId: over.id, releasedAt: 1, gated: false, sepoliaTx: "0x", reason: "cre" }
      : null,
    checkins: over.alive ? [{ entityKey: "0x04", sealId: over.id, at: NOW, expiresAtSec: NOW + 60 }] : [],
    nextDeadline: null,
    nextDeadlineRule: null,
  } as unknown as SealState;
  return { state, key };
}
