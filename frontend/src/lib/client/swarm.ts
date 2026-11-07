/**
 * Uploads our ciphertext (already encrypted in this browser) to Swarm.
 *
 * Small payloads go through our /api/swarm/upload proxy. Hosted serverless platforms cap request bodies
 * (Vercel: ~4.5 MB → 413 FUNCTION_PAYLOAD_TOO_LARGE), so larger payloads go straight from the browser to the
 * public Swarm gateway, which allows CORS uploads. Either way only ciphertext leaves the device.
 */
export const PROXY_MAX_BYTES = 4 * 1024 * 1024;
const NO_STAMP = "0".repeat(64); // the public gateway stamps uploads itself
const REF_RE = /^[0-9a-f]{64}$/;

async function readRef(res: Response, via: string): Promise<string> {
  const j = (await res.json().catch(() => ({}))) as { reference?: string; message?: string };
  if (!res.ok) throw new Error(j.message ?? `Swarm upload failed (${via}, HTTP ${res.status})`);
  if (!j.reference || !REF_RE.test(j.reference)) throw new Error(`Swarm upload returned no reference (${via})`);
  return j.reference;
}

export async function uploadCiphertext(bytes: Uint8Array, gateway: string): Promise<string> {
  const body = bytes as unknown as BodyInit;
  if (bytes.length <= PROXY_MAX_BYTES) {
    const res = await fetch("/api/swarm/upload", { method: "POST", headers: { "content-type": "application/octet-stream" }, body });
    return readRef(res, "proxy");
  }
  let last: unknown;
  // Content-addressed: retrying the same bytes always yields the same reference.
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(`${gateway.replace(/\/+$/, "")}/bytes`, {
        method: "POST",
        headers: { "content-type": "application/octet-stream", "swarm-postage-batch-id": NO_STAMP },
        body,
      });
      return await readRef(res, "gateway");
    } catch (e) {
      last = e;
      if (attempt < 3) await new Promise((r) => setTimeout(r, 1500 * attempt));
    }
  }
  throw last instanceof Error ? last : new Error("Swarm upload failed");
}
