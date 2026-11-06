import { browser } from "wxt/browser";
import { encodeCover, isSealId, toBase64 } from "@iigs/core";
import { addMine, get, getBaseUrl, set, type MyPost } from "../lib/storage";
import { normalizeConfig, normalizeStates, type PublicConfig, type WireState } from "../lib/wire";
import type { Msg, TabMsg } from "../lib/messages";
import { armUrl } from "../lib/draft";
import { expiresAtMs, nowSec } from "../lib/format";

const STATE_TTL_MS = 20_000;
const CONFIG_TTL_MS = 10 * 60_000;
const cache = new Map<string, { at: number; state: WireState | null }>();
const CACHE_MAX = 500;
function cachePut(id: string, v: { at: number; state: WireState | null }) {
  cache.delete(id);
  cache.set(id, v);
  while (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value as string); // LRU: drop the oldest
}

async function api(path: string, init?: RequestInit): Promise<Response> {
  const base = await getBaseUrl();
  return fetch(base + path, init);
}

async function errorFrom(res: Response): Promise<{ error: string; code?: string }> {
  try {
    const j = await res.json();
    return { error: j.message || j.error || `HTTP ${res.status}`, code: j.error };
  } catch {
    return { error: `HTTP ${res.status}` };
  }
}

async function getConfig(refresh = false): Promise<PublicConfig> {
  const cached = await get("config");
  if (!refresh && cached && Date.now() - cached.at < CONFIG_TTL_MS) return cached.value;
  const res = await api("/api/config");
  if (!res.ok) throw new Error(`config: HTTP ${res.status}`);
  const value = normalizeConfig(await res.json());
  await set("config", { at: Date.now(), value });
  return value;
}

async function getStates(ids: string[], force: boolean): Promise<Record<string, WireState | null>> {
  const out: Record<string, WireState | null> = {};
  const need: string[] = [];
  for (const id of ids) {
    const c = cache.get(id);
    if (!force && c && Date.now() - c.at < STATE_TTL_MS) out[id] = c.state;
    else need.push(id);
  }
  for (let i = 0; i < need.length; i += 50) {
    const batch = need.slice(i, i + 50);
    const res = await api("/api/seals/state", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ids: batch }),
    });
    if (!res.ok) throw new Error((await errorFrom(res)).error);
    const norm = normalizeStates(await res.json(), batch);
    for (const id of batch) {
      cachePut(id, { at: Date.now(), state: norm[id] ?? null });
      out[id] = norm[id] ?? null;
    }
  }
  return out;
}

async function validReader() {
  const r = await get("reader");
  if (!r || expiresAtMs(r.expiresAt) <= Date.now()) return null;
  return r;
}

async function fetchCipher(ref: string): Promise<string> {
  if (!/^[0-9a-f]{64}$/i.test(ref)) throw new Error("bad swarm reference");
  const cfg = await getConfig().catch(() => null);
  const urls = [`${cfg?.swarmGateway ?? "https://api.gateway.ethswarm.org"}/bytes/${ref}`, `${await getBaseUrl()}/api/swarm/${ref}`];
  let last = "";
  for (const u of urls) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const res = await fetch(u);
        if (res.ok) return toBase64(new Uint8Array(await res.arrayBuffer()));
        last = `HTTP ${res.status}`;
      } catch (e) {
        last = String(e);
      }
    }
  }
  throw new Error(`could not load ciphertext (${last})`);
}

async function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function insertIntoTab(tabId: number, text: string): Promise<{ inserted: boolean; method: string }> {
  try {
    const reply = (await browser.tabs.sendMessage(tabId, { type: "iigs-insert", text } satisfies TabMsg)) as
      | { inserted: boolean; method: string }
      | undefined;
    return reply ?? { inserted: false, method: "no-reply" };
  } catch {
    return { inserted: false, method: "no-content-script" };
  }
}

async function onArmed(m: Extract<Msg, { type: "armed" }>) {
  const pending = await get("pending");
  // Only the seal THIS extension handed to the web app may come back as "armed".
  if (!pending || pending.draft.sealId !== m.sealId) throw new Error("not the seal this extension is arming");
  const draft = pending.draft;
  // The text inserted into the user's composer is computed here, never taken from the page.
  const coverPost = encodeCover(m.sealId);
  const post: MyPost = {
    sealId: m.sealId,
    ownerNullifier: m.ownerNullifier,
    post: coverPost,
    createdAt: nowSec(),
    kind: draft?.kind,
    releaseAt: draft?.releaseAt,
    intervalSec: draft?.intervalSec,
    countries: draft?.countries,
  };
  await addMine(post);
  let inserted = false;
  if (draft && pending?.tabId != null) {
    try {
      const tab = await browser.tabs.update(pending.tabId, { active: true });
      if (tab?.windowId != null) await browser.windows.update(tab.windowId, { focused: true });
      await sleep(400);
      inserted = (await insertIntoTab(pending.tabId, coverPost)).inserted;
    } catch {
      /* origin tab gone: the post stays in "My sealed posts" for copy/insert */
    }
    // only clear our own handoff (a newer one may have been stored meanwhile)
    if ((await get("pending"))?.draft.sealId === m.sealId) await set("pending", null);
  }
  return { inserted };
}

/** Registers the bridge on a non-localhost baseUrl origin (needs optional host permission granted by the popup). */
async function ensureBridge() {
  const id = "iigs-bridge-dyn";
  try {
    await browser.scripting.unregisterContentScripts({ ids: [id] });
  } catch {
    /* none registered */
  }
  const base = await getBaseUrl();
  const origin = new URL(base).origin;
  if (origin === "http://localhost:3000") return;
  const granted = await browser.permissions.contains({ origins: [origin + "/*"] });
  if (!granted) return;
  await browser.scripting.registerContentScripts([
    { id, matches: [origin + "/*"], js: ["content-scripts/bridge.js"], runAt: "document_idle", persistAcrossSessions: true },
  ]);
}

type Sender = { id?: string; url?: string; tab?: { id?: number } };

/** Who sent a message: our own pages (popup), the bridge on the web app's origin, or a content script on a site. */
async function senderKind(sender: Sender): Promise<"extension" | "bridge" | "site" | "foreign"> {
  if (sender.id && sender.id !== browser.runtime.id) return "foreign";
  const ownOrigin = new URL(browser.runtime.getURL("/")).origin;
  if (!sender.url || new URL(sender.url).origin === ownOrigin) return "extension";
  const origin = new URL(sender.url).origin;
  return origin === new URL(await getBaseUrl()).origin ? "bridge" : "site";
}

const EXTENSION_ONLY = new Set<Msg["type"]>(["refresh-config", "start-arm", "apply-base-url"]);
const BRIDGE_ONLY = new Set<Msg["type"]>(["armed", "reader-token"]);

async function handle(m: Msg, sender: Sender): Promise<unknown> {
  const kind = await senderKind(sender);
  if (kind === "foreign") return { ok: false, error: "unknown sender" };
  if (EXTENSION_ONLY.has(m.type) && kind !== "extension") return { ok: false, error: "not allowed from a web page" };
  if (BRIDGE_ONLY.has(m.type) && kind !== "bridge") return { ok: false, error: "only the Silent Seal web app may send this" };
  switch (m.type) {
    case "states":
      return { ok: true, states: await getStates(m.ids, !!m.force) };
    case "context": {
      const cfg = await get("config");
      const r = await validReader();
      return {
        ok: true,
        baseUrl: await getBaseUrl(),
        reader: r ? { nationality: r.nationality, expiresAt: r.expiresAt } : null,
        swarmGateway: cfg?.value.swarmGateway ?? "https://api.gateway.ethswarm.org",
      };
    }
    case "refresh-config":
      return { ok: true, config: await getConfig(true) };
    case "start-arm": {
      await set("pending", { draft: m.draft, tabId: m.tabId, createdAt: nowSec() });
      await browser.tabs.create({ url: armUrl(await getBaseUrl(), m.draft) });
      return { ok: true };
    }
    case "armed":
      if (!isSealId(m.sealId)) return { ok: false, error: "bad seal id" };
      return { ok: true, ...(await onArmed(m)) };
    case "reader-token": {
      const now = nowSec();
      const okShape =
        typeof m.token === "string" && m.token.length > 0 && m.token.length <= 2048 &&
        /^[A-Z]{2}$/.test(m.nationality) && Number.isInteger(m.expiresAt) && m.expiresAt > now && m.expiresAt <= now + 2 * 86400;
      if (!okShape) return { ok: false, error: "malformed reader token" };
      await set("reader", { token: m.token, nationality: m.nationality, expiresAt: m.expiresAt });
      return { ok: true };
    }
    case "reader-key": {
      const r = await validReader();
      if (!r) return { ok: false, error: "Verify your nationality first.", code: "no_token" };
      const res = await api("/api/reader/key", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sealId: m.sealId, token: r.token }),
      });
      if (!res.ok) return { ok: false, ...(await errorFrom(res)) };
      const j = await res.json();
      return { ok: true, keyB64: j.keyB64 };
    }
    case "fetch-cipher":
      return { ok: true, b64: await fetchCipher(m.ref) };
    case "open-verify":
      await browser.tabs.create({ url: (await getBaseUrl()) + "/verify-reader" });
      return { ok: true };
    case "open-vault":
      await browser.tabs.create({ url: (await getBaseUrl()) + "/app" });
      return { ok: true };
    case "apply-base-url":
      cache.clear();
      await set("config", null);
      await ensureBridge();
      return { ok: true };
    case "insert": {
      // a page may only insert into its own tab; our popup may target the tab it is attached to
      const tabId = kind === "extension" ? (m.tabId ?? sender.tab?.id) : sender.tab?.id;
      if (tabId == null) return { ok: false, error: "no tab" };
      return { ok: true, ...(await insertIntoTab(tabId, m.text)) };
    }
  }
}

export default defineBackground(() => {
  browser.runtime.onMessage.addListener((raw, sender, sendResponse) => {
    const m = raw as Msg;
    if (!m || typeof m !== "object" || typeof m.type !== "string") return false;
    handle(m, sender).then(sendResponse, (e: unknown) => sendResponse({ ok: false, error: e instanceof Error ? e.message : String(e) }));
    return true;
  });
  browser.runtime.onInstalled.addListener(() => void ensureBridge().catch(() => {}));
  browser.runtime.onStartup.addListener(() => void ensureBridge().catch(() => {}));
});
