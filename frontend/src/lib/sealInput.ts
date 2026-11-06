import { decodeCover } from "@iigs/core";

/** Pulls a seal id out of whatever someone pasted: a seal link, a bare id, a ⟦IIGS:…⟧ token, or a hidden post's text. */
export function sealIdFromInput(raw: string): string | null {
  const t = raw.trim();
  if (!t) return null;
  const link = t.match(/\/s\/([0-9a-z]{16})(?![0-9a-z])/);
  if (link) return link[1]!;
  if (/^[0-9a-z]{16}$/.test(t)) return t;
  const token = t.match(/⟦IIGS:([0-9a-z]{16})⟧/);
  if (token) return token[1]!;
  return decodeCover(t);
}
