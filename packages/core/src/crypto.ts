/**
 * IF I GO SILENT crypto.
 *
 * - Content: XChaCha20-Poly1305 with a fresh 32-byte key K per seal. AAD binds the ciphertext
 *   to its sealId, so a ciphertext cannot be swapped under another seal's record.
 *   Layout: nonce(24) || ciphertext+tag.
 * - Key escrow: K is wrapped to an X25519 public key, sealed-box style:
 *   eph_pk(32) || nonce(24) || XChaCha20-Poly1305(kek, nonce, K, aad="iigs-wrap-v1")
 *   where kek = HKDF-SHA256(ikm = X25519(eph_sk, recipient_pk), salt = eph_pk || recipient_pk,
 *   info = "iigs-wrap-v1").
 *
 * All primitives are @noble (pure JS), so the same code runs in the browser, the extension,
 * Node and inside the Chainlink CRE workflow runtime.
 */
import { xchacha20poly1305 } from "@noble/ciphers/chacha.js";
import { x25519 } from "@noble/curves/ed25519.js";
import { hkdf } from "@noble/hashes/hkdf.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { concat, fromHex, toHex, utf8 } from "./bytes.js";

export const KEY_BYTES = 32;
export const NONCE_BYTES = 24;
export const WRAPPED_KEY_BYTES = 32 + 24 + 32 + 16; // eph_pk + nonce + K + tag = 104
const WRAP_INFO = utf8("iigs-wrap-v1");

export function randomBytes(n: number): Uint8Array {
  const out = new Uint8Array(n);
  globalThis.crypto.getRandomValues(out);
  return out;
}

export function generateContentKey(): Uint8Array {
  return randomBytes(KEY_BYTES);
}

function sealAad(sealId: string): Uint8Array {
  return utf8(`iigs-content-v1:${sealId}`);
}

/** Encrypts plaintext under K for this sealId. Returns nonce || ciphertext. */
export function encryptContent(key: Uint8Array, sealId: string, plaintext: Uint8Array): Uint8Array {
  if (key.length !== KEY_BYTES) throw new Error("content key must be 32 bytes");
  const nonce = randomBytes(NONCE_BYTES);
  const ct = xchacha20poly1305(key, nonce, sealAad(sealId)).encrypt(plaintext);
  return concat(nonce, ct);
}

/** Decrypts nonce || ciphertext. Throws if the key, sealId or data are wrong. */
export function decryptContent(key: Uint8Array, sealId: string, payload: Uint8Array): Uint8Array {
  if (key.length !== KEY_BYTES) throw new Error("content key must be 32 bytes");
  if (payload.length < NONCE_BYTES + 16) throw new Error("ciphertext too short");
  const nonce = payload.subarray(0, NONCE_BYTES);
  const ct = payload.subarray(NONCE_BYTES);
  return xchacha20poly1305(key, nonce, sealAad(sealId)).decrypt(ct);
}

export type X25519Keypair = { secretKey: Uint8Array; publicKey: Uint8Array };

export function generateKeypair(): X25519Keypair {
  const secretKey = randomBytes(32);
  return { secretKey, publicKey: x25519.getPublicKey(secretKey) };
}

export function publicKeyFromSecret(secretKey: Uint8Array): Uint8Array {
  return x25519.getPublicKey(secretKey);
}

function deriveKek(shared: Uint8Array, ephPk: Uint8Array, recipientPk: Uint8Array): Uint8Array {
  return hkdf(sha256, shared, concat(ephPk, recipientPk), WRAP_INFO, 32);
}

/** Wraps the 32-byte content key K to a recipient X25519 public key. */
export function wrapKey(key: Uint8Array, recipientPublicKey: Uint8Array): Uint8Array {
  if (key.length !== KEY_BYTES) throw new Error("content key must be 32 bytes");
  if (recipientPublicKey.length !== 32) throw new Error("recipient public key must be 32 bytes");
  const eph = generateKeypair();
  const shared = x25519.getSharedSecret(eph.secretKey, recipientPublicKey);
  const kek = deriveKek(shared, eph.publicKey, recipientPublicKey);
  const nonce = randomBytes(NONCE_BYTES);
  const ct = xchacha20poly1305(kek, nonce, WRAP_INFO).encrypt(key);
  return concat(eph.publicKey, nonce, ct);
}

/** Unwraps a wrapped key with the recipient's X25519 secret key. Throws on tampering. */
export function unwrapKey(wrapped: Uint8Array, recipientSecretKey: Uint8Array): Uint8Array {
  if (wrapped.length !== WRAPPED_KEY_BYTES) throw new Error("wrapped key has wrong length");
  const ephPk = wrapped.subarray(0, 32);
  const nonce = wrapped.subarray(32, 56);
  const ct = wrapped.subarray(56);
  const recipientPk = x25519.getPublicKey(recipientSecretKey);
  const shared = x25519.getSharedSecret(recipientSecretKey, ephPk);
  const kek = deriveKek(shared, ephPk, recipientPk);
  return xchacha20poly1305(kek, nonce, WRAP_INFO).decrypt(ct);
}

export function sha256Hex(data: Uint8Array | string): string {
  return toHex(sha256(typeof data === "string" ? utf8(data) : data));
}

export { fromHex, toHex };
