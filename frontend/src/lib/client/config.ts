import type { PublicConfig } from "../types";
import { apiGet } from "./api";

let cached: Promise<PublicConfig> | null = null;

/** Public config from the server (`/api/config`), cached for the page lifetime. */
export function getConfig(): Promise<PublicConfig> {
  if (!cached) {
    cached = apiGet<PublicConfig>("/api/config").catch((e) => {
      cached = null;
      throw e;
    });
  }
  return cached;
}

/** NEXT_PUBLIC_* values inlined at build time. Returns null if they are not all present. */
export function staticConfig(): Partial<PublicConfig> | null {
  const verifierAddress = process.env.NEXT_PUBLIC_VERIFIER_ADDRESS;
  const mirrorAddress = process.env.NEXT_PUBLIC_MIRROR_ADDRESS;
  if (!verifierAddress || !mirrorAddress) return null;
  return {
    dep: process.env.NEXT_PUBLIC_IIGS_DEP || "dev",
    arkivAccessKey: process.env.NEXT_PUBLIC_ARKIV_ACCESS_KEY || "",
    arkivRpcUrl: process.env.NEXT_PUBLIC_ARKIV_RPC_URL || "",
    verifierAddress,
    mirrorAddress,
    swarmGateway: process.env.NEXT_PUBLIC_SWARM_GATEWAY || "https://api.gateway.ethswarm.org",
    sepoliaExplorer: process.env.NEXT_PUBLIC_SEPOLIA_EXPLORER || "https://sepolia.etherscan.io",
    baseUrl: process.env.NEXT_PUBLIC_BASE_URL || (typeof location !== "undefined" ? location.origin : ""),
  };
}
