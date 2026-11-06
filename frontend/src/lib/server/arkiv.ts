import { arkivPublicClient, arkivWalletClient, type ArkivConfig } from "@iigs/core/arkiv";
import { privateKeyToAccount } from "viem/accounts";
import type { Address, Hex } from "viem";
import { ApiError } from "./errors";
import { optional, required } from "./env";

export function verifierPrivateKey(): Hex {
  const pk = required("VERIFIER_PRIVATE_KEY", "the Arkiv wallet that writes seals/check-ins");
  return (pk.startsWith("0x") ? pk : `0x${pk}`) as Hex;
}

export function verifierAddress(): Address {
  const pub = optional("NEXT_PUBLIC_VERIFIER_ADDRESS");
  if (pub) return pub as Address;
  return privateKeyToAccount(verifierPrivateKey()).address;
}

export function mirrorAddress(): Address {
  return required("NEXT_PUBLIC_MIRROR_ADDRESS", "address of the release mirror wallet") as Address;
}

const rpc = () => optional("ARKIV_RPC_URL", optional("NEXT_PUBLIC_ARKIV_RPC_URL"));

export function arkivConfig(): ArkivConfig {
  return {
    accessKey: optional("ARKIV_ACCESS_KEY", optional("NEXT_PUBLIC_ARKIV_ACCESS_KEY")),
    dep: optional("IIGS_DEP", optional("NEXT_PUBLIC_IIGS_DEP", "dev")),
    verifier: verifierAddress(),
    mirror: mirrorAddress(),
    ...(rpc() ? { rpcUrl: rpc() } : {}),
  };
}

let pub: ReturnType<typeof arkivPublicClient> | undefined;
let wallet: ReturnType<typeof arkivWalletClient> | undefined;

export function publicClient() {
  return (pub ??= arkivPublicClient(arkivConfig()));
}
export function walletClient() {
  return (wallet ??= arkivWalletClient(arkivConfig(), verifierPrivateKey()));
}

/**
 * Maps an Arkiv write failure to a clear API error. On any failure we check the verifier's balance:
 * zero => 503 verifier_unfunded (the common hackathon failure), otherwise 502 arkiv_write_failed.
 */
export async function mapArkivWriteError(
  e: unknown,
  ctx: { address: string; getBalance: () => Promise<bigint> },
): Promise<ApiError> {
  if (e instanceof ApiError) return e;
  const raw = e instanceof Error ? e.message : String(e);
  let balance: bigint | null = null;
  try {
    balance = await ctx.getBalance();
  } catch {
    /* ignore: balance probe is best effort */
  }
  const looksUnfunded = /insufficient funds|exceeds the balance|gas required exceeds|lack of funds|not enough/i.test(raw);
  if (balance === 0n || (balance === null && looksUnfunded)) {
    return new ApiError(
      503,
      "verifier_unfunded",
      `The verifier wallet ${ctx.address} has no tGLM to pay for Arkiv writes. Fund it at https://hub.arkiv.network/faucet and retry.`,
    );
  }
  const first = raw.split("\n")[0]!.slice(0, 240);
  return new ApiError(502, "arkiv_write_failed", `Arkiv write failed: ${first}`);
}

/** Runs an Arkiv write with error mapping. */
export async function withArkivWrite<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    const address = verifierAddress();
    throw await mapArkivWriteError(e, {
      address,
      getBalance: () => publicClient().getBalance({ address }),
    });
  }
}

export async function readArkiv<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof ApiError) throw e;
    const msg = e instanceof Error ? e.message : String(e);
    throw new ApiError(502, "arkiv_read_failed", `Arkiv read failed: ${msg.split("\n")[0]!.slice(0, 240)}`);
  }
}
