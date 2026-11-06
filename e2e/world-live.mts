// Live World ID check (no simulator): web app must run with WORLD_MODE=live.
// Creates a seal in the real UI, clicks "Arm with World ID" and verifies that the REAL IDKit widget opens:
// rp_context fetched from our server, a request created on World's bridge, and a QR / World App link shown.
//   cd e2e && node --import tsx world-live.mts     (or: ../packages/core/node_modules/.bin/tsx world-live.mts)
import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { APP, findChrome, HERE } from "./helpers.ts";

const OUT = resolve(HERE, "..", "screenshots");
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ executablePath: findChrome(), headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const net: string[] = [];
const errs: string[] = [];
page.on("request", (r) => {
  const u = r.url();
  if (/world|worldcoin|toolsforhumanity|rp-context/i.test(u)) net.push(`${r.method()} ${u.split("?")[0]}`);
});
page.on("pageerror", (e) => errs.push(String(e)));
page.on("console", (m) => m.type() === "error" && errs.push(m.text()));

const cfg = await (await fetch(`${APP}/api/config`)).json();
console.log(`app world mode: ${cfg.worldMode} (${cfg.worldEnvironment}) app=${cfg.worldAppId}`);
if (cfg.worldMode !== "live") throw new Error("web app is not in live World mode");

await page.goto(`${APP}/vault/new`, { waitUntil: "domcontentloaded", timeout: 120_000 });
await page.getByRole("tab", { name: "Write text" }).waitFor({ timeout: 120_000 });
await page.waitForTimeout(2000); // let React hydrate before typing
await page.getByRole("tab", { name: "Write text" }).click();
await page.locator("textarea").fill("Live World ID check — real Selfie Check request.");
await page.locator("label", { hasText: "Opens at a set time" }).click();
await page.getByRole("button", { name: "5 days", exact: true }).first().click();
await page.getByRole("button", { name: "Encrypt and continue" }).click();
await page.getByRole("button", { name: "Arm with World ID" }).click({ timeout: 120_000 });

// The IDKit widget renders in a shadow root; wait for a QR (canvas/svg/img) or a World App deep link.
const found = await page
  .waitForFunction(
    () => {
      const roots: (Document | ShadowRoot)[] = [document];
      for (const el of document.querySelectorAll("*")) if (el.shadowRoot) roots.push(el.shadowRoot);
      for (const r of roots) {
        const text = (r as any).body?.innerText ?? (r as ShadowRoot).textContent ?? "";
        const link = [...r.querySelectorAll("a")].map((a) => a.getAttribute("href") ?? "").find((h) => /world|worldcoin|idkit/i.test(h));
        const qr = r.querySelector("svg[class*=qr], canvas, img[alt*=QR i], [class*=qr] svg, [data-testid*=qr]");
        if (qr || link) return { qr: !!qr, link: link ?? null, text: text.slice(0, 300) };
        if (/scan|world app|qr/i.test(text) && /world/i.test(text)) return { qr: false, link: null, text: text.slice(0, 300) };
      }
      return null;
    },
    null,
    { timeout: 90_000, polling: 1000 },
  )
  .then((h) => h.jsonValue())
  .catch(() => null);

await page.waitForTimeout(2500);
await page.screenshot({ path: resolve(OUT, "21-world-id-live-request.png"), fullPage: false });
console.log("widget:", JSON.stringify(found));
console.log("World / rp-context network calls:\n  " + [...new Set(net)].join("\n  "));
console.log("page errors:", errs.length ? errs.slice(0, 5) : "none");
await browser.close();
const ok = !!found && net.some((u) => u.includes("/api/world/rp-context")) && net.some((u) => !u.includes("localhost"));
console.log(ok ? "PASS live World ID request opened (scan the QR with World App to finish)" : "FAIL");
process.exit(ok ? 0 : 1);
