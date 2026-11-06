/**
 * The CRE report consumed by SilentRelease.sol `_processReport(bytes report)`:
 *
 *   abi.encode(ReleaseItem[] items)   struct ReleaseItem { string sealId; bool gated; bytes key; }
 *
 * For PUBLIC seals `key` is the 32-byte content key K; for GATED seals it is empty and the
 * gated key service releases K per verified reader.
 */
import { decodeAbiParameters, encodeAbiParameters, type Hex } from "viem";

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

export function decodeReleaseReport(data: Hex): ReleaseItem[] {
  const [items] = decodeAbiParameters(RELEASE_REPORT_ABI, data);
  return items.map((i) => ({ sealId: i.sealId, gated: i.gated, key: i.key }));
}

/** ABI of SilentRelease.sol that the mirror, key service and reader use. */
export const SILENT_RELEASE_ABI = [
  {
    type: "event",
    name: "Released",
    inputs: [
      { name: "idHash", type: "bytes32", indexed: true },
      { name: "sealId", type: "string", indexed: false },
      { name: "key", type: "bytes", indexed: false },
    ],
  },
  {
    type: "event",
    name: "ReleasedGated",
    inputs: [
      { name: "idHash", type: "bytes32", indexed: true },
      { name: "sealId", type: "string", indexed: false },
    ],
  },
  {
    type: "function",
    name: "isReleased",
    stateMutability: "view",
    inputs: [{ name: "sealId", type: "string" }],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    type: "function",
    name: "releasedAt",
    stateMutability: "view",
    inputs: [{ name: "sealId", type: "string" }],
    outputs: [{ name: "", type: "uint64" }],
  },
] as const;
