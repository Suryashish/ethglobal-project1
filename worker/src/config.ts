/**
 * Worker configuration. Loads ../.secrets/keys.env then worker/.env (later overrides earlier);
 * real process env vars win over both. Secret values are never logged.
 */
import { parse } from "dotenv";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { Address, Hex } from "viem";

const HERE = dirname(fileURLToPath(import.meta.url));
export const WORKER_DIR = resolve(HERE, "..");
export const REPO_ROOT = resolve(WORKER_DIR, "..");

export type Env = Record<string, string | undefined>;

export class ConfigError extends Error {
  constructor(public problems: string[]) {
    super(`Invalid configuration:\n  - ${problems.join("\n  - ")}\n(set these in .secrets/keys.env, worker/.env or the environment)`);
    this.name = "ConfigError";
  }
}

export function loadRawEnv(
  files = [resolve(REPO_ROOT, ".secrets/keys.env"), resolve(WORKER_DIR, ".env")],
  processEnv: Env = process.env,
): Env {
  let merged: Env = {};
  for (const f of files) if (existsSync(f)) merged = { ...merged, ...parse(readFileSync(f)) };
  const out: Env = { ...merged };
  for (const [k, v] of Object.entries(processEnv)) if (v !== undefined && v !== "") out[k] = v;
  return out;
}

class Reader {
  problems: string[] = [];
  constructor(private env: Env) {}
  str(name: string, def?: string): string {
    const v = this.env[name]?.trim();
    if (v) return v;
    if (def !== undefined) return def;
    this.problems.push(`${name} is missing`);
    return "";
  }
  addr(name: string): Address {
    const v = this.str(name);
    if (v && !/^0x[0-9a-fA-F]{40}$/.test(v)) this.problems.push(`${name} is not a 0x… 20-byte address`);
    return v as Address;
  }
  key32(name: string): Hex {
    const v = this.str(name);
    if (v && !/^0x[0-9a-fA-F]{64}$/.test(v)) this.problems.push(`${name} is not a 0x… 32-byte hex value`);
    return v as Hex;
  }
  int(name: string, def?: number, min = 0): number {
    const raw = this.env[name]?.trim();
    if (!raw) {
      if (def !== undefined) return def;
      this.problems.push(`${name} is missing`);
      return 0;
    }
    const n = Number(raw);
    if (!Number.isInteger(n) || n < min) this.problems.push(`${name} must be an integer >= ${min}`);
    return n;
  }
  done() {
    if (this.problems.length) throw new ConfigError(this.problems);
  }
}

export type ArkivSettings = {
  accessKey: string;
  dep: string;
  verifier: Address;
  mirror: Address;
  rpcUrl?: string;
};

export type ChainSettings = { rpcUrl: string; chainId: number; releaseAddress: Address };

function arkiv(r: Reader, env: Env): ArkivSettings {
  return {
    accessKey: r.str("ARKIV_ACCESS_KEY", ""),
    dep: r.str("IIGS_DEP", "dev"),
    verifier: r.addr("VERIFIER_ADDRESS"),
    mirror: r.addr("MIRROR_ADDRESS"),
    ...(env.ARKIV_RPC_URL ? { rpcUrl: env.ARKIV_RPC_URL } : {}),
  };
}

function chain(r: Reader, env: Env): ChainSettings {
  return {
    rpcUrl: r.str("CHAIN_RPC_URL", env.SEPOLIA_RPC_URL || "https://ethereum-sepolia-rpc.publicnode.com"),
    chainId: r.int("CHAIN_ID", 11155111, 1),
    releaseAddress: r.addr("SILENT_RELEASE_ADDRESS"),
  };
}

export type MirrorConfig = {
  arkiv: ArkivSettings;
  chain: ChainSettings;
  mirrorPrivateKey: Hex;
  startBlock: number;
  pollMs: number;
};

export function loadMirrorConfig(env: Env = loadRawEnv()): MirrorConfig {
  const r = new Reader(env);
  const cfg: MirrorConfig = {
    arkiv: arkiv(r, env),
    chain: chain(r, env),
    mirrorPrivateKey: r.key32("MIRROR_PRIVATE_KEY"),
    startBlock: r.int("START_BLOCK", Number(env.CHAIN_ID) === 31337 ? 0 : undefined),
    pollMs: r.int("MIRROR_POLL_MS", 6000, 500),
  };
  r.done();
  return cfg;
}

export type SweeperConfig = {
  arkiv: ArkivSettings;
  chain: ChainSettings;
  escrowSecretKey: Hex;
  sweeperPrivateKey: Hex;
  intervalSec: number;
};

export function loadSweeperConfig(env: Env = loadRawEnv()): SweeperConfig {
  const r = new Reader(env);
  const cfg: SweeperConfig = {
    arkiv: arkiv(r, env),
    chain: chain(r, env),
    escrowSecretKey: r.key32("ESCROW_SECRET_KEY"),
    sweeperPrivateKey: r.key32("SWEEPER_PRIVATE_KEY"),
    intervalSec: r.int("SWEEP_INTERVAL_SEC", 30, 5),
  };
  r.done();
  return cfg;
}

export type CreConfig = {
  bin: string;
  projectDir: string;
  workflowPath: string;
  target: string;
  triggerIndex: number;
  intervalSec: number;
  timeoutSec: number;
  envFile?: string;
  extraArgs: string[];
};

export function loadCreConfig(env: Env = loadRawEnv(), home = process.env.HOME ?? ""): CreConfig {
  const r = new Reader(env);
  const cfg: CreConfig = {
    bin: r.str("CRE_BIN", `${home}/.cre/bin/cre`),
    projectDir: resolve(r.str("CRE_PROJECT_DIR", resolve(REPO_ROOT, "workflows", "release-sweeper"))),
    workflowPath: r.str("CRE_WORKFLOW_PATH", "./workflow"),
    target: r.str("CRE_TARGET", "staging-settings"),
    triggerIndex: r.int("CRE_TRIGGER_INDEX", 0),
    intervalSec: r.int("CRE_INTERVAL_SEC", 30, 5),
    timeoutSec: r.int("CRE_TIMEOUT_SEC", 180, 10),
    ...(env.CRE_ENV_FILE ? { envFile: env.CRE_ENV_FILE } : {}),
    extraArgs: env.CRE_EXTRA_ARGS ? env.CRE_EXTRA_ARGS.split(/\s+/).filter(Boolean) : [],
  };
  r.done();
  return cfg;
}
