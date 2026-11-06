import { ARKIV_EXPLORER } from "@iigs/core/arkiv";
import { optional, required } from "./env";
import { verifierAddress } from "./arkiv";
import type { PublicConfig } from "../types";

export function publicConfig(): PublicConfig {
  return {
    dep: optional("NEXT_PUBLIC_IIGS_DEP", optional("IIGS_DEP", "dev")),
    baseUrl: optional("NEXT_PUBLIC_BASE_URL", "http://localhost:3000"),
    arkivAccessKey: optional("NEXT_PUBLIC_ARKIV_ACCESS_KEY", optional("ARKIV_ACCESS_KEY")),
    arkivRpcUrl: optional("NEXT_PUBLIC_ARKIV_RPC_URL"),
    verifierAddress: verifierAddress(),
    mirrorAddress: required("NEXT_PUBLIC_MIRROR_ADDRESS"),
    escrowPublicKey: required("NEXT_PUBLIC_ESCROW_PUBLIC_KEY"),
    gatedPublicKey: required("NEXT_PUBLIC_GATED_PUBLIC_KEY"),
    swarmGateway: optional("NEXT_PUBLIC_SWARM_GATEWAY", "https://api.gateway.ethswarm.org"),
    silentReleaseAddress: optional("NEXT_PUBLIC_SILENT_RELEASE_ADDRESS", optional("SILENT_RELEASE_ADDRESS")),
    sepoliaExplorer: optional("NEXT_PUBLIC_SEPOLIA_EXPLORER", "https://sepolia.etherscan.io"),
    arkivExplorer: ARKIV_EXPLORER,
    worldMode: optional("WORLD_MODE", optional("NEXT_PUBLIC_WORLD_MODE", "mock")) === "live" ? "live" : "mock",
    worldAppId: optional("NEXT_PUBLIC_WORLD_APP_ID", optional("WORLD_APP_ID")),
    worldEnvironment: optional("NEXT_PUBLIC_WORLD_ENVIRONMENT", optional("WORLD_ENVIRONMENT", "staging")),
  };
}
