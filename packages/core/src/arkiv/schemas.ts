/**
 * Arkiv schemas (Rabdi testnet). See /arkiv/schema.md.
 *
 * Everything on Arkiv is public and anyone can write entities under these schema names, so every
 * read filters by $owner = one of our known service addresses (VERIFIER / MIRROR), and by `dep`
 * (the deployment tag) so dev/test runs don't mix with the demo.
 *
 * Note: `key` is a reserved word in Arkiv's query language, hence `releasedKey`.
 */
import { bytes, defineSchema, str, u64 } from "@arkiv-network/sdk/schema";

export const SCHEMA_NAMES = {
  seal: "iigs.seal",
  checkin: "iigs.checkin",
  disarm: "iigs.disarm",
  release: "iigs.release",
} as const;

export const SealSchema = defineSchema(SCHEMA_NAMES.seal, {
  dep: str().indexed(),
  sealId: str().indexed(),
  kind: str(),
  releaseAt: u64().indexed(),
  intervalSec: u64(),
  audience: str().indexed(),
  countries: str(),
  ownerNullifier: str().indexed(),
  contentType: str(),
  swarmRef: str().optional(),
  cipherInline: bytes().optional(),
  wrappedKeyEscrow: bytes(),
  title: str(),
  createdAt: u64().indexed(),
  contentHash: str(),
  sizeBytes: u64(),
  source: str(),
});

export const CheckinSchema = defineSchema(SCHEMA_NAMES.checkin, {
  dep: str().indexed(),
  sealId: str().indexed(),
  at: u64(),
  expiresAtSec: u64(),
  nullifierMatch: str(),
});

export const DisarmSchema = defineSchema(SCHEMA_NAMES.disarm, {
  dep: str().indexed(),
  sealId: str().indexed(),
  at: u64(),
});

export const ReleaseSchema = defineSchema(SCHEMA_NAMES.release, {
  dep: str().indexed(),
  sealId: str().indexed(),
  releasedAt: u64(),
  releasedKey: bytes().optional(),
  gated: str(),
  sepoliaTx: str(),
  reason: str(),
});
