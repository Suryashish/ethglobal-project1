/** Wire (JSON) shapes returned by the web app API, plus tolerant normalizers. */

export type WireSeal = {
  sealId: string;
  kind: "TIMER" | "HEARTBEAT" | "BOTH";
  releaseAt: number;
  intervalSec: number;
  audience: "PUBLIC" | "GATED";
  countries: string[];
  contentType: "inline" | "swarm";
  swarmRef?: string;
  cipherInlineB64?: string;
  wrappedKeyB64?: string;
  title?: string;
  contentHash?: string;
  sizeBytes?: number;
  createdAt?: number;
  ownerNullifier?: string;
  [k: string]: unknown;
};

export type WireState = {
  seal: WireSeal;
  status: "ARMED" | "DISARMED" | "RELEASING" | "RELEASED";
  disarm: { at?: number } | null;
  release: { releasedAt?: number; releasedKeyB64?: string; gated?: boolean; sepoliaTx?: string; reason?: string } | null;
  checkins?: unknown[];
  nextDeadline: number | null;
  nextDeadlineRule: "TIMER" | "HEARTBEAT" | null;
  [k: string]: unknown;
};

export type PublicConfig = {
  baseUrl?: string;
  escrowPublicKey: string; // hex
  gatedPublicKey: string; // hex
  swarmGateway: string;
  worldMode?: string;
  [k: string]: unknown;
};

function isState(x: unknown): x is WireState {
  return !!x && typeof x === "object" && typeof (x as any).seal === "object" && (x as any).seal !== null;
}

/**
 * Accepts `{states:{id:state}}`, `{id:state}`, `{states:[…]}` or `[…]` and returns id → state|null.
 */
export function normalizeStates(json: unknown, ids: string[]): Record<string, WireState | null> {
  const out: Record<string, WireState | null> = {};
  for (const id of ids) out[id] = null;
  const root: any = json && typeof json === "object" && "states" in (json as any) ? (json as any).states : json;
  if (Array.isArray(root)) {
    for (const s of root) if (isState(s) && typeof s.seal.sealId === "string") out[s.seal.sealId] = s;
  } else if (root && typeof root === "object") {
    for (const [k, v] of Object.entries(root)) {
      if (isState(v)) out[(v as WireState).seal.sealId ?? k] = v;
    }
  }
  return out;
}

/** Finds the first string value under a key matching `re` anywhere in the (small) config object. */
function deepFind(o: unknown, re: RegExp, depth = 0): string | null {
  if (!o || typeof o !== "object" || depth > 3) return null;
  for (const [k, v] of Object.entries(o as Record<string, unknown>)) {
    if (typeof v === "string" && re.test(k)) return v;
  }
  for (const v of Object.values(o as Record<string, unknown>)) {
    const r = deepFind(v, re, depth + 1);
    if (r) return r;
  }
  return null;
}

const HEX32 = /^[0-9a-f]{64}$/i;

/**
 * Encryption keys built into this extension at build time (IIGS_ESCROW_PUBLIC_KEY / IIGS_GATED_PUBLIC_KEY).
 * When set, a server that hands out different keys is refused: a compromised or phished server URL could
 * otherwise make the extension lock every new seal to the attacker's key.
 */
export const PINNED_KEYS = {
  escrow: (import.meta.env?.VITE_IIGS_ESCROW_PUBLIC_KEY as string | undefined) || "",
  gated: (import.meta.env?.VITE_IIGS_GATED_PUBLIC_KEY as string | undefined) || "",
};

export function normalizeConfig(json: unknown, pinned: { escrow: string; gated: string } = PINNED_KEYS): PublicConfig {
  const escrow = deepFind(json, /^escrow_?public_?key$/i);
  const gated = deepFind(json, /^gated_?public_?key$/i);
  if (!escrow || !gated) throw new Error("config is missing escrow/gated public keys");
  if (!HEX32.test(escrow) || !HEX32.test(gated)) throw new Error("config has malformed encryption keys");
  if ((pinned.escrow && pinned.escrow.toLowerCase() !== escrow.toLowerCase()) || (pinned.gated && pinned.gated.toLowerCase() !== gated.toLowerCase())) {
    throw new Error("This server's encryption keys do not match the keys built into Silent Seal — refusing to use it.");
  }
  const swarm = deepFind(json, /swarm.*gateway/i) ?? "https://api.gateway.ethswarm.org";
  const worldMode = deepFind(json, /world.*mode/i) ?? undefined;
  const baseUrl = deepFind(json, /^base.?url$/i) ?? undefined;
  return { ...(json as object), escrowPublicKey: escrow, gatedPublicKey: gated, swarmGateway: swarm.replace(/\/+$/, ""), worldMode, baseUrl };
}
