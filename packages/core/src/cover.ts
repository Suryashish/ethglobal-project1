/**
 * Cover phrase: a seal id hidden in two ordinary-looking sentences, e.g.
 *
 *   "Amber rivers wander slowly beneath the patient lantern. Softly, golden foxes drift toward the quiet harbor."
 *
 * The phrase is what the author posts on X / Reddit. It carries only a pointer (the seal id): the encrypted
 * content stays on Arkiv / Swarm and can only be opened after the release. A reader without the extension
 * sees a normal post; the Silent Seal extension decodes the phrase and, once the seal has been released,
 * decrypts the message under the post.
 *
 * Encoding: the 16-char base-36 seal id (< 2^83) plus a 15-bit checksum is one 98-bit number, written in
 * mixed radix over 14 word slots (2 × [ADJ 256, NOUN_PL 256, VERB 128, ADV 64, PREP 16, ADJ 256, NOUN 256] = 2^98).
 * Decoding is case-, punctuation- and whitespace-insensitive and needs the exact 16-word sequence plus a valid
 * checksum, so ordinary text never decodes by accident.
 */
import { sha256 } from "@noble/hashes/sha2.js";
import { utf8 } from "./bytes.js";
import { isSealId, SEAL_ID_LENGTH } from "./ids.js";
import { ADJ, ADV, NOUN, NOUN_PL, PREP, VERB } from "./cover-words.js";

const ALPHABET = "0123456789abcdefghijklmnopqrstuvwxyz";
const CHECK_BITS = 15n;
const CHECK_MASK = (1n << CHECK_BITS) - 1n;
const ID_LIMIT = 36n ** BigInt(SEAL_ID_LENGTH);

type Slot = { list: readonly string[]; index: Map<string, number> } | "the";
const slot = (list: readonly string[]): Slot => ({ list, index: new Map(list.map((w, i) => [w, i])) });
const A = slot(ADJ), N = slot(NOUN), NP = slot(NOUN_PL), V = slot(VERB), D = slot(ADV), P = slot(PREP);

/** Sentence 1: "Adj nouns verb adv prep the adj noun." · Sentence 2: "Adv, adj nouns verb prep the adj noun." */
const PATTERN: readonly Slot[] = [A, NP, V, D, P, "the", A, N, D, A, NP, V, P, "the", A, N];
export const COVER_WORDS = PATTERN.length;

function check(sealId: string): bigint {
  const h = sha256(utf8(`iigs-cover-v1:${sealId}`));
  return BigInt((h[0]! << 8) | h[1]!) & CHECK_MASK;
}

function idToBig(id: string): bigint {
  let v = 0n;
  for (const c of id) v = v * 36n + BigInt(ALPHABET.indexOf(c));
  return v;
}
function bigToId(v: bigint): string {
  let s = "";
  for (let i = 0; i < SEAL_ID_LENGTH; i++) {
    s = ALPHABET[Number(v % 36n)]! + s;
    v /= 36n;
  }
  return s;
}

const cap = (w: string) => w[0]!.toUpperCase() + w.slice(1);

/** The cover phrase for a seal id (deterministic: the same id always gives the same phrase). */
export function encodeCover(sealId: string): string {
  if (!isSealId(sealId)) throw new Error(`bad seal id: ${sealId}`);
  let n = (idToBig(sealId) << CHECK_BITS) | check(sealId);
  const words = PATTERN.map((s) => {
    if (s === "the") return "the";
    const r = BigInt(s.list.length);
    const w = s.list[Number(n % r)]!;
    n /= r;
    return w;
  });
  const [a1, n1, v1, d1, p1, , a2, n2, d2, a3, n3, v2, p2, , a4, n4] = words;
  return `${cap(a1!)} ${n1} ${v1} ${d1} ${p1} the ${a2} ${n2}. ${cap(d2!)}, ${a3} ${n3} ${v2} ${p2} the ${a4} ${n4}.`;
}

/** Decodes exactly COVER_WORDS lowercase tokens; null if they are not a valid cover phrase. */
function decodeTokens(tokens: readonly string[]): string | null {
  let n = 0n;
  let mul = 1n;
  for (let i = 0; i < PATTERN.length; i++) {
    const s = PATTERN[i]!;
    const t = tokens[i];
    if (s === "the") {
      if (t !== "the") return null;
      continue;
    }
    const d = t === undefined ? undefined : s.index.get(t);
    if (d === undefined) return null;
    n += BigInt(d) * mul;
    mul *= BigInt(s.list.length);
  }
  const idVal = n >> CHECK_BITS;
  if (idVal >= ID_LIMIT) return null;
  const id = bigToId(idVal);
  return (n & CHECK_MASK) === check(id) ? id : null;
}

const tokenize = (text: string) => text.toLowerCase().match(/[a-z]+/g) ?? [];

/** All seal ids hidden as cover phrases anywhere in `text` (surrounding words are fine), de-duplicated. */
export function findCoverSealIds(text: string): string[] {
  const t = tokenize(text);
  const out = new Set<string>();
  for (let i = 0; i + COVER_WORDS <= t.length; i++) {
    // cheap pre-filter: both "the" positions must match before decoding
    if (t[i + 5] !== "the" || t[i + 13] !== "the") continue;
    const id = decodeTokens(t.slice(i, i + COVER_WORDS));
    if (id) out.add(id);
  }
  return [...out];
}

/** The seal id if `text` is (or contains) a cover phrase, else null. */
export function decodeCover(text: string): string | null {
  return findCoverSealIds(text)[0] ?? null;
}
