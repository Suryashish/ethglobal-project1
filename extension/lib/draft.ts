import { fromBase64, fromUtf8, toBase64Url, utf8, type SealDraft } from "@iigs/core";

/** Draft → fragment payload for `${baseUrl}/arm#d=<this>`. */
export function encodeDraft(draft: SealDraft): string {
  return toBase64Url(utf8(JSON.stringify(draft)));
}

export function decodeDraft(b64url: string): SealDraft {
  return JSON.parse(fromUtf8(fromBase64(b64url))) as SealDraft;
}

export function armUrl(baseUrl: string, draft: SealDraft): string {
  return `${baseUrl.replace(/\/+$/, "")}/arm#d=${encodeDraft(draft)}`;
}
