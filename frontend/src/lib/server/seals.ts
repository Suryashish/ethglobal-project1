/** Seal read/write orchestration shared by the route handlers. */
import {
  extendSealLife,
  getSeal,
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

/**
 * Arms a seal. The existence check runs INSIDE the single write queue, so two arms of the same sealId cannot
 * race: a sealId can never be armed twice (no one can create a second record under someone else's seal id).
 */
export const armSeal = (draft: SealDraft, humanId: string) =>
  withArkivWrite(async () => {
    const existing = await getSeal(publicClient(), arkivConfig(), draft.sealId);
    if (existing) throw new ApiError(409, "seal_exists", "A seal with this id already exists.");
    return writeArmedSeal(walletClient(), arkivConfig(), draft, humanId);
  });

const SEAL_REFRESH_AFTER_SEC = 60 * 86400;

/**
 * Every arm costs the verifier wallet gas; an unfunded verifier would make owners' check-ins fail (and their seals
 * release against their will). So each verified human may arm at most ARM_LIMIT seals per hour (in memory; use a
 * shared store when running several instances).
 */
const ARM_LIMIT = 20;
const armLog = new Map<string, number[]>();
export function rateLimitArm(humanId: string, now = Date.now()) {
  const recent = (armLog.get(humanId) ?? []).filter((t) => now - t < 3600_000);
  if (recent.length >= ARM_LIMIT) throw new ApiError(429, "rate_limited", `At most ${ARM_LIMIT} seals per hour. Try again later.`);
  recent.push(now);
  armLog.set(humanId, recent);
}

/** Heartbeat check-in; seals older than 60 days also get their Arkiv lifetime renewed so they never expire unreleased. */
export const checkin = (seal: { sealId: string; intervalSec: number; createdAt: number; entityKey: Hex }) =>
  withArkivWrite(async () => {
    const r = await writeCheckin(walletClient(), arkivConfig(), seal.sealId, seal.intervalSec);
    if (Math.floor(Date.now() / 1000) - seal.createdAt > SEAL_REFRESH_AFTER_SEC) await extendSealLife(walletClient(), seal.entityKey);
    return r;
  });
export const disarm = (sealId: string) => withArkivWrite(() => writeDisarm(walletClient(), arkivConfig(), sealId));
export const setReleaseAt = (entityKey: Hex, releaseAt: number) =>
  withArkivWrite(() => patchReleaseAt(walletClient(), entityKey, releaseAt));
