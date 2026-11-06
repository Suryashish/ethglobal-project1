/**
 * Raw Arkiv JSON-RPC (`arkiv_query`) request building + response parsing.
 * The CRE runtime cannot use @arkiv-network/sdk, so this reproduces what the SDK sends:
 *
 *   {"method":"arkiv_query","params":["arkiv.schema = str('iigs.seal') AND dep = str('dev') AND $owner = addr(0x…)",
 *     {"select":{"key":true,"attributes":{…names…}},"limit":"0x64","offset":"0x0"}]}
 *
 * Attribute values come back as {name,type,value}: u64 → "0x…" quantity, bytes → "0x…" data, str → string.
 * The large `cipherInline` attribute is never selected.
 */
export const SCHEMA = {
  seal: "iigs.seal",
  checkin: "iigs.checkin",
  disarm: "iigs.disarm",
  release: "iigs.release",
} as const;

export const PAGE_SIZE = 100; // node maximum

/** Attributes selected per schema (no cipherInline; wrappedKeyEscrow is fetched on demand). */
export const SELECT_ATTRS = {
  seal: ["sealId", "kind", "audience", "releaseAt", "intervalSec", "createdAt"],
  checkin: ["sealId", "expiresAtSec"],
  disarm: ["sealId"],
  release: ["sealId"],
  wrappedKey: ["sealId", "wrappedKeyEscrow"],
} as const;

const DEP_RE = /^[A-Za-z0-9._:-]{1,64}$/;
const ADDR_RE = /^0x[0-9a-fA-F]{40}$/;
const SEAL_ID_RE = /^[A-Za-z0-9._:-]{1,128}$/;

export function buildQuery(schema: string, dep: string, owner: string, sealId?: string): string {
  if (!DEP_RE.test(dep)) throw new Error(`bad dep tag: ${dep}`);
  if (!ADDR_RE.test(owner)) throw new Error(`bad owner address: ${owner}`);
  let q = `arkiv.schema = str('${schema}') AND dep = str('${dep}') AND $owner = addr(${owner})`;
  if (sealId !== undefined) {
    if (!SEAL_ID_RE.test(sealId)) throw new Error(`bad sealId: ${sealId}`);
    q += ` AND sealId = str('${sealId}')`;
  }
  return q;
}

export function buildRequestBody(query: string, attrs: readonly string[], offset: number, limit = PAGE_SIZE): string {
  const attributes: Record<string, boolean> = { "arkiv.schema": true };
  for (const a of attrs) attributes[a] = true;
  return JSON.stringify({
    jsonrpc: "2.0",
    id: 1,
    method: "arkiv_query",
    params: [query, { select: { key: true, attributes }, limit: "0x" + limit.toString(16), offset: "0x" + offset.toString(16) }],
  });
}

export type RpcAttribute = { name: string; type: string; value: unknown };
export type RpcRow = { key?: string; attributes?: RpcAttribute[] };
export type QueryPage = { rows: Record<string, unknown>[]; blockNumber: string | undefined };

/** Decodes one attribute by its declared type tag. u64 → number, bytes → lowercase 0x hex, str → string. */
export function decodeAttr(type: string, value: unknown): unknown {
  switch (type) {
    case "u64":
    case "u256":
    case "i32": {
      if (typeof value === "number") return value;
      if (typeof value === "string") {
        if (/^0x[0-9a-fA-F]+$/.test(value) || /^-?\d+$/.test(value)) return Number(BigInt(value));
      }
      throw new Error(`bad ${type} value: ${String(value)}`);
    }
    case "bytes":
      if (typeof value !== "string") throw new Error("bad bytes value");
      return value.toLowerCase();
    case "bool":
      return value === true || value === "true";
    default:
      return typeof value === "string" ? value : String(value);
  }
}

/** Parses an arkiv_query JSON-RPC response body into flat rows { attrName: decodedValue, $key }. */
export function parseQueryResponse(json: unknown): QueryPage {
  const r = json as { result?: { data?: RpcRow[]; blockNumber?: string }; error?: { code?: number; message?: string } };
  if (r?.error) throw new Error(`arkiv_query error ${r.error.code}: ${r.error.message}`);
  const data = r?.result?.data;
  if (!Array.isArray(data)) throw new Error("arkiv_query: malformed response (no result.data)");
  const rows = data.map((e) => {
    const row: Record<string, unknown> = { $key: e.key };
    for (const a of e.attributes ?? []) row[a.name] = decodeAttr(a.type, a.value);
    return row;
  });
  return { rows, blockNumber: r.result?.blockNumber };
}
