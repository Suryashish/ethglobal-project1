import { COVER_WORDS, findCoverSealIds, findSealIds } from "@iigs/core";

/** Post-text containers on X and Reddit (new "shreddit" UI and old.reddit). */
export const TEXT_SELECTORS = [
  // X
  '[data-testid="tweetText"]',
  // Reddit (new UI): post titles in feeds and on the post page, bodies, comments
  '[data-testid="post-title"]',
  'shreddit-post [slot="title"]',
  'a[id^="post-title-"]',
  'shreddit-post [slot="text-body"]',
  'shreddit-comment [slot="comment"]',
  '[slot="text-body"]',
  // old.reddit
  "a.title",
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

/**
 * `ids` = every seal referenced by the element. `covert` = the subset found only as a hidden cover phrase:
 * those get NO card until the seal has opened (before that the post must look like any other post).
 */
export type Found = { el: Element; ids: string[]; covert: Set<string> };

function blocked(el: Element): boolean {
  return !!el.closest(`[${MARK}]`) || !!el.querySelector(`[${MARK}]`) || !!el.closest("[data-iigs-card]");
}

/** Seal ids in a text: legacy token / link (visible badges) and cover phrases (hidden until opened). */
export function idsIn(text: string): { ids: string[]; covert: Set<string> } {
  const visible = findSealIds(text);
  const covert = findCoverSealIds(text).filter((id) => !visible.includes(id));
  return { ids: [...visible, ...covert], covert: new Set(covert) };
}

// A cover phrase is 16 words (~90+ chars); cheaper text nodes cannot hold one.
const MIN_COVER_CHARS = COVER_WORDS * 3;

/**
 * Finds post-text elements that reference seal ids and are not marked yet.
 * Falls back to a text-node walk over `article` elements for sites with other markup.
 */
export function scanRoot(root: ParentNode): Found[] {
  const found: Found[] = [];
  const claimed = new Set<Element>();
  for (const el of Array.from(root.querySelectorAll(TEXT_SELECTORS))) {
    if (blocked(el)) continue;
    const r = idsIn(textWithLinks(el));
    if (r.ids.length) {
      found.push({ el, ...r });
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
      const legacy = text.includes("IIGS") || text.includes("/s/");
      if (text.length < 20 || (!legacy && text.length < MIN_COVER_CHARS)) continue;
      const r = idsIn(text);
      const parent = n.parentElement;
      if (!r.ids.length || !parent) continue;
      if ([...claimed].some((c) => c.contains(parent))) continue;
      if (blocked(parent)) continue;
      found.push({ el: parent, ...r });
      claimed.add(parent);
    }
  }
  return found;
}
