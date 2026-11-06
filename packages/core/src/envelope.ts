/**
 * The plaintext envelope: what gets encrypted. It carries a small JSON header (kind, filename,
 * mime type) so the reader knows how to render the content after decryption.
 *
 * Layout: magic "IIGS1" (5 bytes) || headerLen u32 big-endian || header JSON (utf8) || body
 */
import { concat, fromUtf8, utf8 } from "./bytes.js";

const MAGIC = utf8("IIGS1");

export type EnvelopeHeader =
  | { kind: "text" }
  | { kind: "file"; name: string; mime: string; size: number };

export type Envelope = { header: EnvelopeHeader; body: Uint8Array };

export function packEnvelope(env: Envelope): Uint8Array {
  const header = utf8(JSON.stringify(env.header));
  const len = new Uint8Array(4);
  new DataView(len.buffer).setUint32(0, header.length, false);
  return concat(MAGIC, len, header, env.body);
}

export function unpackEnvelope(bytes: Uint8Array): Envelope {
  if (bytes.length < MAGIC.length + 4) throw new Error("envelope too short");
  for (let i = 0; i < MAGIC.length; i++) {
    if (bytes[i] !== MAGIC[i]) throw new Error("not an IIGS envelope");
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const headerLen = view.getUint32(MAGIC.length, false);
  const start = MAGIC.length + 4;
  if (start + headerLen > bytes.length) throw new Error("envelope header out of range");
  const header = JSON.parse(fromUtf8(bytes.subarray(start, start + headerLen))) as EnvelopeHeader;
  if (header.kind !== "text" && header.kind !== "file") throw new Error("unknown envelope kind");
  return { header, body: bytes.slice(start + headerLen) };
}

export function textEnvelope(text: string): Uint8Array {
  return packEnvelope({ header: { kind: "text" }, body: utf8(text) });
}

export function fileEnvelope(name: string, mime: string, body: Uint8Array): Uint8Array {
  return packEnvelope({
    header: { kind: "file", name: name.slice(0, 200), mime: mime || "application/octet-stream", size: body.length },
    body,
  });
}
