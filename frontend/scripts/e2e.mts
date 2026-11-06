// Live API smoke test against a running dev server: `BASE=http://localhost:3000 tsx scripts/e2e.mts`
import { createSeal, draftDigest, fromHex, ownerSignal, readerSignal, toBase64 } from "@iigs/core";

const BASE = process.env.BASE ?? "http://localhost:3000";
const now = () => Math.floor(Date.now() / 1000);
const post = async (path: string, body: unknown) => {
  const r = await fetch(BASE + path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  return { status: r.status, json: await r.json().catch(() => null) as any };
};
const get = async (path: string) => {
  const r = await fetch(BASE + path);
  return { status: r.status, json: await r.json().catch(() => null) as any };
};
const proof = (kind: "owner" | "reader", signal: string, identity = "author", nationality?: string) => ({
  mode: "mock", kind, signal, result: kind === "reader" ? { identity, nationality } : { identity },
});
const show = (name: string, r: { status: number; json: any }) => console.log(name.padEnd(34), r.status, JSON.stringify(r.json).slice(0, 220));

const cfg = (await get("/api/config")).json;
show("GET /api/config", { status: 200, json: { dep: cfg.dep, verifier: cfg.verifierAddress } });

// swarm round trip
const data = crypto.getRandomValues(new Uint8Array(300));
const up = await fetch(BASE + "/api/swarm/upload", { method: "POST", headers: { "content-type": "application/octet-stream" }, body: data });
const upj = await up.json();
console.log("swarm upload".padEnd(34), up.status, JSON.stringify(upj));
if (up.ok) {
  const back = new Uint8Array(await (await fetch(`${BASE}/api/swarm/${upj.reference}`)).arrayBuffer());
  console.log("swarm read-back identical".padEnd(34), toBase64(back) === toBase64(data));
}

const out = createSeal({
  content: { type: "text", text: "e2e hello" },
  rule: { kind: "BOTH", releaseAt: now() + 300, intervalSec: 120 },
  audience: "PUBLIC",
  escrowPublicKey: fromHex(cfg.escrowPublicKey),
  gatedPublicKey: fromHex(cfg.gatedPublicKey),
  source: "vault",
});
const d = out.draft;
const sig = ownerSignal("arm", d.sealId, now(), draftDigest(d));
show("arm: signal mismatch (other action)", await post("/api/seals", { draft: d, proof: proof("owner", ownerSignal("checkin", d.sealId, now())) }));
show("arm: stale signal", await post("/api/seals", { draft: d, proof: proof("owner", ownerSignal("arm", d.sealId, now() - 3600, draftDigest(d))) }));
show("arm: invalid draft", await post("/api/seals", { draft: { ...d, kind: "NOPE" }, proof: proof("owner", sig) }));
const arm = await post("/api/seals", { draft: d, proof: proof("owner", sig) });
show("POST /api/seals (arm)", arm);

if (arm.status === 200) {
  const id = d.sealId;
  await new Promise((r) => setTimeout(r, 6000));
  show("GET state", await get(`/api/seals/${id}`));
  show("checkin as author", await post(`/api/seals/${id}/checkin`, { proof: proof("owner", ownerSignal("checkin", id, now())) }));
  show("checkin as THIEF", await post(`/api/seals/${id}/checkin`, { proof: proof("owner", ownerSignal("checkin", id, now()), "thief") }));
  show("disarm as THIEF", await post(`/api/seals/${id}/disarm`, { proof: proof("owner", ownerSignal("disarm", id, now()), "thief") }));
  show("disarm as author", await post(`/api/seals/${id}/disarm`, { proof: proof("owner", ownerSignal("disarm", id, now())) }));
  await new Promise((r) => setTimeout(r, 6000));
  const s = await get(`/api/seals/${id}`);
  console.log("state after disarm".padEnd(34), s.json?.status);
  show("checkin after disarm", await post(`/api/seals/${id}/checkin`, { proof: proof("owner", ownerSignal("checkin", id, now())) }));
}
show("GET /api/seals/<unknown>", await get("/api/seals/zzzzzzzzzzzzzzzz"));
show("POST /api/seals/state", await post("/api/seals/state", { ids: [d.sealId] }));
show("GET /api/seals?owner=mock:x", await get("/api/seals?owner=mock:x"));

const rs = await post("/api/reader/session", { proof: proof("reader", readerSignal("abcd", now()), "reader1", "IN") });
show("reader session (IN)", { status: rs.status, json: { ...rs.json, token: rs.json?.token ? "<token>" : undefined } });
show("reader session stale", await post("/api/reader/session", { proof: proof("reader", readerSignal("abcd", now() - 7200), "reader1", "IN") }));
show("reader key (unknown seal)", await post("/api/reader/key", { sealId: "zzzzzzzzzzzzzzzz", token: rs.json?.token }));
show("rp-context", await post("/api/world/rp-context", { kind: "owner", signal: "x" }));
