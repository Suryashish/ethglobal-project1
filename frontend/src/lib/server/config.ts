import { ARKIV_EXPLORER } from "@iigs/core/arkiv";
import { worldMode } from "@iigs/world/server";
import { optional, required } from "./env";
import { verifierAddress } from "./arkiv";
import type { PublicConfig } from "../types";

export function publicConfig(): PublicConfig {
  return {
    dep: optional("NEXT_PUBLIC_IIGS_DEP", optional("IIGS_DEP", "dev")),
    baseUrl: optional("NEXT_PUBLIC_BASE_URL", "http://localhost:3000"),
    // Only a key explicitly marked public is handed to browsers; the server's own ARKIV_ACCESS_KEY never is.
    arkivAccessKey: optional("NEXT_PUBLIC_ARKIV_ACCESS_KEY"),
    arkivRpcUrl: optional("NEXT_PUBLIC_ARKIV_RPC_URL"),
    verifierAddress: verifierAddress(),
    mirrorAddress: required("NEXT_PUBLIC_MIRROR_ADDRESS"),
    escrowPublicKey: required("NEXT_PUBLIC_ESCROW_PUBLIC_KEY"),
    gatedPublicKey: required("NEXT_PUBLIC_GATED_PUBLIC_KEY"),
    swarmGateway: optional("NEXT_PUBLIC_SWARM_GATEWAY", "https://api.gateway.ethswarm.org"),
    silentReleaseAddress: optional("NEXT_PUBLIC_SILENT_RELEASE_ADDRESS", optional("SILENT_RELEASE_ADDRESS")),
    sepoliaExplorer: optional("NEXT_PUBLIC_SEPOLIA_EXPLORER", "https://sepolia.etherscan.io"),
    arkivExplorer: ARKIV_EXPLORER,
    // The server's real mode (fails closed): the UI can never claim "live" while the server accepts simulator proofs.
    worldMode: worldMode(),
    worldAppId: optional("NEXT_PUBLIC_WORLD_APP_ID", optional("WORLD_APP_ID")),
    worldEnvironment: optional("NEXT_PUBLIC_WORLD_ENVIRONMENT", optional("WORLD_ENVIRONMENT", "staging")),
  };
}
