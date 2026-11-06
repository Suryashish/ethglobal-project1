import { Bee } from "@ethersphere/bee-js";
import { optional } from "./env";
import { ApiError } from "./errors";

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024 + 1024; // 10 MiB file + envelope/nonce overhead

export const beeUrl = () => optional("SWARM_BEE_URL", "https://api.gateway.ethswarm.org");
export const batchId = () => optional("SWARM_BATCH_ID", "0".repeat(64));
export const REF_RE = /^[0-9a-f]{64}$/;

/** Plain (unencrypted) upload of OUR ciphertext. Returns the 64-hex reference. */
export async function uploadToSwarm(bytes: Uint8Array): Promise<string> {
  const bee = new Bee(beeUrl());
  try {
    // bee-js 13: bee.data.upload(batch, data) -> { reference }
    const res = await bee.data.upload(batchId(), bytes);
    return res.reference.toHex();
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new ApiError(502, "swarm_upload_failed", `Swarm upload failed: ${msg.slice(0, 240)}`);
  }
}

export async function downloadFromSwarm(ref: string): Promise<Response> {
  const base = optional("NEXT_PUBLIC_SWARM_GATEWAY", beeUrl()).replace(/\/+$/, "");
  const res = await fetch(`${base}/bytes/${ref}`);
  if (!res.ok) throw new ApiError(res.status === 404 ? 404 : 502, "swarm_read_failed", `Swarm returned ${res.status}`);
  return res;
}
