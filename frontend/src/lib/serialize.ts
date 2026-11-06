/** SealState <-> JSON (Uint8Array as base64 strings). Shared by server routes and browser fallbacks. */
import { fromBase64, toBase64, type SealState } from "@iigs/core";

export type SealStateJson = Omit<SealState, "seal" | "release"> & {
  seal: Omit<SealState["seal"], "cipherInline" | "wrappedKeyEscrow"> & {
    cipherInlineB64?: string;
    wrappedKeyB64: string;
  };
  release:
    | (Omit<NonNullable<SealState["release"]>, "releasedKey"> & { releasedKeyB64?: string })
    | null;
};

export function sealStateToJson(s: SealState): SealStateJson {
  const { cipherInline, wrappedKeyEscrow, ...seal } = s.seal;
  const release = s.release
    ? (() => {
        const { releasedKey, ...r } = s.release;
        return { ...r, ...(releasedKey && releasedKey.length ? { releasedKeyB64: toBase64(releasedKey) } : {}) };
      })()
    : null;
  return {
    ...s,
    seal: {
      ...seal,
      ...(cipherInline && cipherInline.length ? { cipherInlineB64: toBase64(cipherInline) } : {}),
      wrappedKeyB64: toBase64(wrappedKeyEscrow),
    },
    release,
  };
}

export function sealStateFromJson(j: SealStateJson): SealState {
  const { cipherInlineB64, wrappedKeyB64, ...seal } = j.seal;
  const release = j.release
    ? (() => {
        const { releasedKeyB64, ...r } = j.release;
        return { ...r, ...(releasedKeyB64 ? { releasedKey: fromBase64(releasedKeyB64) } : {}) };
      })()
    : null;
  return {
    ...j,
    seal: {
      ...seal,
      ...(cipherInlineB64 ? { cipherInline: fromBase64(cipherInlineB64) } : {}),
      wrappedKeyEscrow: fromBase64(wrappedKeyB64),
    },
    release,
  };
}
