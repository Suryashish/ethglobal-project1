// End-to-end release test against a running stack (web app + sweeper (CRE or dev) + mirror).
//   BASE=http://localhost:3000 tsx scripts/e2e-release.mts
// Seals 3 items (World ID mock mode), then waits for the release engine:
//   A. PUBLIC heartbeat seal (60 s), inline text — author goes silent → released → decrypt
//   B. GATED (IN) timer seal (+40 s), file on Swarm — IN reader decrypts, US reader refused
//   C. PUBLIC timer seal (+45 s), file on Swarm — decrypt, verify bytes
//   D. PUBLIC heartbeat seal (60 s) that the author keeps checking in on — must NOT release
import {
  createSeal,
  draftDigest,
  fromBase64,
  fromHex,
  openSeal,
  ownerSignal,
  readerSignal,
  type SealDraft,
} from "@iigs/core";

const BASE = process.env.BASE ?? "http://localhost:3000";
const now = () => Math.floor(Date.now() / 1000);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
let failures = 0;
const check = (name: string, ok: boolean, extra = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? "  — " + extra : ""}`);
  if (!ok) failures++;
};
async function post(path: string, body: unknown) {
  const r = await fetch(BASE + path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  return { status: r.status, json: (await r.json().catch(() => null)) as any };
}
async function get(path: string) {
  const r = await fetch(BASE + path);
  return { status: r.status, json: (await r.json().catch(() => null)) as any };
}
const proof = (kind: "owner" | "reader", signal: string, identity = "author", nationality?: string) => ({
  mode: "mock",
  kind,
  signal,
  result: nationality ? { identity, nationality } : { identity },
  ...(nationality ? { claim: { nationality } } : {}),
});

const cfg = (await get("/api/config")).json;
/** Fetch our ciphertext from Swarm like the reader does: gateway first, then our /api/swarm proxy; status-checked, retried. */
async function swarmBytes(ref: string): Promise<Uint8Array | null> {
  for (let attempt = 1; attempt <= 3; attempt++) {
    for (const url of [`${cfg.swarmGateway}/bytes/${ref}`, `${BASE}/api/swarm/${ref}`]) {
      try {
        const r = await fetch(url, { signal: AbortSignal.timeout(60_000) });
        if (r.ok) return new Uint8Array(await r.arrayBuffer());
        console.log(`  swarm read ${url.includes("/api/") ? "proxy" : "gateway"} → HTTP ${r.status}`);
      } catch (e) {
        console.log(`  swarm read failed: ${(e as Error).message}`);
      }
    }
    await sleep(3000 * attempt);
  }
  return null;
}

console.log(`stack: dep=${cfg.dep} arkiv=${cfg.arkivRpcUrl || "rabdi"} contract=${cfg.silentReleaseAddress}`);

async function arm(content: Parameters<typeof createSeal>[0]["content"], rule: any, audience: "PUBLIC" | "GATED", countries: string[] = []) {
  const out = createSeal({
    content,
    rule,
    audience,
    countries,
    escrowPublicKey: fromHex(cfg.escrowPublicKey),
    gatedPublicKey: fromHex(cfg.gatedPublicKey),
    source: "vault",
    title: "e2e",
  });
  const d: SealDraft = out.draft;
  if (out.needsSwarmUpload) {
    const up = await fetch(BASE + "/api/swarm/upload", { method: "POST", headers: { "content-type": "application/octet-stream" }, body: out.ciphertext as unknown as BodyInit });
    const uj = await up.json().catch(() => null);
    if (!up.ok || !uj?.reference) {
      check(`swarm upload for ${d.sealId}`, false, `${up.status} ${JSON.stringify(uj)}`);
      return d;
    }
    d.swarmRef = uj.reference;
  }
  const r = await post("/api/seals", { draft: d, proof: proof("owner", ownerSignal("arm", d.sealId, now(), draftDigest(d))) });
  check(`arm ${d.sealId} (${rule.kind}/${audience}/${d.contentType})`, r.status === 200, r.status === 200 ? `tx ${r.json.txHash.slice(0, 12)}…` : JSON.stringify(r.json));
  return d;
}

const fileA = crypto.getRandomValues(new Uint8Array(30_000));
const fileC = new TextEncoder().encode("%PDF-1.4 fake evidence " + "x".repeat(20_000));
const A = await arm({ type: "text", text: "If you are reading this, I went silent. — A" }, { kind: "HEARTBEAT", intervalSec: 60 }, "PUBLIC");
const B = await arm({ type: "file", name: "leak.bin", mime: "application/octet-stream", bytes: fileA }, { kind: "TIMER", releaseAt: now() + 40 }, "GATED", ["IN"]);
const C = await arm({ type: "file", name: "evidence.pdf", mime: "application/pdf", bytes: fileC }, { kind: "TIMER", releaseAt: now() + 45 }, "PUBLIC");
// D's heartbeat needs margin for testnet write latency (3–8 s per check-in): use E2E_D_INTERVAL_SEC=120 on testnet.
const D = await arm({ type: "text", text: "I am fine — D" }, { kind: "HEARTBEAT", intervalSec: Number(process.env.E2E_D_INTERVAL_SEC ?? 60) }, "PUBLIC");

const ids = [A.sealId, B.sealId, C.sealId, D.sealId];
const t0 = now();
const deadline = t0 + Number(process.env.E2E_TIMEOUT_SEC ?? 240);
let lastCheckin = now();
const final = new Map<string, any>();
while (now() < deadline) {
  // the author of D keeps checking in every ~25 s
  if (now() - lastCheckin >= 20) {
    const r = await post(`/api/seals/${D.sealId}/checkin`, { proof: proof("owner", ownerSignal("checkin", D.sealId, now())) });
    if (r.status !== 200) {
      process.stdout.write("\n");
      check(`D check-in at t+${now() - t0}s`, false, `${r.status} ${JSON.stringify(r.json)}`);
    }
    lastCheckin = now();
  }
  const st = (await post("/api/seals/state", { ids })).json ?? {};
  const line = ids.map((id) => `${id.slice(0, 4)}:${st[id]?.status ?? "?"}`).join(" ");
  process.stdout.write(`\r  t+${String(now() - t0).padStart(3)}s  ${line}   `);
  for (const id of [A.sealId, B.sealId, C.sealId]) if (st[id]?.status === "RELEASED") final.set(id, st[id]);
  if (final.size === 3 && now() - t0 > 100) {
    final.set(D.sealId, st[D.sealId]);
    break;
  }
  await sleep(Number(process.env.E2E_POLL_MS ?? 5000));
}
console.log();

// A: public heartbeat text
const sa = final.get(A.sealId);
check("A released after silence (heartbeat)", sa?.status === "RELEASED", sa ? `reason=${sa.release?.reason} tx=${sa.release?.sepoliaTx?.slice(0, 12)}` : "not released");
if (sa?.release?.releasedKeyB64) {
  const env = openSeal({ sealId: A.sealId, key: fromBase64(sa.release.releasedKeyB64), ciphertext: fromBase64(sa.seal.cipherInlineB64), contentHash: sa.seal.contentHash });
  check("A decrypts to the original text", new TextDecoder().decode(env.body) === "If you are reading this, I went silent. — A");
}

// C: public timer file via Swarm
const sc = final.get(C.sealId);
check("C released at timer", sc?.status === "RELEASED");
if (sc?.release?.releasedKeyB64) {
  const ct = await swarmBytes(sc.seal.swarmRef);
  check("C ciphertext retrievable from Swarm", ct !== null, ct ? "" : "Swarm gateway unavailable");
  if (ct) {
  const env = openSeal({ sealId: C.sealId, key: fromBase64(sc.release.releasedKeyB64), ciphertext: ct, contentHash: sc.seal.contentHash });
  check("C file from Swarm decrypts byte-identical", env.header.kind === "file" && (env.header as any).name === "evidence.pdf" && Buffer.compare(Buffer.from(env.body), Buffer.from(fileC)) === 0);
  }
}

// B: gated — key never published
const sb = final.get(B.sealId);
check("B released (gated)", sb?.status === "RELEASED" && sb.release?.gated === true && !sb.release?.releasedKeyB64, "no key on Arkiv/chain");
const tokIN = (await post("/api/reader/session", { proof: proof("reader", readerSignal("n1" + now(), now()), "reader-in", "IN") })).json?.token;
const tokUS = (await post("/api/reader/session", { proof: proof("reader", readerSignal("n2" + now(), now()), "reader-us", "US") })).json?.token;
const kUS = await post("/api/reader/key", { sealId: B.sealId, token: tokUS });
check("B: US reader refused", kUS.status === 403 && kUS.json?.error === "not_in_country", `${kUS.status} ${kUS.json?.error}`);
const kIN = await post("/api/reader/key", { sealId: B.sealId, token: tokIN });
check("B: IN reader gets the key", kIN.status === 200 && !!kIN.json?.keyB64, `${kIN.status}`);
if (kIN.json?.keyB64 && sb) {
  const ct = await swarmBytes(sb.seal.swarmRef);
  check("B ciphertext retrievable from Swarm", ct !== null, ct ? "" : "Swarm gateway unavailable");
  if (ct) {
  const env = openSeal({ sealId: B.sealId, key: fromBase64(kIN.json.keyB64), ciphertext: ct, contentHash: sb.seal.contentHash });
  check("B decrypts byte-identical for IN reader", Buffer.compare(Buffer.from(env.body), Buffer.from(fileA)) === 0);
  }
}
const kPublicA = await post("/api/reader/key", { sealId: A.sealId, token: tokIN });
check("reader/key refuses non-gated seals", kPublicA.status >= 400);

// D: kept alive
const sd = final.get(D.sealId) ?? (await get(`/api/seals/${D.sealId}`)).json;
check("D NOT released while the author keeps checking in", sd?.status === "ARMED", `status=${sd?.status}`);
const dis = await post(`/api/seals/${D.sealId}/disarm`, { proof: proof("owner", ownerSignal("disarm", D.sealId, now())) });
check("D disarmed by author", dis.status === 200);

console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
