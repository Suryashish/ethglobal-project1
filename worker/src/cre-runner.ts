/** Runs the Chainlink CRE `release-sweeper` simulation (with --broadcast) on a loop; never overlaps. */
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { loadCreConfig, type CreConfig } from "./config.js";
import { errMsg, makeLogger, sleep } from "./log.js";

export function buildArgs(c: CreConfig): string[] {
  return [
    "workflow",
    "simulate",
    c.workflowPath,
    "--broadcast",
    "--non-interactive",
    "--trigger-index",
    String(c.triggerIndex),
    "-T",
    c.target,
    ...(c.envFile ? ["-e", c.envFile] : []),
    ...c.extraArgs,
  ];
}

export type LineKind = "login" | "network" | "highlight" | "plain";
export function classifyLine(line: string): LineKind {
  // A DNS/timeout failure while validating credentials is a network problem, not a missing login.
  if (/no such host|dial tcp|i\/o timeout|context deadline exceeded|connection (reset|refused)|TLS handshake/i.test(line)) return "network";
  if (/not logged in|please (run )?.*cre login|login required|unauthorized.*login|authentication required/i.test(line)) return "login";
  if (/releas|0x[0-9a-fA-F]{64}|tx ?hash|transaction/i.test(line)) return "highlight";
  return "plain";
}

export function runOnce(c: CreConfig, out: (kind: LineKind, line: string) => void): Promise<{ code: number | null; timedOut: boolean }> {
  return new Promise((resolve) => {
    const child = spawn(c.bin, buildArgs(c), { cwd: c.projectDir, env: process.env, stdio: ["ignore", "pipe", "pipe"] });
    let timedOut = false;
    const t = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
      setTimeout(() => child.kill("SIGKILL"), 5000).unref();
    }, c.timeoutSec * 1000);
    const feed = (buf: string) => (chunk: Buffer) => {
      buf += chunk.toString();
      const lines = buf.split(/\r?\n/);
      buf = lines.pop() ?? "";
      for (const l of lines) if (l.trim()) out(classifyLine(l), l);
    };
    child.stdout.on("data", feed(""));
    child.stderr.on("data", feed(""));
    child.on("error", (e) => {
      clearTimeout(t);
      out("plain", `failed to start ${c.bin}: ${errMsg(e)}`);
      resolve({ code: -1, timedOut });
    });
    child.on("close", (code) => {
      clearTimeout(t);
      resolve({ code, timedOut });
    });
  });
}

async function main() {
  const L = makeLogger("cre");
  const cfg = loadCreConfig();
  L.info(`${cfg.bin} ${buildArgs(cfg).join(" ")}  (cwd ${cfg.projectDir}, every ${cfg.intervalSec}s, timeout ${cfg.timeoutSec}s)`);
  let stop = false;
  process.on("SIGINT", () => (stop = true, process.exit(0)));
  while (!stop) {
    const started = Date.now();
    L.info("── simulation run start ──");
    let sawLogin = false;
    let sawNetwork = false;
    const r = await runOnce(cfg, (kind, line) => {
      if (kind === "login") sawLogin = true;
      if (kind === "network") sawNetwork = true;
      L.info(kind === "highlight" ? `>>> ${line}` : `    ${line}`);
    });
    if (sawNetwork) L.warn("network error (DNS/timeout) — not a code problem; the next run retries automatically.");
    else if (sawLogin) L.error("CRE CLI is not logged in. Run: ~/.cre/bin/cre login (interactive) or set CRE_API_KEY, then restart this runner.");
    L.info(`── run finished: ${r.timedOut ? "TIMED OUT (killed)" : `exit ${r.code}`} in ${((Date.now() - started) / 1000).toFixed(1)}s ──`);
    await sleep(Math.max(1000, cfg.intervalSec * 1000 - (Date.now() - started)));
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((e) => {
    console.error(e instanceof Error && e.name === "ConfigError" ? e.message : errMsg(e));
    process.exit(1);
  });
}
