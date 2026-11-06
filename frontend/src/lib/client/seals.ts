/** Browser-side reads: seal state straight from Arkiv (with an API fallback) and ciphertext from Swarm. */
import { arkivPublicClient, getSealState, type ArkivConfig } from "@iigs/core/arkiv";
import { ARKIV_EXPLORER } from "@iigs/core/arkiv";
import type { SealState } from "@iigs/core";
import { sealStateFromJson, type SealStateJson } from "../serialize";
import type { PublicConfig } from "../types";
import { ApiClientError, apiGet } from "./api";
import { getConfig, staticConfig } from "./config";

export { ARKIV_EXPLORER };

export type LoadedState = { state: SealState | null; via: "arkiv" | "api" };

function arkivCfg(c: Partial<PublicConfig>): ArkivConfig {
  return {
    accessKey: c.arkivAccessKey ?? "",
    dep: c.dep ?? "dev",
    verifier: c.verifierAddress as `0x${string}`,
    mirror: c.mirrorAddress as `0x${string}`,
  };
}

/** Reads the seal directly from Arkiv in the browser; falls back to GET /api/seals/[id]. */
export async function loadSealState(id: string): Promise<LoadedState> {
  let cfg: Partial<PublicConfig> | null = staticConfig();
  try {
    if (!cfg) cfg = await getConfig();
    const state = await getSealState(arkivPublicClient({ accessKey: cfg.arkivAccessKey ?? "" }), arkivCfg(cfg), id, {
      withInline: true,
    });
    return { state, via: "arkiv" };
  } catch (e) {
    console.warn("[iigs] direct Arkiv read failed, falling back to /api/seals/[id]", e);
  }
  try {
    const j = await apiGet<SealStateJson>(`/api/seals/${id}`);
    return { state: sealStateFromJson(j), via: "api" };
  } catch (e) {
    if (e instanceof ApiClientError && e.status === 404) return { state: null, via: "api" };
    throw e;
  }
}

/** States for many ids via the API (dashboard). */
export async function loadSealStatesViaApi(ids: string[]): Promise<Record<string, SealState>> {
  if (ids.length === 0) return {};
  const res = await fetch("/api/seals/state", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ids: ids.slice(0, 50) }),
  });
  if (!res.ok) throw new Error(`state request failed (${res.status})`);
  const j = (await res.json()) as Record<string, SealStateJson>;
  return Object.fromEntries(Object.entries(j).map(([k, v]) => [k, sealStateFromJson(v)]));
}

export async function loadOwnerSeals(owner: string): Promise<SealState[]> {
  const j = await apiGet<{ seals: SealStateJson[] }>(`/api/seals?owner=${encodeURIComponent(owner)}`);
  return j.seals.map(sealStateFromJson);
}

/** Ciphertext from the public Swarm gateway (CORS *), falling back to our proxy. */
export async function fetchCiphertext(ref: string): Promise<Uint8Array> {
  let gateway = staticConfig()?.swarmGateway;
  if (!gateway) {
    try {
      gateway = (await getConfig()).swarmGateway;
    } catch {
      gateway = "https://api.gateway.ethswarm.org";
    }
  }
  try {
    const r = await fetch(`${gateway.replace(/\/+$/, "")}/bytes/${ref}`);
    if (r.ok) return new Uint8Array(await r.arrayBuffer());
  } catch {
    /* fall through to the proxy */
  }
  const r2 = await fetch(`/api/swarm/${ref}`);
  if (!r2.ok) throw new Error(`could not fetch the ciphertext from Swarm (${r2.status})`);
  return new Uint8Array(await r2.arrayBuffer());
}

// ---------------------------------------------------------------------------------------------
// localStorage (every access is guarded: private windows can throw)
// ---------------------------------------------------------------------------------------------
function ls(): Storage | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}
export function getOwner(): string | null {
  try {
    return ls()?.getItem("iigs.owner") ?? null;
  } catch {
    return null;
  }
}
export function setOwner(id: string) {
  try {
    ls()?.setItem("iigs.owner", id);
  } catch {
    /* ignore */
  }
}
export function getLocalSeals(): string[] {
  try {
    const v = JSON.parse(ls()?.getItem("iigs.seals") ?? "[]");
    return Array.isArray(v) ? v.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}
export function addLocalSeal(id: string) {
  try {
    const all = getLocalSeals();
    if (!all.includes(id)) ls()?.setItem("iigs.seals", JSON.stringify([...all, id]));
  } catch {
    /* ignore */
  }
}
export type ReaderSession = { token: string; nationality: string; expiresAt: number };
export function getReaderSession(): ReaderSession | null {
  try {
    const v = JSON.parse(ls()?.getItem("iigs.reader") ?? "null") as ReaderSession | null;
    if (v && typeof v.token === "string" && v.expiresAt * 1000 > Date.now()) return v;
  } catch {
    /* ignore */
  }
  return null;
}
export function setReaderSession(s: ReaderSession) {
  try {
    ls()?.setItem("iigs.reader", JSON.stringify(s));
  } catch {
    /* ignore */
  }
}
