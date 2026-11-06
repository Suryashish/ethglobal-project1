import { encodeCover } from "@iigs/core";
import { describe, expect, it } from "vitest";
import { sealIdFromInput } from "./sealInput";

const ID = "7297zmq67qld8zbb";

describe("sealIdFromInput", () => {
  it("reads links, bare ids and tokens", () => {
    expect(sealIdFromInput(`https://example.org/s/${ID}`)).toBe(ID);
    expect(sealIdFromInput(`https://example.org/s/${ID}?new=1`)).toBe(ID);
    expect(sealIdFromInput(`  ${ID}\n`)).toBe(ID);
    expect(sealIdFromInput(`look ⟦IIGS:${ID}⟧ here`)).toBe(ID);
  });
  it("decodes a hidden post, even with text around it", () => {
    expect(sealIdFromInput(encodeCover(ID))).toBe(ID);
    expect(sealIdFromInput(`Ana Ferreira @ana · 3d\n${encodeCover(ID)}\n12 48 210`)).toBe(ID);
  });
  it("returns null for ordinary text", () => {
    expect(sealIdFromInput("")).toBeNull();
    expect(sealIdFromInput("The quick brown fox jumps over the lazy dog.")).toBeNull();
    expect(sealIdFromInput("https://example.org/s/short")).toBeNull();
  });
});
