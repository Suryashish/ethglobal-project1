import { describe, expect, it } from "vitest";
import { encodeCover, formatSealedPost } from "@iigs/core";
import { scanRoot } from "../lib/scan";

const A = "abcd1234efgh5678";
const B = "zzzz0000yyyy1111";
const C = "0a1b2c3d4e5f6g7h";

describe("scan: hidden cover phrases", () => {
  it("X: finds a cover phrase in tweet text (split across spans, with extra words) and marks it covert", () => {
    const words = encodeCover(A).split(" ");
    document.body.innerHTML = `
      <article data-testid="tweet"><div data-testid="tweetText">
        <span>gm ✨ ${words.slice(0, 7).join(" ")}</span><span> ${words.slice(7).join(" ")}</span><span> #poetry</span>
      </div></article>
      <article data-testid="tweet"><div data-testid="tweetText"><span>an ordinary tweet about rivers and lanterns</span></div></article>`;
    const f = scanRoot(document);
    expect(f).toHaveLength(1);
    expect(f[0]!.ids).toEqual([A]);
    expect([...f[0]!.covert]).toEqual([A]);
    expect(f[0]!.el.getAttribute("data-testid")).toBe("tweetText");
  });

  it("Reddit (new UI): finds the phrase in a slotted post title, a body and a comment", () => {
    document.body.innerHTML = `
      <shreddit-post><a slot="title" id="post-title-t3_1">${encodeCover(A)}</a>
        <div slot="text-body"><p>${encodeCover(B)}</p></div></shreddit-post>
      <shreddit-comment><div slot="comment"><p>reply: ${encodeCover(C)}</p></div></shreddit-comment>`;
    const f = scanRoot(document);
    const byId = Object.fromEntries(f.map((x) => [x.ids[0], x]));
    expect(Object.keys(byId).sort()).toEqual([A, B, C].sort());
    expect(byId[A]!.el.getAttribute("slot")).toBe("title");
    for (const x of f) expect(x.covert.size).toBe(1);
  });

  it("old.reddit: finds the phrase in a.title", () => {
    document.body.innerHTML = `<div class="thing"><p class="title"><a class="title" href="/r/x/1">${encodeCover(B)}</a></p></div>`;
    const f = scanRoot(document);
    expect(f.map((x) => x.ids)).toEqual([[B]]);
  });

  it("legacy token posts stay visible (not covert); both kinds can live in one element", () => {
    const legacy = formatSealedPost({ sealId: A, baseUrl: "http://localhost:3000", releaseAt: 1800000000 });
    document.body.innerHTML = `<div data-testid="tweetText">${legacy} and ${encodeCover(B)}</div>`;
    const f = scanRoot(document);
    expect(f[0]!.ids).toEqual([A, B]);
    expect([...f[0]!.covert]).toEqual([B]);
  });

  it("an edited phrase or ordinary text is ignored; marked elements are not rescanned", () => {
    const edited = encodeCover(A).replace(/^\w+/, "Purple");
    document.body.innerHTML = `<div data-testid="tweetText">${edited === encodeCover(A) ? "x" : edited}</div>
      <div data-testid="tweetText">The quick brown fox jumps over the lazy dog. Slowly, the river runs past the old mill.</div>
      <div data-testid="tweetText" id="ok">${encodeCover(C)}</div>`;
    const f = scanRoot(document);
    expect(f.map((x) => x.ids[0])).toEqual([C]);
    document.getElementById("ok")!.setAttribute("data-iigs-mark", C);
    expect(scanRoot(document)).toHaveLength(0);
  });
});
