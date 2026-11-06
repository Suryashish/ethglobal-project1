/**
 * Arkiv reads and writes for IF I GO SILENT.
 *
 * Reads are trust-filtered: only entities owned by the configured VERIFIER (seal, checkin, disarm)
 * or MIRROR (release) address count. Writes are done by the backend (VERIFIER) after a successful
 * World ID verification, and by the release mirror (MIRROR) after a Sepolia release event.
 */
import { createPublicClient, createWalletClient, ExpirationTime } from "@arkiv-network/sdk";
import { localhost, rabdi } from "@arkiv-network/sdk/chains";
import { and, eq, or } from "@arkiv-network/sdk/query";
import { http, type Address, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { fromHex, toHex } from "../bytes.js";
import { computeStatus } from "../release.js";
import type {
  Audience,
  CheckinRecord,
  ContentType,
  DisarmRecord,
  ReleaseRecord,
  SealDraft,
  SealKind,
  SealRecord,
  SealState,
} from "../types.js";
import { fromBase64 } from "../bytes.js";
import { u64 } from "@arkiv-network/sdk/schema";
import { CheckinSchema, DisarmSchema, ReleaseSchema, SealSchema } from "./schemas.js";

export * from "./schemas.js";

export const ARKIV_RPC_HOST = "rpc.rabdi.db-chain.testnet.arkiv.network";
export const ARKIV_CHAIN_ID = 7794095;
export const ARKIV_EXPLORER = "https://rabdi.explorer.arkiv.network";

export type ArkivConfig = {
  /** Arkiv access key ("" = public, rate-limited endpoint). */
  accessKey: string;
  /** Deployment tag, e.g. "demo" or "dev". */
  dep: string;
  /** Address of the World-verifier service (writes seal / checkin / disarm). */
  verifier: Address;
  /** Address of the release mirror (writes release). */
  mirror: Address;
  /** Optional RPC URL override (e.g. a proxy or a local node). */
  rpcUrl?: string;
};

function chainFor(cfg: Pick<ArkivConfig, "accessKey" | "rpcUrl">) {
  if (cfg.rpcUrl && /127\.0\.0\.1|localhost/.test(cfg.rpcUrl)) return localhost;
  return rabdi({ accessKey: cfg.accessKey });
}

export function arkivPublicClient(cfg: Pick<ArkivConfig, "accessKey" | "rpcUrl">) {
  return createPublicClient({ chain: chainFor(cfg), transport: http(cfg.rpcUrl) });
}

export function arkivWalletClient(cfg: Pick<ArkivConfig, "accessKey" | "rpcUrl">, privateKey: Hex) {
  return createWalletClient({
    chain: chainFor(cfg),
    transport: http(cfg.rpcUrl),
    account: privateKeyToAccount(privateKey),
  });
}

export type ArkivPublic = ReturnType<typeof arkivPublicClient>;
export type ArkivWallet = ReturnType<typeof arkivWalletClient>;

const n = (v: bigint | number | undefined) => (v === undefined ? 0 : Number(v));
const hexBytes = (v: Hex | undefined) => (v && v !== "0x" ? fromHex(v) : undefined);

// ---------------------------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------------------------

/* eslint-disable @typescript-eslint/no-explicit-any */
function toSeal(row: any, withInline: boolean): SealRecord {
  return {
    entityKey: row.$key,
    sealId: row.sealId.value,
    kind: row.kind.value as SealKind,
    releaseAt: n(row.releaseAt.value),
    intervalSec: n(row.intervalSec.value),
    audience: row.audience.value as Audience,
    countries: row.countries.value ? String(row.countries.value).split(",").filter(Boolean) : [],
    ownerNullifier: row.ownerNullifier.value,
    contentType: row.contentType.value as ContentType,
    swarmRef: row.swarmRef?.value ?? "",
    ...(withInline && row.cipherInline?.value ? { cipherInline: hexBytes(row.cipherInline.value) } : {}),
    wrappedKeyEscrow: hexBytes(row.wrappedKeyEscrow.value) ?? new Uint8Array(),
    title: row.title.value,
    createdAt: n(row.createdAt.value),
    contentHash: row.contentHash.value,
    sizeBytes: n(row.sizeBytes.value),
    source: row.source.value,
  };
}

function toCheckin(row: any): CheckinRecord {
  return { entityKey: row.$key, sealId: row.sealId.value, at: n(row.at.value), expiresAtSec: n(row.expiresAtSec.value) };
}
function toDisarm(row: any): DisarmRecord {
  return { entityKey: row.$key, sealId: row.sealId.value, at: n(row.at.value) };
}
function toRelease(row: any): ReleaseRecord {
  return {
    entityKey: row.$key,
    sealId: row.sealId.value,
    releasedAt: n(row.releasedAt.value),
    ...(row.releasedKey?.value ? { releasedKey: hexBytes(row.releasedKey.value) } : {}),
    gated: row.gated.value === "1",
    sepoliaTx: row.sepoliaTx.value,
    reason: row.reason.value,
  };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

/** Collects all pages of a query (up to `max` rows). */
async function fetchAll<T>(
  page: (offset: number) => Promise<{ entities: readonly unknown[] }>,
  map: (row: unknown) => T,
  max = 2000,
): Promise<T[]> {
  const out: T[] = [];
  for (let offset = 0; offset < max; offset += 100) {
    const res = await page(offset);
    for (const r of res.entities) out.push(map(r));
    if (res.entities.length < 100) break;
  }
  return out;
}

export async function getSeal(
  client: ArkivPublic,
  cfg: ArkivConfig,
  sealId: string,
  opts: { withInline?: boolean } = {},
): Promise<SealRecord | null> {
  const res = await client
    .select()
    .from(SealSchema)
    .where(and(eq("dep", cfg.dep), eq("sealId", sealId)))
    .ownedBy(cfg.verifier)
    .limit(5)
    .fetch();
  const row = res.entities[0];
  return row ? toSeal(row, opts.withInline ?? false) : null;
}

export async function getCheckins(client: ArkivPublic, cfg: ArkivConfig, sealId: string): Promise<CheckinRecord[]> {
  const res = await client
    .select()
    .from(CheckinSchema)
    .where(and(eq("dep", cfg.dep), eq("sealId", sealId)))
    .ownedBy(cfg.verifier)
    .limit(100)
    .fetch();
  return res.entities.map(toCheckin).sort((a, b) => b.at - a.at);
}

export async function getDisarm(client: ArkivPublic, cfg: ArkivConfig, sealId: string): Promise<DisarmRecord | null> {
  const res = await client
    .select()
    .from(DisarmSchema)
    .where(and(eq("dep", cfg.dep), eq("sealId", sealId)))
    .ownedBy(cfg.verifier)
    .limit(1)
    .fetch();
  return res.entities[0] ? toDisarm(res.entities[0]) : null;
}

export async function getRelease(client: ArkivPublic, cfg: ArkivConfig, sealId: string): Promise<ReleaseRecord | null> {
  const res = await client
    .select()
    .from(ReleaseSchema)
    .where(and(eq("dep", cfg.dep), eq("sealId", sealId)))
    .ownedBy(cfg.mirror)
    .limit(1)
    .fetch();
  return res.entities[0] ? toRelease(res.entities[0]) : null;
}

export function assembleState(
  seal: SealRecord,
  checkins: CheckinRecord[],
  disarm: DisarmRecord | null,
  release: ReleaseRecord | null,
  now = Math.floor(Date.now() / 1000),
): SealState {
  // Arkiv expiry is block-granular; also drop check-ins whose own deadline passed.
  const live = checkins.filter((c) => c.expiresAtSec > now);
  const s = computeStatus({
    releaseAt: seal.releaseAt,
    intervalSec: seal.intervalSec,
    createdAt: seal.createdAt,
    disarmed: disarm !== null,
    released: release !== null,
    liveCheckinExpiries: live.map((c) => c.expiresAtSec),
    now,
  });
  return { seal, disarm, release, checkins: live, ...s };
}

/** Full state of one seal: 4 parallel Arkiv queries joined client-side. */
export async function getSealState(
  client: ArkivPublic,
  cfg: ArkivConfig,
  sealId: string,
  opts: { withInline?: boolean; now?: number } = {},
): Promise<SealState | null> {
  const [seal, checkins, disarm, release] = await Promise.all([
    getSeal(client, cfg, sealId, opts),
    getCheckins(client, cfg, sealId),
    getDisarm(client, cfg, sealId),
    getRelease(client, cfg, sealId),
  ]);
  if (!seal) return null;
  return assembleState(seal, checkins, disarm, release, opts.now);
}

/** Batch state for many seal IDs (extension feed scan, dashboard). */
export async function getSealStates(
  client: ArkivPublic,
  cfg: ArkivConfig,
  sealIds: string[],
  opts: { withInline?: boolean; now?: number } = {},
): Promise<Record<string, SealState>> {
  const ids = [...new Set(sealIds)].slice(0, 100);
  if (ids.length === 0) return {};
  const where = and(eq("dep", cfg.dep), ids.length === 1 ? eq("sealId", ids[0]!) : or(...ids.map((id) => eq("sealId", id))));
  const [seals, checkins, disarms, releases] = await Promise.all([
    client.select().from(SealSchema).where(where).ownedBy(cfg.verifier).limit(100).fetch(),
    fetchAll((o) => client.select().from(CheckinSchema).where(where).ownedBy(cfg.verifier).limit(100).offset(o).fetch(), toCheckin),
    client.select().from(DisarmSchema).where(where).ownedBy(cfg.verifier).limit(100).fetch(),
    client.select().from(ReleaseSchema).where(where).ownedBy(cfg.mirror).limit(100).fetch(),
  ]);
  const out: Record<string, SealState> = {};
  const dis = new Map(disarms.entities.map((r) => [toDisarm(r).sealId, toDisarm(r)]));
  const rel = new Map(releases.entities.map((r) => [toRelease(r).sealId, toRelease(r)]));
  for (const row of seals.entities) {
    const seal = toSeal(row, opts.withInline ?? false);
    if (out[seal.sealId]) continue;
    out[seal.sealId] = assembleState(
      seal,
      checkins.filter((c) => c.sealId === seal.sealId),
      dis.get(seal.sealId) ?? null,
      rel.get(seal.sealId) ?? null,
      opts.now,
    );
  }
  return out;
}

/** Seals armed by one human (dashboard). */
export async function listSealsByOwner(
  client: ArkivPublic,
  cfg: ArkivConfig,
  ownerNullifier: string,
): Promise<SealRecord[]> {
  return fetchAll(
    (o) =>
      client
        .select()
        .from(SealSchema)
        .where(and(eq("dep", cfg.dep), eq("ownerNullifier", ownerNullifier)))
        .ownedBy(cfg.verifier)
        .limit(100)
        .offset(o)
        .fetch(),
    (r) => toSeal(r, false),
  );
}

/** Everything the release sweeper needs, in 4 bulk queries (no ciphertext). */
export async function loadSweepSnapshot(client: ArkivPublic, cfg: ArkivConfig, now = Math.floor(Date.now() / 1000)) {
  const dep = eq("dep", cfg.dep);
  const [seals, checkins, disarms, releases] = await Promise.all([
    fetchAll((o) => client.select().from(SealSchema).where(dep).ownedBy(cfg.verifier).limit(100).offset(o).fetch(), (r) => toSeal(r, false)),
    fetchAll((o) => client.select().from(CheckinSchema).where(dep).ownedBy(cfg.verifier).limit(100).offset(o).fetch(), toCheckin),
    fetchAll((o) => client.select().from(DisarmSchema).where(dep).ownedBy(cfg.verifier).limit(100).offset(o).fetch(), toDisarm),
    fetchAll((o) => client.select().from(ReleaseSchema).where(dep).ownedBy(cfg.mirror).limit(100).offset(o).fetch(), toRelease),
  ]);
  const byId = <T extends { sealId: string }>(xs: T[]) => {
    const m = new Map<string, T[]>();
    for (const x of xs) m.set(x.sealId, [...(m.get(x.sealId) ?? []), x]);
    return m;
  };
  const ci = byId(checkins);
  const di = byId(disarms);
  const re = byId(releases);
  return seals.map((s) => assembleState(s, ci.get(s.sealId) ?? [], di.get(s.sealId)?.[0] ?? null, re.get(s.sealId)?.[0] ?? null, now));
}

// ---------------------------------------------------------------------------------------------
// Writes (service keys only)
// ---------------------------------------------------------------------------------------------

const nowSec = () => Math.floor(Date.now() / 1000);

/** Max Arkiv lifetime is ~182 days; seals/disarms/releases use it. */
const LONG = () => ExpirationTime.fromDays(180);

/**
 * Arms a seal: creates the seal entity AND its first heartbeat check-in in ONE transaction, so the
 * sweeper can never observe a heartbeat seal without a heartbeat.
 */
export async function writeArmedSeal(
  wallet: ArkivWallet,
  cfg: ArkivConfig,
  draft: SealDraft,
  ownerNullifier: string,
): Promise<{ sealEntityKey: Hex; checkinEntityKey: Hex | null; txHash: Hex; createdAt: number }> {
  const createdAt = nowSec();
  const sealValues = {
    dep: cfg.dep,
    sealId: draft.sealId,
    kind: draft.kind,
    releaseAt: u64(draft.releaseAt),
    intervalSec: u64(draft.intervalSec),
    audience: draft.audience,
    countries: draft.countries.join(","),
    ownerNullifier,
    contentType: draft.contentType,
    ...(draft.swarmRef ? { swarmRef: draft.swarmRef } : {}),
    ...(draft.cipherInlineB64 ? { cipherInline: fromBase64(draft.cipherInlineB64) } : {}),
    wrappedKeyEscrow: fromBase64(draft.wrappedKeyB64),
    title: draft.title,
    createdAt: u64(createdAt),
    contentHash: draft.contentHash,
    sizeBytes: u64(draft.sizeBytes),
    source: draft.source,
  };
  const creates: unknown[] = [{ schema: SealSchema, values: sealValues, expiration: LONG() }];
  if (draft.intervalSec > 0) creates.push(checkinCreate(cfg, draft.sealId, draft.intervalSec, createdAt));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const res = await wallet.executeBatch({ creates: creates as any });
  return {
    sealEntityKey: res.createdEntities[0]!,
    checkinEntityKey: res.createdEntities[1] ?? null,
    txHash: res.txHash,
    createdAt,
  };
}

function checkinCreate(cfg: ArkivConfig, sealId: string, intervalSec: number, at: number) {
  return {
    schema: CheckinSchema,
    values: { dep: cfg.dep, sealId, at: u64(at), expiresAtSec: u64(at + intervalSec), nullifierMatch: "ok" },
    // Arkiv's own expiration IS the dead-man's switch.
    expiration: ExpirationTime.fromSeconds(Math.ceil(intervalSec / 2) * 2),
  };
}

/** Heartbeat: a new check-in entity that Arkiv expires after intervalSec. */
export async function writeCheckin(wallet: ArkivWallet, cfg: ArkivConfig, sealId: string, intervalSec: number) {
  const at = nowSec();
  const c = checkinCreate(cfg, sealId, intervalSec, at);
  const res = await wallet.createEntity(c.schema, c.values, { expiration: c.expiration });
  return { entityKey: res.entityKey, txHash: res.txHash, at, expiresAtSec: at + intervalSec };
}

export async function writeDisarm(wallet: ArkivWallet, cfg: ArkivConfig, sealId: string) {
  const at = nowSec();
  const res = await wallet.createEntity(DisarmSchema, { dep: cfg.dep, sealId, at: u64(at) }, { expiration: LONG() });
  return { entityKey: res.entityKey, txHash: res.txHash, at };
}

/** Release-now / extend: the verifier patches the seal's releaseAt. */
export async function patchReleaseAt(wallet: ArkivWallet, sealEntityKey: Hex, releaseAt: number) {
  const res = await wallet.patchEntity(SealSchema, sealEntityKey, { set: { releaseAt: u64(releaseAt) } });
  return { txHash: res.txHash };
}

export async function writeRelease(
  wallet: ArkivWallet,
  cfg: ArkivConfig,
  r: { sealId: string; key?: Uint8Array; gated: boolean; sepoliaTx: string; reason: string; releasedAt?: number },
) {
  const releasedAt = r.releasedAt ?? nowSec();
  const res = await wallet.createEntity(
    ReleaseSchema,
    {
      dep: cfg.dep,
      sealId: r.sealId,
      releasedAt: u64(releasedAt),
      ...(r.key && r.key.length ? { releasedKey: r.key } : {}),
      gated: r.gated ? "1" : "0",
      sepoliaTx: r.sepoliaTx,
      reason: r.reason.slice(0, 100),
    },
    { expiration: LONG() },
  );
  return { entityKey: res.entityKey, txHash: res.txHash };
}

export { toHex };
