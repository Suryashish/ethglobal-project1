import { describe, expect, it } from "vitest";
import { ADJ, ADV, NOUN, NOUN_PL, PREP, VERB } from "../src/cover-words.js";
import { COVER_WORDS, decodeCover, encodeCover, findCoverSealIds, findSealIds, newSealId } from "../src/index.js";

describe("cover phrase", () => {
  it("word lists have the frozen sizes, unique entries, letters only", () => {
    const lists = { ADJ, NOUN, NOUN_PL, VERB, ADV, PREP };
    const sizes = { ADJ: 256, NOUN: 256, NOUN_PL: 256, VERB: 128, ADV: 64, PREP: 16 };
    for (const [k, l] of Object.entries(lists)) {
      expect(l.length, k).toBe(sizes[k as keyof typeof sizes]);
      expect(new Set(l).size, k).toBe(l.length);
      for (const w of l) expect(w, k).toMatch(/^[a-z]+$/);
    }
  });

  it("is frozen: a known id always gives the same phrase", () => {
    // If this fails, the word lists or the encoding changed and every posted phrase would break.
    expect(encodeCover("0123456789abcdef")).toMatchInlineSnapshot(`"Grand chimneys glisten eagerly within the upper notebook. Warmly, ready trees wade beneath the fine river."`);
  });

  it("round-trips random ids, fits a tweet, reads as two sentences", () => {
    for (let i = 0; i < 500; i++) {
      const id = newSealId();
      const p = encodeCover(id);
      expect(decodeCover(p)).toBe(id);
      expect(p.length).toBeLessThan(160);
      expect(p).toMatch(/^[A-Z][a-z]+( [a-z]+){4} the [a-z]+ [a-z]+\. [A-Z][a-z]+, ([a-z]+ ){4}the [a-z]+ [a-z]+\.$/);
      expect(p.split(/\s+/).length).toBe(COVER_WORDS);
      // no legacy markers: nothing in the text says "seal"
      expect(findSealIds(p)).toEqual([]);
      expect(p.toLowerCase()).not.toContain("seal");
    }
  });

  it("edge ids encode and decode", () => {
    for (const id of ["0000000000000000", "zzzzzzzzzzzzzzzz", "a0a0a0a0a0a0a0a0"]) expect(decodeCover(encodeCover(id))).toBe(id);
  });

  it("is found inside surrounding text, in any case, with odd spacing and punctuation", () => {
    const id = newSealId();
    const p = encodeCover(id);
    expect(findCoverSealIds(`gm everyone!! ${p} #mood`)).toEqual([id]);
    expect(findCoverSealIds(p.toUpperCase())).toEqual([id]);
    expect(findCoverSealIds(p.replace(/ /g, "\n  ").replace(/\./g, "!"))).toEqual([id]);
    const id2 = newSealId();
    expect(findCoverSealIds(`${p}\n\n${encodeCover(id2)}`).sort()).toEqual([id, id2].sort());
  });

  it("rejects edited phrases (checksum) and ordinary text", () => {
    const id = newSealId();
    const words = encodeCover(id).split(" ");
    let rejected = 0;
    // swap one word for another valid word of the same kind: must not decode to the original id
    for (let i = 0; i < 200; i++) {
      const w = [...words];
      const [j, list] = ([[0, ADJ], [1, NOUN_PL], [2, VERB], [3, ADV], [4, PREP], [6, ADJ]] as const)[i % 6]!;
      const clean = w[j]!.toLowerCase().replace(/[^a-z]/g, "");
      const repl = list[(list.indexOf(clean) + 1 + (i % (list.length - 1))) % list.length]!; // always a different word
      w[j] = j === 0 ? repl[0]!.toUpperCase() + repl.slice(1) : repl;
      const got = decodeCover(w.join(" "));
      expect(got).not.toBe(id);
      if (got === null) rejected++;
    }
    expect(rejected).toBeGreaterThan(195); // 15-bit checksum: an edited phrase almost never decodes to any id
    expect(findCoverSealIds("The quick brown fox jumps over the lazy dog. Slowly, the river runs past the old mill.")).toEqual([]);
    expect(findCoverSealIds("")).toEqual([]);
  });

  it("rejects non-ids", () => {
    expect(() => encodeCover("short")).toThrow();
    expect(() => encodeCover("ABCDEFGHIJKLMNOP")).toThrow();
  });
});
