export type WorldKind = "owner" | "reader";
export type WorldMode = "mock" | "live";

/** What the client sends to our server after a World ID verification. */
export type WorldProofEnvelope = {
  mode: WorldMode;
  kind: WorldKind;
  /** The exact signal string the proof commits to. */
  signal: string;
  /** Raw IDKit result (live) or MockProof (mock). */
  result: unknown;
};

export type MockProof = { identity: string; nationality?: string };

export type OwnerVerifyResult = { ok: true; humanId: string } | { ok: false; code: string; message: string };
export type ReaderVerifyResult =
  | { ok: true; humanId: string; nationality: string | null }
  | { ok: false; code: string; message: string };

export const MOCK_IDENTITIES = [
  { id: "author", label: "Author (you)" },
  { id: "thief", label: "Someone else (thief holding your phone)" },
] as const;

export const MOCK_NATIONALITIES = ["IN", "MT", "US", "GB", "DE", "FR", "BR", "NG", "KE", "PH", "MX", "TR"] as const;
