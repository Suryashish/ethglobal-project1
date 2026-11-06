/** Same ABI as @iigs/core `RELEASE_REPORT_ABI`: abi.encode(ReleaseItem[]) for SilentRelease.sol. */
import { encodeAbiParameters, type Hex } from "viem";

export const RELEASE_REPORT_ABI = [
  {
    type: "tuple[]",
    name: "items",
    components: [
      { type: "string", name: "sealId" },
      { type: "bool", name: "gated" },
      { type: "bytes", name: "key" },
    ],
  },
] as const;

export type ReleaseItem = { sealId: string; gated: boolean; key: Hex };

export function encodeReleaseReport(items: ReleaseItem[]): Hex {
  return encodeAbiParameters(RELEASE_REPORT_ABI, [items]);
}
