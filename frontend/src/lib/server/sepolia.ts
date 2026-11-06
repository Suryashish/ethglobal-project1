import { SILENT_RELEASE_ABI } from "@iigs/core";
import { createPublicClient, http, type Address } from "viem";
import { sepolia } from "viem/chains";
import { optional } from "./env";

/** On-chain fallback for "was this seal released?" when the Arkiv mirror has not caught up. */
export async function isReleasedOnSepolia(sealId: string): Promise<boolean> {
  const addr = optional("SILENT_RELEASE_ADDRESS", optional("NEXT_PUBLIC_SILENT_RELEASE_ADDRESS"));
  if (!addr) return false;
  try {
    const client = createPublicClient({ chain: sepolia, transport: http(optional("SEPOLIA_RPC_URL") || undefined) });
    return (await client.readContract({
      address: addr as Address,
      abi: SILENT_RELEASE_ABI,
      functionName: "isReleased",
      args: [sealId],
    })) as boolean;
  } catch {
    return false;
  }
}
