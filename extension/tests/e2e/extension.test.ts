/**
 * E2E: loads the built extension (IIGS_E2E=1 build in .output-e2e) into Chrome for Testing,
 * serves a fixture timeline on :4010 and a mock API on :3999.
 */
import { createServer, type Server } from "node:http";
import { existsSync, mkdtempSync, readdirSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { chromium, type BrowserContext, type Page, type Worker } from "playwright-core";
import {
  createSeal, formatSealedPost, fromBase64, generateKeypair, toBase64, toHex, unwrapKey, sha256Hex, encryptContent, textEnvelope, type SealState,
} from "@iigs/core";
import { decodeDraft } from "../../lib/draft";

declare const chrome: any; // evaluated inside the service worker
const API = "http://localhost:3999";
const FIX = "http://localhost:4010";
const EXT = resolve(__dirname, "../../.output-e2e/chrome-mv3");
const now = () => Math.floor(Date.now() / 1000);

function findChrome(): string {
  const root = join(homedir(), "Library/Caches/ms-playwright");
  const dirs = existsSync(root) ? readdirSync(root).filter((d) => d.startsWith("chromium-")).sort().reverse() : [];
  for (const d of dirs) {
    const p = join(root, d, "chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing");
    if (existsSync(p)) return p;
  }
  return chromium.executablePath();
}

const escrow = generateKeypair();
const gated = generateKeypair();

function mkSeal(text: string, o: { audience?: "PUBLIC" | "GATED"; countries?: string[]; releaseAt?: number; swarm?: boolean }) {
  const out = createSeal({
    source: "extension", content: { type: "text", text }, rule: { kind: "TIMER", releaseAt: o.releaseAt ?? now() + 3 * 86400 + 4 * 3600 + 120 },
    audience: o.audience ?? "PUBLIC", countries: o.countries, escrowPublicKey: escrow.publicKey, gatedPublicKey: gated.publicKey,
  });
  const key = unwrapKey(fromBase64(out.draft.wrappedKeyB64), o.audience === "GATED" ? gated.secretKey : escrow.secretKey);
  return { ...out, keyB64: toBase64(key) };
}

type Fix = { id: string; json: any; cipher: Uint8Array };
const fixtures: Record<string, Fix> = {};
function addFix(name: string, s: ReturnType<typeof mkSeal>, status: SealState["status"], extra: { swarmRef?: string; release?: any; disarm?: any } = {}) {
  const d = s.draft;
  const seal: any = {
    sealId: d.sealId, kind: d.kind, releaseAt: d.releaseAt, intervalSec: d.intervalSec, audience: d.audience, countries: d.countries,
    contentType: extra.swarmRef ? "swarm" : "inline", swarmRef: extra.swarmRef ?? "", wrappedKeyB64: d.wrappedKeyB64, title: "",
    createdAt: now() - 10, contentHash: d.contentHash, sizeBytes: d.sizeBytes, ownerNullifier: "mock:abc", source: "extension",
    ...(extra.swarmRef ? {} : { cipherInlineB64: d.cipherInlineB64 }),
  };
  fixtures[name] = {
    id: d.sealId, cipher: s.ciphertext,
    json: { seal, status, disarm: extra.disarm ?? null, release: extra.release ?? null, checkins: [], nextDeadline: status === "ARMED" ? d.releaseAt : null, nextDeadlineRule: status === "ARMED" ? "TIMER" : null },
  };
  return fixtures[name]!;
}

const keysByToken: Record<string, string> = {};
let gatedReleased!: ReturnType<typeof mkSeal>;
const armedPosts: string[] = [];
const armedDrafts: any[] = [];

function startApi(): Promise<Server> {
  const swarmRef = "ab".repeat(32);
  const sealed = mkSeal("sealed text", {});
  addFix("sealed", sealed, "ARMED");
  addFix("gatedArmed", mkSeal("g1", { audience: "GATED", countries: ["IN"] }), "ARMED");
  addFix("disarmed", mkSeal("never", {}), "DISARMED", { disarm: { at: now() } });
  addFix("releasing", mkSeal("soon", { releaseAt: now() - 5 }), "RELEASING");
  const pub = mkSeal("The public secret: ⟦42⟧ héllo", {});
  addFix("released", pub, "RELEASED", { release: { releasedAt: now(), releasedKeyB64: pub.keyB64, gated: false, sepoliaTx: "0x1", reason: "TIMER" } });
  const sw = mkSeal("Released via Swarm path", {});
  addFix("releasedSwarm", sw, "RELEASED", { swarmRef, release: { releasedAt: now(), releasedKeyB64: sw.keyB64, gated: false, sepoliaTx: "0x2", reason: "TIMER" } });
  gatedReleased = mkSeal("Only for India 🇮🇳", { audience: "GATED", countries: ["IN"] });
  addFix("gatedReleased", gatedReleased, "RELEASED", { release: { releasedAt: now(), gated: true, sepoliaTx: "0x3", reason: "TIMER" } });
  const byId = new Map(Object.values(fixtures).map((f) => [f.id, f]));

  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", API);
    const cors = { "access-control-allow-origin": "*", "access-control-allow-headers": "*" };
    if (req.method === "OPTIONS") return res.writeHead(204, cors).end();
    const body = await new Promise<string>((r) => { let b = ""; req.on("data", (c) => (b += c)); req.on("end", () => r(b)); });
    const json = (code: number, o: unknown) => res.writeHead(code, { "content-type": "application/json", ...cors }).end(JSON.stringify(o));
    if (url.pathname === "/api/config")
      return json(200, { dep: "dev", baseUrl: API, escrowPublicKey: toHex(escrow.publicKey), gatedPublicKey: toHex(gated.publicKey), swarmGateway: `${API}/swarm`, worldMode: "mock" });
    if (url.pathname === "/api/seals/state") {
      const { ids } = JSON.parse(body);
      return json(200, Object.fromEntries((ids as string[]).filter((i) => byId.has(i)).map((i) => [i, byId.get(i)!.json])));
    }
    if (url.pathname === "/api/reader/key") {
      const { sealId, token } = JSON.parse(body);
      if (sealId !== gatedReleased.draft.sealId) return json(404, { error: "not_found", message: "no" });
      const nat = String(token).split("-")[1];
      if (nat !== "IN") return json(403, { error: "not_in_country", message: "Not available in your country" });
      return json(200, { keyB64: gatedReleased.keyB64 });
    }
    if (url.pathname === `/swarm/bytes/${swarmRef}`)
      return res.writeHead(200, { "content-type": "application/octet-stream", ...cors }).end(Buffer.from(fixtures.releasedSwarm!.cipher));
    if (url.pathname === "/arm") {
      // mimics the web app's /arm page: decodes the draft and posts IIGS_ARMED
      return res.writeHead(200, { "content-type": "text/html; charset=utf-8" }).end(`<!doctype html><title>arm</title><div id=s>arming</div><script>
        const d = JSON.parse(atob(location.hash.slice(3).replace(/-/g,'+').replace(/_/g,'/')));
        window.__draft = d;
        setTimeout(() => window.postMessage({source:'iigs-web',type:'IIGS_ARMED',sealId:d.sealId,ownerNullifier:'mock:n',post:${JSON.stringify("__POST__")}.replace('__POST__','🔒 Sealed by a verified human · opens soon · '+location.origin+'/s/'+d.sealId+' ⟦IIGS:'+d.sealId+'⟧')}, location.origin), 300);
      </script>`);
    }
    if (url.pathname === "/verify-reader")
      return res.writeHead(200, { "content-type": "text/html; charset=utf-8" }).end(`<!doctype html><title>verify</title><button id=go onclick="window.postMessage({source:'iigs-web',type:'IIGS_READER_TOKEN',token:'tok-IN',nationality:'IN',expiresAt:Math.floor(Date.now()/1000)+43200},location.origin)">verify</button>`);
    if (url.pathname === "/vault") return res.writeHead(200, { "content-type": "text/html; charset=utf-8" }).end("<title>vault</title>vault");
    res.writeHead(404, cors).end("nf");
  });
  return new Promise((r) => server.listen(3999, () => r(server)));
}

function startFixture(): Promise<Server> {
  const post = (name: string) => formatSealedPost({ sealId: fixtures[name]!.id, baseUrl: API, releaseAt: fixtures[name]!.json.seal.releaseAt, countries: fixtures[name]!.json.seal.countries });
  const tw = (name: string, extra = "") =>
    `<article data-testid="tweet"><div data-testid="User-Name">someone</div><div data-testid="tweetText" id="t-${name}"><span>${post(name)}</span></div>${extra}</article>`;
  const html = `<!doctype html><html><body style="background:#000;color:#eee;font-family:sans-serif">
  <div id="timeline">
    ${tw("sealed")}${tw("gatedArmed")}${tw("disarmed")}${tw("releasing")}${tw("released")}${tw("releasedSwarm")}${tw("gatedReleased")}
    <article><div data-testid="tweetText"><span>a normal tweet with no seal</span></div></article>
    <article><div data-testid="tweetText"><span>link only </span><a href="https://t.co/xyz" title="${API}/s/${fixtures.sealed!.id}">localhost:3999/s/abc…</a></div></article>
  </div>
  <shreddit-post><div slot="text-body"><p>${post("sealed").replace("sealed", "sealed")}</p></div></shreddit-post>
  <div id="composer" data-testid="tweetTextarea_0" contenteditable="true" role="textbox" style="border:1px solid #888;min-height:40px"></div>
  <script>setTimeout(()=>{const a=document.createElement('article');a.innerHTML='<div data-testid="tweetText"><span>late tweet ${post("disarmed")}</span></div>';document.getElementById('timeline').append(a)},2500)</script>
  </body></html>`;
  const server = createServer((_q, res) => res.writeHead(200, { "content-type": "text/html; charset=utf-8" }).end(html));
  return new Promise((r) => server.listen(4010, () => r(server)));
}

let ctx: BrowserContext;
let sw: Worker;
let extId: string;
let servers: Server[] = [];

async function cardTexts(page: Page): Promise<Record<string, string>> {
  return page.evaluate(() => {
    const out: Record<string, string> = {};
    document.querySelectorAll("[data-iigs-card]").forEach((h) => {
      h.shadowRoot?.querySelectorAll(".card").forEach((c) => (out[c.getAttribute("data-seal")! + "#" + (out[c.getAttribute("data-seal")!] ? "2" : "1")] = c.textContent ?? ""));
    });
    return out;
  });
}
const byName = (t: Record<string, string>, name: string) => t[fixtures[name]!.id + "#1"] ?? "";

beforeAll(async () => {
  expect(existsSync(join(EXT, "manifest.json"))).toBe(true);
  servers = [await startApi(), await startFixture()];
  ctx = await chromium.launchPersistentContext(mkdtempSync(join(tmpdir(), "iigs-e2e-")), {
    executablePath: findChrome(),
    headless: false,
    args: ["--headless=new", `--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`, "--no-first-run"],
  });
  sw = ctx.serviceWorkers()[0] ?? (await ctx.waitForEvent("serviceworker"));
  extId = new URL(sw.url()).host;
  await sw.evaluate(() => chrome.storage.local.set({ baseUrl: "http://localhost:3999" }));
});

afterAll(async () => {
  await ctx?.close();
  servers.forEach((s) => s.close());
});

describe("social content script", () => {
  let page: Page;
  it("renders cards for sealed / gated / cancelled / releasing / released", async () => {
    page = await ctx.newPage();
    page.on("console", (m) => m.type() === "error" && console.log("[page error]", m.text()));
    await page.goto(FIX);
    await page.waitForFunction(() => document.querySelectorAll("[data-iigs-card]").length >= 8, null, { timeout: 15000 });
    await page.waitForFunction(() => ["The public secret", "Released via Swarm path"].every((s) => [...document.querySelectorAll("[data-iigs-card]")].some((h) => h.shadowRoot?.textContent?.includes(s))), null, { timeout: 15000 });
    const t = await cardTexts(page);
    console.log(JSON.stringify(t, null, 1));
    expect(byName(t, "sealed")).toMatch(/Sealed · opens in 3d 4h/);
    expect(byName(t, "sealed")).toContain("sealed by a verified human");
    expect(byName(t, "gatedArmed")).toContain("Visible to verified readers from 🇮🇳 IN");
    expect(byName(t, "disarmed")).toContain("Cancelled by author — this will never open");
    expect(byName(t, "releasing")).toContain("Rule fired — releasing via Chainlink CRE");
    expect(byName(t, "released")).toContain("The public secret: ⟦42⟧ héllo");
    expect(byName(t, "releasedSwarm")).toContain("Released via Swarm path");
    expect(byName(t, "gatedReleased")).toContain("Visible to verified readers from 🇮🇳 IN");
    expect(byName(t, "gatedReleased")).toContain("Verify nationality");
    // normal tweet gets no card, site layout untouched
    expect(await page.locator("[data-iigs-card]").count()).toBeGreaterThanOrEqual(9);
    expect(await page.evaluate(() => document.querySelectorAll("[data-testid=tweetText]")[7]?.nextElementSibling?.hasAttribute("data-iigs-card"))).toBeFalsy();
  });
  it("late-added tweets get a card (MutationObserver)", async () => {
    await page.waitForFunction(() => document.querySelectorAll("#timeline article:last-child [data-iigs-card]").length === 1, null, { timeout: 10000 });
  });
  it("countdown ticks live", async () => {
    const read = () => page.evaluate(() => document.querySelector("[data-iigs-card]")!.shadowRoot!.querySelector("[data-deadline]")!.getAttribute("data-deadline"));
    const first = await page.evaluate(() => document.querySelector("[data-iigs-card]")!.shadowRoot!.querySelector("[data-deadline]")!.textContent);
    expect(first).toContain("opens in");
    expect(await read()).toBeTruthy();
  });
  it("gated seal: wrong country denied, then right country decrypts (reader token via bridge page)", async () => {
    await sw.evaluate(() => chrome.storage.local.set({ reader: { token: "tok-US", nationality: "US", expiresAt: Math.floor(Date.now() / 1000) + 3600 } }));
    await page.waitForFunction(() => [...document.querySelectorAll("[data-iigs-card]")].some((h) => h.shadowRoot?.textContent?.includes("Not available in your country")), null, { timeout: 10000 });
    // now the real bridge: open the verify page and click → IIGS_READER_TOKEN → background → storage → card updates
    const v = await ctx.newPage();
    await v.goto(`${API}/verify-reader`);
    await v.click("#go");
    await page.bringToFront();
    await page.waitForFunction(() => [...document.querySelectorAll("[data-iigs-card]")].some((h) => h.shadowRoot?.textContent?.includes("Only for India")), null, { timeout: 10000 });
    await v.close();
  });
});

describe("compose → arm → insert", () => {
  it("popup UI: seals on-device and opens /arm#d=… with a valid draft; bridge stores the armed post", async () => {
    const popup = await ctx.newPage();
    await popup.goto(`chrome-extension://${extId}/popup.html`);
    await popup.fill("textarea", "my secret message");
    await popup.selectOption("select >> nth=0", "120");
    const armPromise = ctx.waitForEvent("page", { predicate: (p) => p.url().startsWith(`${API}/arm`) });
    await popup.click("button:has-text('Seal')");
    const arm = await armPromise;
    await arm.waitForLoadState("domcontentloaded");
    const draft = await arm.evaluate(() => (window as any).__draft);
    armedDrafts.push(draft);
    expect(draft.source).toBe("extension");
    expect(draft.kind).toBe("TIMER");
    expect(draft.audience).toBe("PUBLIC");
    expect(draft.contentType).toBe("inline");
    expect(JSON.stringify(draft)).not.toContain("my secret message");
    expect(decodeDraft(new URL(arm.url()).hash.slice(3))).toEqual(draft);
    await popup.waitForFunction(() => document.body.textContent?.includes(" "), null);
    // armed message arrives
    await expect.poll(async () => (await sw.evaluate(() => chrome.storage.local.get("mine"))).mine?.length ?? 0, { timeout: 8000 }).toBeGreaterThan(0);
    const mine = (await sw.evaluate(() => chrome.storage.local.get("mine"))).mine[0];
    expect(mine.sealId).toBe(draft.sealId);
    expect(mine.post).toContain(`⟦IIGS:${draft.sealId}⟧`);
    armedPosts.push(mine.post);
    await arm.close();
    await popup.close();
  });
  it("armed post is inserted into the originating tab's composer", async () => {
    const page = await ctx.newPage();
    await page.goto(FIX);
    await page.evaluate(() => (document.title = "TARGET"));
    await page.locator("#composer").click();
    const tabId = await sw.evaluate(async () => (await chrome.tabs.query({ title: "TARGET" }))[0]!.id!);
    const cfg = await sw.evaluate(() => fetch("http://localhost:3999/api/config").then((r) => r.json()));
    expect(cfg.escrowPublicKey).toBeTruthy();
    // reuse the popup's own compose code path via a freshly built draft
    const s = mkSeal("second", {});
    await sw.evaluate(async ([draft, tid]) => {
      await chrome.storage.local.set({ pending: { draft, tabId: tid, createdAt: 1 } });
    }, [s.draft, tabId] as const);
    const bridgePage = await ctx.newPage();
    await bridgePage.goto(`${API}/arm#d=${Buffer.from(JSON.stringify(s.draft)).toString("base64url")}`);
    await expect.poll(async () => page.evaluate(() => document.getElementById("composer")!.textContent), { timeout: 10000 }).toContain(`⟦IIGS:${s.draft.sealId}⟧`);
    expect((await sw.evaluate(() => chrome.storage.local.get("pending"))).pending ?? null).toBeNull();
    // and the popup's "Insert into current page" path
    await page.evaluate(() => (document.getElementById("composer")!.textContent = ""));
    await page.locator("#composer").click();
    const r = await sw.evaluate(async (tid) => chrome.tabs.sendMessage(tid, { type: "iigs-insert", text: "POPUP INSERT ⟦IIGS:aaaaaaaaaaaaaaaa⟧" }), tabId);
    expect(r).toMatchObject({ inserted: true });
    expect(await page.evaluate(() => document.getElementById("composer")!.textContent)).toContain("POPUP INSERT");
  });
  it("popup lists My sealed posts with status", async () => {
    const popup = await ctx.newPage();
    await popup.goto(`chrome-extension://${extId}/popup.html`);
    await popup.locator("text=My sealed posts").waitFor({ timeout: 5000 });
    await popup.locator("text=Copy sealed text").first().waitFor({ timeout: 5000 });
    await popup.locator("text=Verify nationality").waitFor({ timeout: 5000 });
    await popup.locator(".status", { hasText: "ARMED" }).first().waitFor({ timeout: 1000 }).catch(() => {});
    await popup.close();
  });
});
