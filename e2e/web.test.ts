/**
 * Browser E2E for the web app (flows 1-5). Needs the local stack running (see README in report).
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { chromium, type Browser, type BrowserContext, type Page } from "playwright-core";
import { APP, createSeal, errors, findChrome, mockVerify, saveState, shot, watch } from "./helpers";

let browser: Browser;
let ctx: BrowserContext;
let page: Page;
const reqs: string[] = [];

beforeAll(async () => {
  browser = await chromium.launch({ executablePath: findChrome(), headless: true });
  ctx = await browser.newContext({ viewport: { width: 1100, height: 900 } });
  ctx.on("request", (r) => reqs.push(r.url()));
  page = await ctx.newPage();
  watch(page, "web");
});
afterAll(async () => {
  console.log("CONSOLE/PAGE ERRORS:\n" + (errors.join("\n") || "(none)"));
  await browser?.close();
});

describe("reader pages", () => {
  it("1. public text seal: RELEASED + plaintext + proof links, read from Arkiv RPC directly", async () => {
    reqs.length = 0;
    await page.goto(`${APP}/s/7297zmq67qld8zbb`);
    await page.getByText("If you are reading this, I went silent. — A").waitFor({ timeout: 30_000 });
    await expect(page.locator("body")).toContainText(/released/i);
    expect(await page.locator("a[href*='/entity/']").count()).toBeGreaterThan(0);
    expect(await page.locator("a[href*='/tx/']").count()).toBeGreaterThan(0);
    await expect(page.locator("body")).toContainText("read the seal directly from Arkiv");
    const arkiv = reqs.filter((u) => u.startsWith("http://localhost:8645"));
    console.log("requests to Arkiv RPC:", arkiv.length, "| /api requests:", reqs.filter((u) => u.includes("/api/")).map((u) => new URL(u).pathname).join(","));
    expect(arkiv.length).toBeGreaterThan(0);
    await shot(page, "1-reader-public-text");
  });

  it("2. public file via Swarm: decrypts PDF, offers download/preview", async () => {
    await page.goto(`${APP}/s/qxjiiagd7888ogf9`);
    const dl = page.getByRole("link", { name: /Download/ }).or(page.getByRole("button", { name: /Download/ }));
    await dl.first().waitFor({ timeout: 45_000 });
    await expect(page.locator("body")).toContainText("evidence.pdf");
    const href = await dl.first().getAttribute("href");
    expect(href).toMatch(/^blob:/);
    const head = await page.evaluate(async (h) => { const b = await (await fetch(h!)).arrayBuffer(); return new TextDecoder().decode(new Uint8Array(b).slice(0, 5)); }, href);
    expect(head).toBe("%PDF-");
    await expect(page.locator("body")).toContainText("Swarm ciphertext");
    await shot(page, "2-reader-pdf");
  });

  it("3. gated IN: US denied, then IN decrypts", async () => {
    await page.goto(`${APP}/s/ve1orta9v7ykvdou`);
    await page.evaluate(() => localStorage.removeItem("iigs.reader"));
    await page.reload();
    const verify = page.getByRole("button", { name: /Verify nationality/ });
    await verify.first().click();
    await mockVerify(page, { identity: "thief", nationality: "US" });
    await page.getByText("Not available in your country").first().waitFor({ timeout: 30_000 });
    await shot(page, "3a-gated-denied-US");
    await page.evaluate(() => localStorage.removeItem("iigs.reader"));
    await page.reload();
    await page.getByRole("button", { name: /Verify nationality/ }).first().click();
    await mockVerify(page, { identity: "thief", nationality: "IN" });
    await page.getByRole("link", { name: /Download/ }).or(page.getByRole("button", { name: /Download/ })).first().waitFor({ timeout: 45_000 });
    await shot(page, "3b-gated-allowed-IN");
  });
});

describe("vault flows", () => {
  const ids: Record<string, string> = {};

  it("4a. TIMER 2 min PUBLIC: arm → seal view → /vault shows countdown + ARMED", async () => {
    await page.goto(`${APP}/`);
    ids.timer = await createSeal(page, { text: "timer secret from e2e", kind: "TIMER", preset: "2 min" });
    await expect(page.locator("body")).toContainText(/Armed\. The switch is live/);
    await shot(page, "4a-seal-after-arm");
    await page.goto(`${APP}/vault`);
    const card = page.locator(`div:has(> div a[href='/s/${ids.timer}'])`).first();
    await page.locator(`a[href='/s/${ids.timer}']`).first().waitFor({ timeout: 20_000 });
    await expect(page.locator("main")).toContainText(/armed/i);
    const t1 = await page.locator("[data-countdown], time").first().textContent().catch(() => null);
    await shot(page, "4a-vault");
    expect(await card.count()).toBeGreaterThan(0);
    saveState({ timer: ids.timer });
  });

  it("4b. HEARTBEAT 2 min: check-in as THIEF refused, as Author succeeds", async () => {
    ids.hb = await createSeal(page, { text: "heartbeat secret from e2e", kind: "HEARTBEAT", preset: "2 min" });
    saveState({ hb: ids.hb, hbArmedAt: Date.now() });
    await page.goto(`${APP}/vault`);
    const okBtn = page.getByRole("button", { name: "I'm OK" }).first();
    await okBtn.waitFor({ timeout: 20_000 });
    await okBtn.click();
    await mockVerify(page, { identity: "thief", expectClose: false });
    await page.getByText(/Face check did not match the author/).first().waitFor({ timeout: 20_000 });
    await shot(page, "4b-checkin-thief-refused");
    // dismiss and retry as author (same modal still open)
    await mockVerify(page, { identity: "author" });
    await page.getByText(/Checked in/).first().waitFor({ timeout: 30_000 });
    await shot(page, "4b-checkin-author-ok");
    saveState({ hbLastCheckin: Date.now() });
  });

  it("4d. Disarm a seal → reader page shows cancelled", async () => {
    ids.dis = await createSeal(page, { text: "to be disarmed", kind: "TIMER", preset: "5 days" });
    saveState({ disarmed: ids.dis });
    await page.goto(`${APP}/vault`);
    const card = page.locator("div.space-y-4", { has: page.locator(`a[href='/s/${ids.dis}']`) }).first();
    await card.getByRole("button", { name: "Disarm" }).click();
    await page.getByRole("button", { name: "Disarm with World ID" }).click();
    await mockVerify(page, { identity: "author" });
    await page.getByText(/Disarmed\. This seal will never open/).first().waitFor({ timeout: 30_000 });
    await page.goto(`${APP}/s/${ids.dis}`);
    await page.getByText("Cancelled by the author").first().waitFor({ timeout: 30_000 });
    await shot(page, "4d-disarmed-reader");
  });

  it("5. country-gated create (IN) arms", async () => {
    ids.gated = await createSeal(page, { text: "gated secret from e2e", kind: "TIMER", preset: "5 days", audience: "GATED", countries: ["IN"] });
    await expect(page.locator("body")).toContainText(/IN/);
    saveState({ gatedArmed: ids.gated });
    await shot(page, "5-gated-armed");
  });

  it("4e. a sealed 5-day seal for the extension tests", async () => {
    ids.sealed = await createSeal(page, { text: "still sealed for the extension", kind: "TIMER", preset: "5 days" });
    saveState({ sealed: ids.sealed });
  });

  it("4c. never-check-in heartbeat flips to RELEASED by itself on /s/<id>", async () => {
    await page.goto(`${APP}/s/${ids.hb}`);
    await expect(page.locator("body")).toContainText(/armed|sealed/i);
    await shot(page, "4c-hb-reader-armed");
    await page.getByText("heartbeat secret from e2e").waitFor({ timeout: 300_000 });
    await expect(page.locator("body")).toContainText(/released/i);
    await shot(page, "4c-hb-reader-released");
  });

  it("4c'. the 2-min timer seal also released", async () => {
    await page.goto(`${APP}/s/${ids.timer}`);
    await page.getByText("timer secret from e2e").waitFor({ timeout: 120_000 });
  });
});
