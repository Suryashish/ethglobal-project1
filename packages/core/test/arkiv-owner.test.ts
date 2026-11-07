import { describe, expect, it } from "vitest";
import { bytes, str } from "@arkiv-network/sdk/schema";
import { ARKIV_MAX_STR_BYTES, ownerFromRow, ownerKey, ownerValues, toHex } from "../src/arkiv/index.js";

// Shape of a real World ID 4.0 Selfie Check session id: "session_" + 128 hex = 136 bytes (> Arkiv's 128-byte str cap).
const SESSION = "session_" + "1d16361b7a5a45a70e862a0df200cb408d0670e00f370fa622b96".padEnd(128, "ab");

describe("arkiv owner id storage", () => {
  it("long World session ids get a short indexed key plus the full id as bytes", () => {
    expect(new TextEncoder().encode(SESSION).length).toBeGreaterThan(ARKIV_MAX_STR_BYTES);
    const v = ownerValues(SESSION);
    expect(v.ownerNullifier).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(new TextEncoder().encode(v.ownerNullifier).length).toBeLessThanOrEqual(ARKIV_MAX_STR_BYTES);
    expect(() => str(SESSION)).toThrow(/128-byte limit/); // the exact failure seen on arm
    expect(() => str(v.ownerNullifier)).not.toThrow(); // what we now write passes the SDK's own validation
    expect(() => bytes(v.ownerSession!)).not.toThrow();
    expect(ownerKey(SESSION)).toBe(v.ownerNullifier); // deterministic: listSealsByOwner finds it
    expect(ownerFromRow(v.ownerNullifier, toHex(v.ownerSession!) as `0x${string}`)).toBe(SESSION);
  });

  it("short ids (mock, nullifiers, older seals) are stored as-is with no bytes column", () => {
    for (const id of ["mock:abc", "world:16", "session_abcd"]) {
      expect(ownerValues(id)).toEqual({ ownerNullifier: id });
      expect(ownerFromRow(id, undefined)).toBe(id);
    }
  });

  it("ignores an ownerSession that does not hash to the indexed key", () => {
    const v = ownerValues(SESSION);
    const other = toHex(new TextEncoder().encode(SESSION.replace("1d", "ff"))) as `0x${string}`;
    expect(ownerFromRow(v.ownerNullifier, other)).toBe(v.ownerNullifier);
  });
});
