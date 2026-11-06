export type SealKind = "TIMER" | "HEARTBEAT" | "BOTH";
export type Audience = "PUBLIC" | "GATED";
export type ContentType = "inline" | "swarm";
export type SealStatus = "ARMED" | "DISARMED" | "RELEASING" | "RELEASED";

/**
 * A draft is everything the author's device produces before arming: ciphertext + wrapped key.
 * The plaintext and K never leave the device unencrypted.
 */
export type SealDraft = {
  sealId: string;
  kind: SealKind;
  /** Unix seconds; 0 when the seal has no timer. */
  releaseAt: number;
  /** Heartbeat interval in seconds; 0 when the seal has no heartbeat. */
  intervalSec: number;
  audience: Audience;
  /** ISO-3166 alpha-2, upper case. Empty for PUBLIC. */
  countries: string[];
  contentType: ContentType;
  /** Swarm reference (64 hex) of OUR OWN ciphertext, when contentType = "swarm". */
  swarmRef?: string;
  /** base64 of nonce||ciphertext, when contentType = "inline". */
  cipherInlineB64?: string;
  /** base64 of K wrapped to the escrow (PUBLIC) or gated key-service (GATED) public key. */
  wrappedKeyB64: string;
  /** Short public title (may be empty). Not secret. */
  title: string;
  /** sha256 hex of the ciphertext (inline or swarm) for integrity checks. */
  contentHash: string;
  /** Ciphertext size in bytes. */
  sizeBytes: number;
  /** Where the draft came from. */
  source: "vault" | "extension";
};

/** A seal as read back from Arkiv. */
export type SealRecord = {
  entityKey: `0x${string}`;
  sealId: string;
  kind: SealKind;
  releaseAt: number;
  intervalSec: number;
  audience: Audience;
  countries: string[];
  ownerNullifier: string;
  contentType: ContentType;
  swarmRef: string;
  /** Only populated when explicitly requested (it can be large). */
  cipherInline?: Uint8Array;
  wrappedKeyEscrow: Uint8Array;
  title: string;
  createdAt: number;
  contentHash: string;
  sizeBytes: number;
  source: string;
};

export type CheckinRecord = { entityKey: `0x${string}`; sealId: string; at: number; expiresAtSec: number };
export type DisarmRecord = { entityKey: `0x${string}`; sealId: string; at: number };
export type ReleaseRecord = {
  entityKey: `0x${string}`;
  sealId: string;
  releasedAt: number;
  releasedKey?: Uint8Array;
  gated: boolean;
  sepoliaTx: string;
  reason: string;
};

/** Everything the UI / extension needs to render one seal. */
export type SealState = {
  seal: SealRecord;
  status: SealStatus;
  disarm: DisarmRecord | null;
  release: ReleaseRecord | null;
  /** Live (unexpired) check-ins, newest first. */
  checkins: CheckinRecord[];
  /** Unix seconds of the next deadline (timer or heartbeat), or null if none applies. */
  nextDeadline: number | null;
  /** Which rule would fire at nextDeadline. */
  nextDeadlineRule: "TIMER" | "HEARTBEAT" | null;
};
