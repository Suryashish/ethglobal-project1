import { browser } from "wxt/browser";
import type { SealDraft } from "@iigs/core";
import type { PublicConfig } from "./wire";

export const DEFAULT_BASE_URL = "http://localhost:3000";

export type ReaderToken = { token: string; nationality: string; expiresAt: number };
export type MyPost = {
  sealId: string;
  ownerNullifier?: string;
  post: string;
  createdAt: number;
  kind?: SealDraft["kind"];
  releaseAt?: number;
  intervalSec?: number;
  countries?: string[];
};
export type Pending = { draft: SealDraft; tabId: number | null; createdAt: number };

type Shape = {
  baseUrl: string;
  config: { at: number; value: PublicConfig } | null;
  reader: ReaderToken | null;
  mine: MyPost[];
  pending: Pending | null;
};

export async function get<K extends keyof Shape>(key: K): Promise<Shape[K] | undefined> {
  const r = await browser.storage.local.get(key);
  return r[key] as Shape[K] | undefined;
}
export async function set<K extends keyof Shape>(key: K, value: Shape[K]): Promise<void> {
  await browser.storage.local.set({ [key]: value });
}

export async function getBaseUrl(): Promise<string> {
  const v = await get("baseUrl");
  return (v || DEFAULT_BASE_URL).replace(/\/+$/, "");
}

export async function addMine(p: MyPost): Promise<void> {
  const list = (await get("mine")) ?? [];
  const next = [p, ...list.filter((x) => x.sealId !== p.sealId)].slice(0, 100);
  await set("mine", next);
}
