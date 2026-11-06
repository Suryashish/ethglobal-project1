/**
 * "Post on X / Reddit" links that open the site's composer with the cover phrase already filled in.
 * Pure (no DOM), so it is unit-tested; ShareButtons renders them as plain links in a new tab.
 */
export type ShareTarget = { id: "x" | "reddit"; label: string; href: string };

const q = encodeURIComponent;

/** @param phrase the cover phrase (see @iigs/core encodeCover) — posted as-is, nothing else added. */
export function shareTargets(phrase: string): ShareTarget[] {
  return [
    { id: "x", label: "Post on X", href: `https://x.com/intent/tweet?text=${q(phrase)}` },
    // Reddit text post with the phrase as its title: titles show in full in every feed (bodies get truncated).
    { id: "reddit", label: "Post on Reddit", href: `https://www.reddit.com/submit?type=TEXT&title=${q(phrase)}` },
  ];
}
