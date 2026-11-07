/**
 * Extension against the REAL web app (localhost:3000). Uses the IIGS_E2E extension build (also matches the :4010 fixture).
 * Needs state.json from web.test.ts (sealed + disarmed seal ids) — falls back to creating them.
 */
import { createServer, type Server } from "node:http";
import { existsSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { chromium, type BrowserContext, type Page, type Worker } from "playwright-core";
import { formatSealedPost } from "@iigs/core";
import { APP, HERE, errors, findChrome, loadState, mockVerify, shot, watch } from "./helpers";

declare const chrome: any;
const FIX = "http://localhost:4010";
const EXT = resolve(HERE, "../extension/.output-e2e/chrome-mv3");
const RELEASED = "7297zmq67qld8zbb";
const GATED = "ve1orta9v7ykvdou";

let ctx: BrowserContext, sw: Worker, extId: string, server: Server, fix: Page;
let SEALED = "", DISARMED = "";

async function seal(id: string) {
  const r = await fetch(`${APP}/api/seals/${id}`);
  if (!r.ok) throw new Error(`seal ${id}: ${r.status}`);
  return (await r.json()) as any;
}
const card = (page: Page, id: string) =>
  page.evaluate((id) => {
    for (const h of document.querySelectorAll("[data-iigs-card]"))
      for (const c of h.shadowRoot?.querySelectorAll(".card") ?? []) if (c.getAttribute("data-seal") === id) return c.textContent ?? "";
    return "";
  }, id);
const waitCard = (page: Page, id: string, re: RegExp, timeout = 30_000) =>
  expect.poll(() => card(page, id), { timeout, interval: 500 }).toMatch(re);

beforeAll(async () => {
  expect(existsSync(join(EXT, "manifest.json"))).toBe(true);
  const st = loadState();
  SEALED = st.sealed; DISARMED = st.disarmed;
  expect(SEALED && DISARMED).toBeTruthy();
  const tokens: string[] = [];
  for (const id of [RELEASED, SEALED, DISARMED, GATED]) {
    const s = (await seal(id)).seal;
    tokens.push(`<article data-testid="tweet"><div data-testid="tweetText"><span>${formatSealedPost({ sealId: id, baseUrl: APP, releaseAt: s.releaseAt, countries: s.countries })}</span></div></article>`);
  }
  const html = `<!doctype html><html><body style="background:#000;color:#eee;font-family:sans-serif"><div id="timeline">${tokens.join("")}</div>
   <div id="composer" data-testid="tweetTextarea_0" contenteditable="true" role="textbox" style="border:1px solid #888;min-height:40px"></div></body></html>`;
  server = createServer((_q, res) => res.writeHead(200, { "content-type": "text/html; charset=utf-8" }).end(html));
  await new Promise<void>((r) => server.listen(4010, r));
  ctx = await chromium.launchPersistentContext(mkdtempSync(join(tmpdir(), "iigs-real-")), {
    executablePath: findChrome(), headless: false,
    args: ["--headless=new", `--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`, "--no-first-run"],
  });
  sw = ctx.serviceWorkers()[0] ?? (await ctx.waitForEvent("serviceworker"));
  extId = new URL(sw.url()).host;
  ctx.on("page", (p) => watch(p, p.url().slice(0, 40) || "page"));
  console.log("extension baseUrl default:", (await sw.evaluate(() => chrome.storage.local.get("baseUrl"))).baseUrl ?? "(unset -> default http://localhost:3000)");
});
afterAll(async () => {
  console.log("CONSOLE/PAGE ERRORS:\n" + (errors.join("\n") || "(none)"));
  await ctx?.close();
  server?.close();
});

describe("feed cards against the real app", () => {
  it("6. released / sealed / disarmed / gated cards", async () => {
    fix = await ctx.newPage();
    watch(fix, "fixture");
    await fix.goto(FIX);
    await fix.waitForFunction(() => document.querySelectorAll("[data-iigs-card]").length >= 4, null, { timeout: 30_000 });
    await waitCard(fix, RELEASED, /If you are reading this, I went silent\. — A/);
    await waitCard(fix, SEALED, /Sealed · opens in/);
    expect(await card(fix, SEALED)).toContain("sealed by a verified human");
    await waitCard(fix, DISARMED, /Cancelled by author — this will never open/);
    await waitCard(fix, GATED, /Visible to verified readers from .*IN/);
    expect(await card(fix, GATED)).toContain("Verify nationality");
    console.log("cards:", JSON.stringify({ RELEASED: await card(fix, RELEASED), SEALED: await card(fix, SEALED), DISARMED: await card(fix, DISARMED), GATED: await card(fix, GATED) }, null, 1));
    await shot(fix, "6-extension-feed-cards");
  });

  it("6b. gated reader: Verify nationality → REAL /verify-reader → mock IN → token → card decrypts", async () => {
    await sw.evaluate(() => chrome.storage.local.remove("reader"));
    const vp = ctx.waitForEvent("page", { predicate: (p) => p.url().startsWith(`${APP}/verify-reader`), timeout: 20_000 });
    await fix.bringToFront();
    await fix.evaluate(() => {
      const h = [...document.querySelectorAll("[data-iigs-card]")].find((x) => x.shadowRoot?.textContent?.includes("Verify nationality"))!;
      (h.shadowRoot!.querySelector("button") as HTMLButtonElement).click();
    });
    const v = await vp;
    await v.waitForLoadState("domcontentloaded");
    await v.getByRole("button", { name: /Verify nationality with World ID|Verify again/ }).click();
    await mockVerify(v, { identity: "thief", nationality: "IN" });
    await expect.poll(async () => (await sw.evaluate(() => chrome.storage.local.get("reader"))).reader?.nationality, { timeout: 20_000 }).toBe("IN");
    await shot(v, "6b-verify-reader-page");
    await fix.bringToFront();
    await waitCard(fix, GATED, /Opened by the seal.+ · [\d.]+ (B|KB|MB)Download/, 60_000);
    console.log("gated card after verify (IN):", await card(fix, GATED));
    await shot(fix, "6b-gated-decrypted");
    await v.close();
  });

  it("6c. gated reader with US token is denied", async () => {
    await sw.evaluate(async () => { await chrome.storage.local.remove("reader"); });
    // obtain a genuine US token from the real app
    const v = await ctx.newPage();
    await v.goto(`${APP}/verify-reader`);
    await v.getByRole("button", { name: /Verify nationality with World ID|Verify again/ }).click();
    await mockVerify(v, { identity: "thief", nationality: "US" });
    await expect.poll(async () => (await sw.evaluate(() => chrome.storage.local.get("reader"))).reader?.nationality, { timeout: 20_000 }).toBe("US");
    await fix.bringToFront();
    await fix.reload();
    await waitCard(fix, GATED, /Not available in your country/, 40_000);
    await shot(fix, "6c-gated-denied-US");
    await v.close();
  });
});

describe("handoffs", () => {
  it("(a) popup compose → Seal → REAL /arm#d → mock World → IIGS_ARMED → My sealed posts + composer insert", async () => {
    await fix.bringToFront();
    await fix.goto(FIX);
    await fix.locator("#composer").click();
    const fixTabId = await sw.evaluate(async () => (await chrome.tabs.query({ url: "http://localhost:4010/*" }))[0]!.id!);
    const popup = await ctx.newPage();
    await popup.goto(`chrome-extension://${extId}/popup.html`);
    await popup.fill("textarea", "extension-real-handoff secret");
    await popup.selectOption("select >> nth=0", "120");
    const armP = ctx.waitForEvent("page", { predicate: (p) => p.url().startsWith(`${APP}/arm`), timeout: 30_000 });
    await popup.click("button:has-text('Seal')");
    const arm = await armP;
    // route the insertion to the fixture tab (the popup is a tab here, not a real action popup)
    await sw.evaluate(async (tid) => { const p = (await chrome.storage.local.get("pending")).pending; p.tabId = tid; await chrome.storage.local.set({ pending: p }); }, fixTabId);
    await arm.waitForLoadState("domcontentloaded");
    await arm.getByRole("button", { name: /Arm with World ID/ }).click();
    await mockVerify(arm, { identity: "author" });
    await arm.getByText(/Armed\./).first().waitFor({ timeout: 30_000 });
    await shot(arm, "7a-arm-page-done");
    await expect.poll(async () => (await sw.evaluate(() => chrome.storage.local.get("mine"))).mine?.length ?? 0, { timeout: 15_000 }).toBeGreaterThan(0);
    const mine = (await sw.evaluate(() => chrome.storage.local.get("mine"))).mine[0];
    expect(mine.post).toContain(`⟦IIGS:${mine.sealId}⟧`);
    const st = await seal(mine.sealId);
    expect(st.status).toBe("ARMED");
    expect(st.seal.source).toBe("extension");
    // inserted into the composer?
    await fix.bringToFront();
    await expect.poll(() => fix.evaluate(() => document.getElementById("composer")!.textContent), { timeout: 10_000 }).toContain(`⟦IIGS:${mine.sealId}⟧`);
    await popup.reload();
    await popup.locator("text=My sealed posts").waitFor();
    await popup.locator("text=Copy sealed text").first().waitFor();
    await shot(popup, "7a-popup-my-sealed-posts");
    // new seal is recognised in the feed too
    await fix.evaluate((post) => { const a = document.createElement("article"); a.innerHTML = `<div data-testid="tweetText"><span>${post}</span></div>`; document.getElementById("timeline")!.append(a); }, mine.post);
    await waitCard(fix, mine.sealId, /Sealed · opens in/);
    await shot(fix, "7a-fixture-with-new-seal");
    await arm.close(); await popup.close();
  });
});
