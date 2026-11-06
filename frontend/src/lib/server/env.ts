/** Server env access. Missing required variables fail with a clear message (HTTP 500 env_missing). */
import { ApiError } from "./errors";

export function required(name: string, hint = ""): string {
  const v = process.env[name];
  if (!v || !v.trim()) {
    throw new ApiError(
      500,
      "env_missing",
      `Server is missing the ${name} environment variable${hint ? ` (${hint})` : ""}. Run \`node frontend/scripts/sync-env.mjs\` or set it in frontend/.env.local.`,
    );
  }
  return v.trim();
}

export function optional(name: string, fallback = ""): string {
  const v = process.env[name];
  return v && v.trim() ? v.trim() : fallback;
}

export function hexKey(name: string, bytes = 32): Uint8Array {
  const v = required(name).replace(/^0x/, "");
  if (!new RegExp(`^[0-9a-fA-F]{${bytes * 2}}$`).test(v)) {
    throw new ApiError(500, "env_invalid", `${name} must be ${bytes * 2} hex characters`);
  }
  const out = new Uint8Array(bytes);
  for (let i = 0; i < bytes; i++) out[i] = parseInt(v.slice(i * 2, i * 2 + 2), 16);
  return out;
}
