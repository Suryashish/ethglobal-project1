/** Seal read/write orchestration shared by the route handlers. */
import {
  getSealState,
  getSealStates,
  listSealsByOwner,
  patchReleaseAt,
  writeArmedSeal,
  writeCheckin,
  writeDisarm,
} from "@iigs/core/arkiv";
import { isSealId, validateDraft, type SealDraft, type SealState } from "@iigs/core";
import { arkivConfig, publicClient, readArkiv, walletClient, withArkivWrite } from "./arkiv";
import { ApiError } from "./errors";
import type { Hex } from "viem";

export function assertSealId(id: string) {
  if (!isSealId(id)) throw new ApiError(400, "bad_seal_id", "seal id must be 16 characters [0-9a-z]");
}

export async function loadState(id: string, withInline = false): Promise<SealState> {
  assertSealId(id);
  const s = await readArkiv(() => getSealState(publicClient(), arkivConfig(), id, { withInline }));
  if (!s) throw new ApiError(404, "not_found", "No seal with this id on Arkiv (yet).");
  return s;
}

export async function loadStates(ids: string[], withInline = false) {
  return readArkiv(() => getSealStates(publicClient(), arkivConfig(), ids, { withInline }));
}

export async function sealsOfOwner(owner: string) {
  const seals = await readArkiv(() => listSealsByOwner(publicClient(), arkivConfig(), owner));
  return loadStates(seals.map((s) => s.sealId));
}

export function checkDraft(draft: unknown): SealDraft {
  const err = validateDraft(draft);
  if (err) throw new ApiError(400, "invalid_draft", err);
  return draft as SealDraft;
}

export const armSeal = (draft: SealDraft, humanId: string) =>
  withArkivWrite(() => writeArmedSeal(walletClient(), arkivConfig(), draft, humanId));
export const checkin = (sealId: string, intervalSec: number) =>
  withArkivWrite(() => writeCheckin(walletClient(), arkivConfig(), sealId, intervalSec));
export const disarm = (sealId: string) => withArkivWrite(() => writeDisarm(walletClient(), arkivConfig(), sealId));
export const setReleaseAt = (entityKey: Hex, releaseAt: number) =>
  withArkivWrite(() => patchReleaseAt(walletClient(), entityKey, releaseAt));
