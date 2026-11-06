/**
 * Escrow-key unwrap, byte-for-byte the scheme in @iigs/core `crypto.ts` (`unwrapKey`):
 *   wrapped = eph_pk(32) || nonce(24) || XChaCha20-Poly1305(kek, nonce, K, aad="iigs-wrap-v2:" + sealId)
 *   kek     = HKDF-SHA256(ikm = X25519(sk, eph_pk), salt = eph_pk || recipient_pk, info = "iigs-wrap-v2:" + sealId)
 * The sealId binding stops a wrapped key copied into another seal from being released under that seal.
 */
import { xchacha20poly1305 } from "@noble/ciphers/chacha.js";
import { x25519 } from "@noble/curves/ed25519.js";
import { hkdf } from "@noble/hashes/hkdf.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { concat, utf8 } from "./bytes";

export const WRAPPED_KEY_BYTES = 32 + 24 + 32 + 16; // 104
export function unwrapKey(wrapped: Uint8Array, recipientSecretKey: Uint8Array, sealId: string): Uint8Array {
  if (!sealId) throw new Error("unwrap needs the sealId");
  const info = utf8(`iigs-wrap-v2:${sealId}`);
  if (wrapped.length !== WRAPPED_KEY_BYTES) throw new Error("wrapped key has wrong length");
  const ephPk = wrapped.subarray(0, 32);
  const nonce = wrapped.subarray(32, 56);
  const ct = wrapped.subarray(56);
  const recipientPk = x25519.getPublicKey(recipientSecretKey);
  const shared = x25519.getSharedSecret(recipientSecretKey, ephPk);
  const kek = hkdf(sha256, shared, concat(ephPk, recipientPk), info, 32);
  return xchacha20poly1305(kek, nonce, info).decrypt(ct);
}
