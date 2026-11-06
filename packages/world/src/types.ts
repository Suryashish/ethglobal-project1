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
  /**
   * Reader proofs only (live): the nationality the reader asserted (ISO 3166-1 alpha-2) and that the
   * Identity Check request attested. The server only accepts it if the proof says `identity_attested`.
   */
  claim?: { nationality?: string };
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

/** Live-mode failure codes returned in `{ ok:false, code }` by the server verifiers. */
export const WORLD_ERROR_CODES = [
  "bad_proof", "wrong_kind", "signal_mismatch", "mode_mismatch", "wrong_proof_type", "wrong_environment", "nationality_mismatch",
  "verification_failed", "max_verifications", "credential_unavailable", "nationality_unavailable",
  "replayed_proof", "sybil_score_too_high", "config_error", "verify_unreachable",
] as const;
export type WorldErrorCode = (typeof WORLD_ERROR_CODES)[number];

/** RP context passed to IDKit (what `createRpContext` returns in live mode). */
export type WorldRpContext = { rp_id: string; nonce: string; created_at: number; expires_at: number; signature: string };

/** ISO 3166-1 alpha-2 to alpha-3 (Identity Check wants alpha-3). Extend as needed. */
export const ALPHA2_TO_ALPHA3: Record<string, string> = {
  IN: "IND", MT: "MLT", US: "USA", GB: "GBR", DE: "DEU", FR: "FRA", BR: "BRA", NG: "NGA", KE: "KEN", PH: "PHL",
  MX: "MEX", TR: "TUR", CA: "CAN", AU: "AUS", JP: "JPN", KR: "KOR", CN: "CHN", RU: "RUS", UA: "UKR", IT: "ITA",
  ES: "ESP", PT: "PRT", NL: "NLD", BE: "BEL", CH: "CHE", AT: "AUT", SE: "SWE", NO: "NOR", DK: "DNK", FI: "FIN",
  PL: "POL", IE: "IRL", GR: "GRC", AR: "ARG", CL: "CHL", CO: "COL", PE: "PER", ZA: "ZAF", EG: "EGY", GH: "GHA",
  PK: "PAK", BD: "BGD", ID: "IDN", TH: "THA", VN: "VNM", SG: "SGP", MY: "MYS", AE: "ARE", SA: "SAU", IL: "ISR",
  IR: "IRN", BY: "BLR", HK: "HKG", NZ: "NZL",
};
