/** Live Arkiv check: balance of MIRROR; if funded, writes one iigs.release (dep "test") and reads it back. */
import { arkivPublicClient, arkivWalletClient, getRelease, writeRelease } from "@iigs/core/arkiv";
import { loadRawEnv } from "../src/config.js";

const env = loadRawEnv();
const cfg = {
  accessKey: env.ARKIV_ACCESS_KEY ?? "",
  dep: "test",
  verifier: env.VERIFIER_ADDRESS as `0x${string}`,
  mirror: env.MIRROR_ADDRESS as `0x${string}`,
};
const pub = arkivPublicClient(cfg);
const bal = await pub.getBalance({ address: cfg.mirror });
console.log(`MIRROR ${cfg.mirror} balance: ${bal} wei`);
if (bal === 0n) {
  console.log("NOT FUNDED: live write pending funding.");
  process.exit(0);
}
const sealId = Math.random().toString(36).slice(2, 18).padEnd(16, "0");
const w = arkivWalletClient(cfg, env.MIRROR_PRIVATE_KEY as `0x${string}`);
const key = new Uint8Array(32).fill(7);
const r = await writeRelease(w, cfg, { sealId, key, gated: false, sepoliaTx: "0x" + "11".repeat(32), reason: "cre" });
console.log("wrote", r);
for (let i = 0; i < 10; i++) {
  const got = await getRelease(pub, cfg, sealId);
  if (got) { console.log("read back:", { ...got, releasedKey: got.releasedKey && Buffer.from(got.releasedKey).toString("hex") }); process.exit(0); }
  await new Promise((r) => setTimeout(r, 2000));
}
console.log("written but not yet readable");
