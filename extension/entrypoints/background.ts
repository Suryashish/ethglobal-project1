import { browser } from "wxt/browser";
import { toBase64 } from "@iigs/core";
import { addMine, get, getBaseUrl, set, type MyPost } from "../lib/storage";
import { normalizeConfig, normalizeStates, type PublicConfig, type WireState } from "../lib/wire";
import type { Msg, TabMsg } from "../lib/messages";
import { armUrl } from "../lib/draft";
import { expiresAtMs, nowSec } from "../lib/format";

const STATE_TTL_MS = 20_000;
const CONFIG_TTL_MS = 10 * 60_000;
const cache = new Map<string, { at: number; state: WireState | null }>();

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
      cache.set(id, { at: Date.now(), state: norm[id] ?? null });
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
  const draft = pending && pending.draft.sealId === m.sealId ? pending.draft : null;
  const post: MyPost = {
    sealId: m.sealId,
    ownerNullifier: m.ownerNullifier,
    post: m.post,
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
      inserted = (await insertIntoTab(pending.tabId, m.post)).inserted;
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

async function handle(m: Msg, sender: { tab?: { id?: number } }): Promise<unknown> {
  switch (m.type) {
    case "states":
      return { ok: true, states: await getStates(m.ids, !!m.force) };
    case "context": {
      const cfg = await get("config");
      return { ok: true, baseUrl: await getBaseUrl(), reader: await validReader(), swarmGateway: cfg?.value.swarmGateway ?? "https://api.gateway.ethswarm.org" };
    }
    case "refresh-config":
      return { ok: true, config: await getConfig(true) };
    case "start-arm": {
      await set("pending", { draft: m.draft, tabId: m.tabId, createdAt: nowSec() });
      await browser.tabs.create({ url: armUrl(await getBaseUrl(), m.draft) });
      return { ok: true };
    }
    case "armed":
      return { ok: true, ...(await onArmed(m)) };
    case "reader-token":
      await set("reader", { token: m.token, nationality: m.nationality, expiresAt: m.expiresAt });
      return { ok: true };
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
      await browser.tabs.create({ url: (await getBaseUrl()) + "/vault" });
      return { ok: true };
    case "apply-base-url":
      cache.clear();
      await set("config", null);
      await ensureBridge();
      return { ok: true };
    case "insert": {
      const tabId = m.tabId ?? sender.tab?.id;
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
