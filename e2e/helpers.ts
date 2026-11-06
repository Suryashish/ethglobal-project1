import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, type Page } from "playwright-core";

export const HERE = dirname(fileURLToPath(import.meta.url));
export const APP = "http://localhost:3000";
export const SHOTS = resolve(HERE, "screenshots");
export const STATE_FILE = resolve(HERE, "state.json");
mkdirSync(SHOTS, { recursive: true });

export function findChrome(): string {
  const root = join(homedir(), "Library/Caches/ms-playwright");
  const dirs = existsSync(root) ? readdirSync(root).filter((d) => d.startsWith("chromium-")).sort().reverse() : [];
  for (const d of dirs) {
    const p = join(root, d, "chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing");
    if (existsSync(p)) return p;
  }
  return chromium.executablePath();
}

export function loadState(): Record<string, any> {
  try { return JSON.parse(readFileSync(STATE_FILE, "utf8")); } catch { return {}; }
}
export function saveState(patch: Record<string, any>) {
  writeFileSync(STATE_FILE, JSON.stringify({ ...loadState(), ...patch }, null, 2));
}

export const errors: string[] = [];
export function watch(page: Page, label: string) {
  page.on("console", (m) => { if (m.type() === "error") errors.push(`[${label}] console.error: ${m.text()}`); });
  page.on("pageerror", (e) => errors.push(`[${label}] pageerror: ${e.message}`));
}
export const shot = (page: Page, name: string) => page.screenshot({ path: join(SHOTS, `${name}.png`), fullPage: true });

/** Drives the mock "World ID simulator (dev)" modal. */
export async function mockVerify(page: Page, opts: { identity: "author" | "thief"; nationality?: string; expectClose?: boolean }) {
  const dlg = page.locator(".iigs-w-card");
  await dlg.waitFor({ timeout: 10_000 });
  await dlg.locator("label.iigs-w-opt", { hasText: opts.identity === "author" ? "Author (you)" : "Someone else" }).click();
  if (opts.nationality) await dlg.locator("select.iigs-w-sel").selectOption(opts.nationality);
  await dlg.locator("button.iigs-w-btn[data-primary='1']").click();
  if (opts.expectClose !== false) await dlg.waitFor({ state: "detached", timeout: 30_000 });
}

/** Fills /vault/new and arms. Returns sealId. */
export async function createSeal(page: Page, o: {
  text: string; kind: "TIMER" | "HEARTBEAT"; preset: string; audience?: "PUBLIC" | "GATED"; countries?: string[]; title?: string;
}): Promise<string> {
  await page.goto(`${APP}/vault/new`);
  await page.getByRole("tab", { name: "Write text" }).click();
  await page.locator("textarea").fill(o.text);
  if (o.title) await page.locator("label:has-text('Public title') input").fill(o.title);
  await page.locator("label", { hasText: o.kind === "TIMER" ? "Opens at a set time" : "Opens if you stop checking" }).click();
  await page.getByRole("button", { name: o.preset, exact: true }).first().click();
  if (o.audience === "GATED") {
    await page.locator("label", { hasText: "Verified readers from chosen countries" }).click();
    for (const c of o.countries ?? ["IN"]) await page.locator(`button[title][aria-pressed]`, { hasText: c }).first().click();
  }
  await page.getByRole("button", { name: "Encrypt and continue" }).click();
  await page.getByRole("button", { name: "Arm with World ID" }).click();
  await mockVerify(page, { identity: "author" });
  await page.waitForURL(/\/s\/[a-z0-9]{16}/, { timeout: 60_000 });
  return new URL(page.url()).pathname.split("/").pop()!;
}
