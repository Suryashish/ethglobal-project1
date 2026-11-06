import { findSealIds } from "@iigs/core";

/** Post-text containers per site. */
export const TEXT_SELECTORS = [
  '[data-testid="tweetText"]',
  '[data-testid="post-title"]',
  'shreddit-post [slot="text-body"]',
  'shreddit-post [slot="title"]',
  'shreddit-comment [slot="comment"]',
  '[slot="text-body"]',
  ".md",
].join(",");

export const MARK = "data-iigs-mark";

/** Text of an element plus link targets (X shows shortened URL text; the href has the full /s/<id>). */
export function textWithLinks(el: Element): string {
  let t = el.textContent ?? "";
  for (const a of Array.from(el.querySelectorAll("a"))) {
    t += " " + (a.getAttribute("href") ?? "") + " " + (a.getAttribute("title") ?? "") + " " + (a.getAttribute("data-expanded-url") ?? "");
  }
  return t;
}

export type Found = { el: Element; ids: string[] };

function blocked(el: Element): boolean {
  return !!el.closest(`[${MARK}]`) || !!el.querySelector(`[${MARK}]`) || !!el.closest("[data-iigs-card]");
}

/**
 * Finds post-text elements that reference seal ids and are not marked yet.
 * Falls back to a text-node walk over `article` elements for sites with other markup.
 */
export function scanRoot(root: ParentNode): Found[] {
  const found: Found[] = [];
  const claimed = new Set<Element>();
  for (const el of Array.from(root.querySelectorAll(TEXT_SELECTORS))) {
    if (blocked(el)) continue;
    const ids = findSealIds(textWithLinks(el));
    if (ids.length) {
      found.push({ el, ids });
      claimed.add(el);
    }
  }
  const doc = (root as Document).ownerDocument ?? (root as Document);
  const articles = Array.from(root.querySelectorAll("article"));
  for (const art of articles) {
    const walker = doc.createTreeWalker(art, 4 /* NodeFilter.SHOW_TEXT */);
    let n: Node | null;
    while ((n = walker.nextNode())) {
      const text = n.nodeValue ?? "";
      if (text.length < 20 || !text.includes("IIGS") && !text.includes("/s/")) continue;
      const ids = findSealIds(text);
      const parent = n.parentElement;
      if (!ids.length || !parent) continue;
      if ([...claimed].some((c) => c.contains(parent))) continue;
      if (blocked(parent)) continue;
      found.push({ el: parent, ids });
      claimed.add(parent);
    }
  }
  return found;
}
