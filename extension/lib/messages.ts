import { browser } from "wxt/browser";
import type { WireState } from "./wire";
import type { MyPost, ReaderToken } from "./storage";
import type { SealDraft } from "@iigs/core";

export type Msg =
  | { type: "states"; ids: string[]; force?: boolean }
  | { type: "context" }
  | { type: "refresh-config" }
  | { type: "start-arm"; draft: SealDraft; tabId: number | null }
  | { type: "armed"; sealId: string; ownerNullifier?: string; post: string }
  | { type: "reader-token"; token: string; nationality: string; expiresAt: number }
  | { type: "reader-key"; sealId: string }
  | { type: "fetch-cipher"; ref: string }
  | { type: "open-verify" }
  | { type: "open-vault" }
  | { type: "apply-base-url" }
  | { type: "insert"; text: string; tabId?: number };

export type Reply<T> = ({ ok: true } & T) | { ok: false; error: string; code?: string };

export type MsgReply = {
  states: Reply<{ states: Record<string, WireState | null> }>;
  context: Reply<{ baseUrl: string; reader: ReaderToken | null; swarmGateway: string }>;
  "refresh-config": Reply<{ config: import("./wire").PublicConfig }>;
  "start-arm": Reply<{}>;
  armed: Reply<{ inserted: boolean }>;
  "reader-token": Reply<{}>;
  "reader-key": Reply<{ keyB64: string }>;
  "fetch-cipher": Reply<{ b64: string }>;
  "open-verify": Reply<{}>;
  "open-vault": Reply<{}>;
  "apply-base-url": Reply<{}>;
  insert: Reply<{ inserted: boolean; method: string }>;
};

export function send<M extends Msg>(msg: M): Promise<MsgReply[M["type"]]> {
  return browser.runtime.sendMessage(msg) as Promise<MsgReply[M["type"]]>;
}

export type TabMsg = { type: "iigs-insert"; text: string };
export type { MyPost };
