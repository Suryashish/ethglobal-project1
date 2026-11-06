import { fromBase64, fromUtf8, openSeal } from "@iigs/core";

export type Decrypted = { kind: "text"; text: string } | { kind: "file"; name: string; mime: string; size: number };

export function decryptWithKey(params: { sealId: string; key: Uint8Array; cipher: Uint8Array; contentHash: string }): Decrypted {
  const env = openSeal({ sealId: params.sealId, key: params.key, ciphertext: params.cipher, contentHash: params.contentHash });
  if (env.header.kind === "text") return { kind: "text", text: fromUtf8(env.body) };
  return { kind: "file", name: env.header.name, mime: env.header.mime, size: env.header.size };
}

export function decryptFromB64(sealId: string, keyB64: string, cipherB64: string, contentHash: string): Decrypted {
  return decryptWithKey({ sealId, key: fromBase64(keyB64), cipher: fromBase64(cipherB64), contentHash });
}
