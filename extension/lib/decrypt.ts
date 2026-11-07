import { fromBase64, fromUtf8, openSeal } from "@iigs/core";

export type Decrypted =
  | { kind: "text"; text: string }
  | { kind: "file"; name: string; mime: string; size: number; bytes: Uint8Array };

/** Raster image types that are safe to preview inline under a post. SVG is excluded on purpose (it is a document, not a bitmap). */
const PREVIEW_MIMES = new Set(["image/png", "image/jpeg", "image/gif", "image/webp", "image/avif"]);
export const isPreviewableImage = (mime: string) => PREVIEW_MIMES.has(mime.trim().toLowerCase());

export function decryptWithKey(params: { sealId: string; key: Uint8Array; cipher: Uint8Array; contentHash: string }): Decrypted {
  const env = openSeal({ sealId: params.sealId, key: params.key, ciphertext: params.cipher, contentHash: params.contentHash });
  if (env.header.kind === "text") return { kind: "text", text: fromUtf8(env.body) };
  return { kind: "file", name: env.header.name, mime: env.header.mime, size: env.header.size, bytes: env.body };
}

export function decryptFromB64(sealId: string, keyB64: string, cipherB64: string, contentHash: string): Decrypted {
  return decryptWithKey({ sealId, key: fromBase64(keyB64), cipher: fromBase64(cipherB64), contentHash });
}
