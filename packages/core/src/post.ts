/**
 * The sealed social post format (feature E2):
 *
 *   🔒 Sealed by a verified human · opens 12 Nov 2026, 14:05 UTC · https://iigs.example/s/<id> ⟦IIGS:<id>⟧
 *
 * The content script and reader detect either the token or the /s/<id> link.
 */
import { SEAL_ID_LENGTH } from "./ids.js";

export const TOKEN_OPEN = "⟦IIGS:";
export const TOKEN_CLOSE = "⟧";

export function sealToken(sealId: string): string {
  return `${TOKEN_OPEN}${sealId}${TOKEN_CLOSE}`;
}

export function readerUrl(baseUrl: string, sealId: string): string {
  return `${baseUrl.replace(/\/+$/, "")}/s/${sealId}`;
}

export function formatOpensAt(unixSec: number): string {
  const d = new Date(unixSec * 1000);
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getUTCDate()} ${months[d.getUTCMonth()]} ${d.getUTCFullYear()}, ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())} UTC`;
}

export type SealedPostOptions = {
  sealId: string;
  baseUrl: string;
  /** Unix seconds when a TIMER seal opens, or 0 for heartbeat-only. */
  releaseAt: number;
  /** ISO-3166 alpha-2 codes for country-gated seals. */
  countries?: string[];
};

export function formatSealedPost(o: SealedPostOptions): string {
  const when = o.releaseAt > 0 ? `opens ${formatOpensAt(o.releaseAt)}` : "opens if I go silent";
  const gate = o.countries && o.countries.length ? ` · readers from ${o.countries.join(", ")}` : "";
  return `🔒 Sealed by a verified human · ${when}${gate} · ${readerUrl(o.baseUrl, o.sealId)} ${sealToken(o.sealId)}`;
}

const ID = `[0-9a-z]{${SEAL_ID_LENGTH}}`;
const TOKEN_RE = new RegExp(`⟦IIGS:(${ID})⟧`, "g");
const LINK_RE = new RegExp(`/s/(${ID})(?![0-9a-z])`, "g");

/** Finds all seal IDs referenced in a piece of text (tokens first, then /s/<id> links), de-duplicated. */
export function findSealIds(text: string): string[] {
  const out = new Set<string>();
  for (const m of text.matchAll(TOKEN_RE)) out.add(m[1]!);
  for (const m of text.matchAll(LINK_RE)) out.add(m[1]!);
  return [...out];
}
