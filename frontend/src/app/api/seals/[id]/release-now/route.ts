import { handle, readJson } from "@/lib/server/errors";
import { assertActionAllowed, assertSameHuman, verifyOwnerAction } from "@/lib/server/auth";
import { setReleaseAt, loadState } from "@/lib/server/seals";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = handle(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params;
  const body = await readJson(req);

  const state = await loadState(id);
  const { humanId } = await verifyOwnerAction(body.proof, { action: "release-now", sealId: id, extra: "" });
  assertSameHuman(humanId, state);

  assertActionAllowed("release-now", state);
  const at = Math.floor(Date.now() / 1000);
  const r = await setReleaseAt(state.seal.entityKey, at);
  return Response.json({ ok: true, releaseAt: at, txHash: r.txHash });
});
