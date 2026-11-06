import { describe, expect, it } from "vitest";
import { decodeCover, encodeCover } from "@iigs/core";
import { shareTargets } from "./share";

const sealId = "abcdefghjkmnpqrs";
const phrase = encodeCover(sealId);
const byId = (id: string) => shareTargets(phrase).find((t) => t.id === id)!;
const param = (href: string, key: string) => new URL(href).searchParams.get(key);

describe("share targets", () => {
  it("only X and Reddit", () => {
    expect(shareTargets(phrase).map((t) => t.id)).toEqual(["x", "reddit"]);
  });
  it("X gets exactly the cover phrase, which still decodes to the seal", () => {
    const text = param(byId("x").href, "text")!;
    expect(text).toBe(phrase);
    expect(decodeCover(text)).toBe(sealId);
    expect(byId("x").href.startsWith("https://x.com/intent/tweet?")).toBe(true);
  });
  it("Reddit gets a text post titled with the cover phrase (no link, nothing else)", () => {
    const h = byId("reddit").href;
    expect(param(h, "type")).toBe("TEXT");
    expect(param(h, "title")).toBe(phrase);
    expect(param(h, "url")).toBeNull();
    expect(phrase.length).toBeLessThanOrEqual(300); // Reddit title limit
  });
});
