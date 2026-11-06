// Live World ID diagnostic: opens the real arm flow, saves the QR as screenshots/world-scan-me.png,
// then for up to 5 minutes records what comes back from World's bridge and what the widget shows,
// so a failed phone scan can be identified precisely (error code, status transitions).
//   cd e2e && ../packages/core/node_modules/.bin/tsx world-diagnose.mts
import { chromium } from "playwright-core";
import { resolve } from "node:path";
import { APP, findChrome, HERE } from "./helpers.ts";

const OUT = resolve(HERE, "..", "screenshots");
const t0 = Date.now();
const ts = () => `+${String(Math.round((Date.now() - t0) / 1000)).padStart(3)}s`;
const browser = await chromium.launch({ executablePath: findChrome(), headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

let lastStatus = "";
page.on("response", async (r) => {
  const u = r.url();
  if (u.includes("bridge.worldcoin.org/response/")) {
    try {
      const j = await r.json();
      const s = `${r.status()} status=${j.status ?? "?"}${j.response ? " (encrypted response present)" : ""}`;
      if (s !== lastStatus) console.log(`${ts()} bridge: ${s}`);
      lastStatus = s;
    } catch {
      /* ignore */
    }
  } else if (u.includes("bridge.worldcoin.org/request")) console.log(`${ts()} bridge request created: HTTP ${r.status()}`);
  else if (u.includes("/api/seals") && r.request().method() === "POST") console.log(`${ts()} POST /api/seals → ${r.status()} ${(await r.text()).slice(0, 300)}`);
  else if (u.includes("developer.world.org")) console.log(`${ts()} ${r.request().method()} ${u} → ${r.status()}`);
});
page.on("console", (m) => console.log(`${ts()} console.${m.type()}: ${m.text().slice(0, 300)}`));
page.on("pageerror", (e) => console.log(`${ts()} PAGE ERROR: ${String(e).slice(0, 300)}`));

await page.goto(`${APP}/vault/new`, { waitUntil: "domcontentloaded", timeout: 120_000 });
await page.getByRole("tab", { name: "Write text" }).waitFor({ timeout: 120_000 });
await page.waitForTimeout(2000);
await page.getByRole("tab", { name: "Write text" }).click();
await page.locator("textarea").fill("World ID live diagnostic");
await page.locator("label", { hasText: "Opens at a set time" }).click();
await page.getByRole("button", { name: "5 days", exact: true }).first().click();
await page.getByRole("button", { name: "Encrypt and continue" }).click();
await page.getByRole("button", { name: "Arm with World ID" }).click({ timeout: 120_000 });
await page.waitForTimeout(4000);
await page.screenshot({ path: resolve(OUT, "world-scan-me.png") });
console.log(`${ts()} QR READY → open screenshots/world-scan-me.png and scan it with the World ID app (watching for 10 min)`);

// Capture any text the widget / our button shows (errors are rendered there).
let lastText = "";
const deadline = Date.now() + 10 * 60_000;
while (Date.now() < deadline) {
  const text: string = await page.evaluate(() => {
    const parts: string[] = [];
    for (const el of document.querySelectorAll("*")) if (el.shadowRoot) parts.push(el.shadowRoot.textContent ?? "");
    const alert = [...document.querySelectorAll("[role=alert], [role=status]")].map((e) => e.textContent).join(" | ");
    return (parts.join(" ").replace(/\/\*[\s\S]*?\*\/|@font-face[^}]*}|[.#:\w-]+\s*{[^}]*}/g, " ") + " || " + alert).replace(/\s+/g, " ").trim();
  });
  const short = text.slice(-400);
  if (short !== lastText) {
    console.log(`${ts()} widget text: ${short}`);
    lastText = short;
    await page.screenshot({ path: resolve(OUT, "world-scan-state.png") });
  }
  if (/armed|switch is live/i.test(await page.locator("body").innerText())) {
    console.log(`${ts()} SUCCESS: seal armed with a real World ID proof`);
    break;
  }
  await page.waitForTimeout(2000);
}
await browser.close();
