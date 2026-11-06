/** Produces /screenshots/*.png against the REAL testnet stack (web on :3000). Run: see screenshots/README.md */
import { createServer, type Server } from "node:http";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { chromium, type Browser, type BrowserContext, type Page, type Worker } from "playwright-core";
import { formatSealedPost } from "@iigs/core";
import { APP, HERE, errors, findChrome, mockVerify, watch } from "./helpers";

declare const chrome: any;
const OUT = resolve(HERE, "../screenshots");
const REPO = resolve(HERE, "..");
const T = 600_000;
const RELEASED_TEXT = "rbge7pb6tom44j7m", RELEASED_FILE = "xqkapotgw31ltpqg", GATED = "syacuyj4qq8v044j";
const FIX = "http://localhost:4010";
const EXT = resolve(HERE, "../extension/.output-e2e/chrome-mv3");

let browser: Browser, ctx: BrowserContext, page: Page;
const ids: Record<string, string> = {};
const shot = (p: Page, n: string, full = true) => p.screenshot({ path: join(OUT, `${n}.png`), fullPage: full });

async function go(p: Page, url: string) {
  try { await p.goto(url, { waitUntil: "domcontentloaded" }); } catch { await p.goto(url, { waitUntil: "domcontentloaded" }); }
}
const see = (p: Page, t: string | RegExp, timeout = 90_000) => p.locator("body", { hasText: t }).waitFor({ timeout });
const idle = (p: Page, bad = /Reading the seal|Fetching the ciphertext|Decrypting in your browser|Asking the key service/) =>
  p.waitForFunction((s) => !new RegExp(s).test(document.body.innerText), bad.source, { timeout: 90_000 });

beforeAll(async () => {
  browser = await chromium.launch({ executablePath: findChrome(), headless: true });
  ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  page = await ctx.newPage();
  page.setDefaultTimeout(90_000); page.setDefaultNavigationTimeout(120_000);
  watch(page, "web");
});
afterAll(async () => { console.log("ERRORS:\n" + (errors.join("\n") || "(none)")); await browser?.close(); });

async function fillAndArm(p: Page, o: { text: string; kind: "TIMER" | "HEARTBEAT"; preset: string; shots?: boolean }): Promise<string> {
  await go(p, `${APP}/app/new`);
  await p.getByRole("tab", { name: "Write text" }).waitFor();
  await p.waitForTimeout(1500);
  if (o.shots) await shot(p, "02-vault-new-empty");
  await p.getByRole("tab", { name: "Write text" }).click();
  await p.locator("textarea").fill(o.text);
  await p.locator("label", { hasText: o.kind === "TIMER" ? "Opens at a set time" : "Opens if you stop checking" }).click();
  await p.getByRole("button", { name: o.preset, exact: true }).first().click();
  if (o.shots) await shot(p, "03-vault-new-filled");
  await p.getByRole("button", { name: "Encrypt and continue" }).click();
  await p.getByRole("button", { name: "Arm with World ID" }).click();
  if (o.shots) { await p.locator(".iigs-w-card").waitFor(); await shot(p, "04-world-id-selfie-modal", false); }
  await mockVerify(p, { identity: "author" });
  await p.waitForURL(/\/s\/[a-z0-9]{16}/, { timeout: 180_000 });
  return new URL(p.url()).pathname.split("/").pop()!;
}

describe("web", () => {
  it("01 landing", async () => {
    await go(page, `${APP}/`); await page.waitForTimeout(2500); await shot(page, "01-landing");
  }, T);

  it("02-05 create timer seal", async () => {
    ids.T = await fillAndArm(page, { text: "If you are reading this, I have gone silent. Everything I could not say is attached. — A", kind: "TIMER", preset: "2 min", shots: true });
    await see(page, /Armed\. The switch is live/); await page.waitForTimeout(1500);
    await shot(page, "05-armed-share-link-and-post");
  }, T);

  it("create heartbeat, sealed and to-disarm seals", async () => {
    ids.HB = await fillAndArm(page, { text: "heartbeat demo seal: opens if I stop checking in", kind: "HEARTBEAT", preset: "5 min" });
    ids.S = await fillAndArm(page, { text: "A seal that is still sealed", kind: "TIMER", preset: "5 days" });
    ids.D = await fillAndArm(page, { text: "A seal I will cancel", kind: "TIMER", preset: "5 days" });
  }, T);

  it("06 vault + 07/08 check-in", async () => {
    await go(page, `${APP}/app`);
    await page.evaluate((add) => { const k = "iigs.seals"; const l = JSON.parse(localStorage.getItem(k) || "[]"); localStorage.setItem(k, JSON.stringify([...new Set([...l, ...add])])); }, [RELEASED_TEXT, "g2mzs8qiix5gp8cb"]);
    await page.reload();
    await page.getByRole("button", { name: "I'm OK" }).first().waitFor();
    await page.waitForTimeout(3000);
    await shot(page, "06-vault-dashboard");
    await page.getByRole("button", { name: "I'm OK" }).first().click();
    await mockVerify(page, { identity: "thief", expectClose: false });
    await see(page, /Face check did not match the author/, 120_000);
    await page.waitForTimeout(500);
    await shot(page, "07-checkin-thief-refused");
    await mockVerify(page, { identity: "author" });
    await see(page, /Checked in/, 120_000);
    await page.waitForTimeout(500);
    await shot(page, "08-checkin-author-ok");
  }, T);

  it("09 reader of a sealed seal", async () => {
    await go(page, `${APP}/s/${ids.S}`);
    await see(page, /Armed by a verified human/); await page.locator("a[href*='/entity/']").first().waitFor();
    await page.waitForTimeout(1500); await shot(page, "09-reader-sealed");
  }, T);

  it("10 released text, 11 released file", async () => {
    await go(page, `${APP}/s/${RELEASED_TEXT}`);
    await page.locator("a[href*='/tx/']").first().waitFor(); await idle(page); await page.waitForTimeout(1500);
    await shot(page, "10-reader-released-text");
    await go(page, `${APP}/s/${RELEASED_FILE}`);
    await page.getByRole("link", { name: /Download/ }).or(page.getByRole("button", { name: /Download/ })).first().waitFor();
    await page.waitForTimeout(2500); await shot(page, "11-reader-released-file-swarm");
  }, T);

  it("12/13 gated US denied then IN decrypted", async () => {
    await go(page, `${APP}/s/${GATED}`);
    await page.evaluate(() => localStorage.removeItem("iigs.reader")); await page.reload();
    await page.getByRole("button", { name: /Verify nationality/ }).first().waitFor();
    await page.waitForTimeout(1000);
    await page.getByRole("button", { name: /Verify nationality/ }).first().click();
    await mockVerify(page, { identity: "thief", nationality: "US" });
    await see(page, "Not available in your country", 120_000); await page.waitForTimeout(800);
    await shot(page, "12-gated-US-denied");
    await page.evaluate(() => localStorage.removeItem("iigs.reader")); await page.reload();
    await page.getByRole("button", { name: /Verify nationality/ }).first().click();
    await mockVerify(page, { identity: "thief", nationality: "IN" });
    await page.getByRole("link", { name: /Download/ }).or(page.getByRole("button", { name: /Download/ })).first().waitFor({ timeout: 120_000 });
    await page.waitForTimeout(2500); await shot(page, "13-gated-IN-decrypted");
  }, T);

  it("14 disarm → cancelled", async () => {
    await go(page, `${APP}/app`);
    const card = page.locator("div.space-y-4", { has: page.locator(`a[href='/s/${ids.D}']`) }).first();
    await card.getByRole("button", { name: "Disarm" }).click();
    await page.getByRole("button", { name: "Disarm with World ID" }).click();
    await mockVerify(page, { identity: "author" });
    await see(page, /Disarmed\. This seal will never open/, 120_000);
    await go(page, `${APP}/s/${ids.D}`);
    await see(page, "Cancelled by the author", 120_000); await page.waitForTimeout(800);
    await shot(page, "14-reader-disarmed");
  }, T);
});

describe("evidence pages", () => {
  const redact = (s: string) => s.replace(/(\.testnet\.arkiv\.network\/)[^\s"')\]<>]+/g, "$1<access-key>").replace(/(access[-_ ]?key["'=: ]+)[^\s"']+/gi, "$1<redacted>");
  const render = async (title: string, lines: string[], name: string) => {
    const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const f = join(mkdtempSync(join(tmpdir(), "iigs-ev-")), "e.html");
    writeFileSync(f, `<!doctype html><meta charset=utf-8><body style="margin:0;background:#0b0d10;color:#c9d1d9;font:13px/1.55 ui-monospace,Menlo,monospace;padding:28px"><h2 style="font:600 18px system-ui;color:#f5c26b;margin:0 0 4px">${esc(title)}</h2><div style="color:#7d8590;margin-bottom:16px;font-family:system-ui">${lines.length} lines (secrets redacted)</div><pre style="white-space:pre-wrap;word-break:break-all;margin:0">${lines.map((l) => esc(l).replace(/(released \d+ seal\(s\)|Released|ReleasedGated)/g, '<b style="color:#7fe0b4">$1</b>').replace(/(0x[0-9a-f]{64})/g, '<span style="color:#79c0ff">$1</span>')).join("\n")}</pre>`);
    const p = await ctx.newPage(); await p.goto("file://" + f); await shot(p, name); await p.close();
  };
  it("18 CRE log, 19 mirror log", async () => {
    const cre = readFileSync(join(REPO, ".local-stack/cre-testnet.log"), "utf8").split("\n").filter((l) => l.includes("[USER LOG]"));
    const decisions = cre.filter((l) => /released \d+ seal/.test(l));
    const pick = [...new Set([...cre.slice(-30), ...decisions.slice(-10)])].slice(-40);
    await render("Chainlink CRE workflow (release-sweeper) — simulate --broadcast on Sepolia", pick.map(redact), "18-release-engine-cre-log");
    const mir = readFileSync(join(REPO, ".local-stack/mirror-testnet.log"), "utf8").split("\n").filter((l) => /Released|ReleasedGated/.test(l) && l.includes("Arkiv iigs.release"));
    await render("Mirror — SilentRelease events → Arkiv iigs.release", mir.slice(-40).map(redact), "19-mirror-log");
    expect(pick.length).toBeGreaterThan(0);
  }, T);
});

describe("explorers (best effort)", () => {
  it("20 etherscan + arkiv explorer", async () => {
    const p = await ctx.newPage(); p.setDefaultTimeout(60_000);
    const key = (await (await fetch(`${APP}/api/seals/${RELEASED_TEXT}`)).json()).seal.entityKey;
    for (const [url, name] of [[`https://sepolia.etherscan.io/address/0x10dcBC473111666cBd14A4557A9B5AD5b4d7397B`, "20a-sepolia-etherscan-contract"], [`https://rabdi.explorer.arkiv.network/entity/${key}`, "20b-arkiv-explorer-entity"]] as const) {
      try {
        await p.goto(url, { waitUntil: "domcontentloaded", timeout: 60_000 });
        await p.waitForTimeout(8000);
        const t = await p.title();
        if (/just a moment|attention required/i.test(t)) { console.log("BLOCKED", name, t); continue; }
        await shot(p, name); console.log("captured", name, t);
      } catch (e) { console.log("SKIPPED", name, String(e).slice(0, 100)); }
    }
    await p.close();
  }, T);
});

describe("extension", () => {
  let ectx: BrowserContext, sw: Worker, extId: string, server: Server, fix: Page;
  const card = (id: string) => fix.evaluate((id) => { for (const h of document.querySelectorAll("[data-iigs-card]")) for (const c of h.shadowRoot?.querySelectorAll(".card") ?? []) if (c.getAttribute("data-seal") === id) return c.textContent ?? ""; return ""; }, id);
  const waitCard = (id: string, re: RegExp, timeout = 120_000) => expect.poll(() => card(id), { timeout, interval: 700 }).toMatch(re);

  it("15-17", async () => {
    const tl: string[] = [];
    for (const id of [RELEASED_TEXT, ids.S, ids.D, GATED]) {
      const s = (await (await fetch(`${APP}/api/seals/${id}`)).json()).seal;
      tl.push(`<article style="border-bottom:1px solid #2f3336;padding:14px 18px" data-testid="tweet"><div style="color:#71767b;font-size:14px">@someone · now</div><div data-testid="tweetText"><span>${formatSealedPost({ sealId: id, baseUrl: APP, releaseAt: s.releaseAt, countries: s.countries })}</span></div></article>`);
    }
    const html = `<!doctype html><html><body style="margin:0;background:#000;color:#e7e9ea;font-family:system-ui;max-width:620px;margin-inline:auto;border-inline:1px solid #2f3336;min-height:100vh"><h3 style="padding:14px 18px;margin:0;border-bottom:1px solid #2f3336">Home (X-like fixture)</h3><div id="timeline">${tl.join("")}</div><div id="composer" data-testid="tweetTextarea_0" contenteditable="true" role="textbox" style="margin:18px;border:1px solid #536471;border-radius:8px;min-height:60px;padding:10px"></div></body></html>`;
    server = createServer((_q, res) => res.writeHead(200, { "content-type": "text/html; charset=utf-8" }).end(html));
    await new Promise<void>((r) => server.listen(4010, r));
    ectx = await chromium.launchPersistentContext(mkdtempSync(join(tmpdir(), "iigs-shots-")), {
      executablePath: findChrome(), headless: false, viewport: { width: 1440, height: 900 },
      args: ["--headless=new", `--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`, "--no-first-run"],
    });
    try {
      sw = ectx.serviceWorkers()[0] ?? (await ectx.waitForEvent("serviceworker"));
      extId = new URL(sw.url()).host;
      fix = await ectx.newPage(); fix.setDefaultTimeout(90_000); watch(fix, "fixture");
      await fix.goto(FIX);
      await waitCard(RELEASED_TEXT, /Opened by the seal/);
      await waitCard(ids.S, /Sealed · opens in/);
      await waitCard(ids.D, /Cancelled by author/);
      await waitCard(GATED, /Visible to verified readers from .*IN/);
      await fix.waitForTimeout(1000);
      await shot(fix, "15-extension-feed-cards");

      const popup = await ectx.newPage();
      await popup.setViewportSize({ width: 420, height: 760 });
      await popup.goto(`chrome-extension://${extId}/popup.html`);
      await popup.fill("textarea", "If I go silent, open this for everyone.");
      await popup.selectOption("select >> nth=0", "120");
      await popup.waitForTimeout(800);
      await shot(popup, "16-extension-popup-composer");
      await popup.close();

      const vp = ectx.waitForEvent("page", { predicate: (p) => p.url().startsWith(`${APP}/verify-reader`), timeout: 30_000 });
      await fix.bringToFront();
      await fix.evaluate(() => { const h = [...document.querySelectorAll("[data-iigs-card]")].find((x) => x.shadowRoot?.textContent?.includes("Verify nationality"))!; (h.shadowRoot!.querySelector("button") as HTMLButtonElement).click(); });
      const v = await vp; v.setDefaultTimeout(90_000);
      await v.getByRole("button", { name: /Verify nationality with World ID|Verify again/ }).click();
      await mockVerify(v, { identity: "thief", nationality: "IN" });
      await fix.bringToFront();
      await waitCard(GATED, /Opened — (file|“)|Opened/, 120_000);
      await expect.poll(() => card(GATED), { timeout: 120_000, interval: 700 }).not.toMatch(/decrypting…|Verify nationality/);
      await fix.waitForTimeout(800);
      await shot(fix, "17-extension-gated-decrypted");
      console.log("gated card:", await card(GATED));
    } finally { await ectx.close(); server.close(); }
  }, T);
});
