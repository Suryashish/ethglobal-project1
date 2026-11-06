import { ApiError, handle, readJson } from "@/lib/server/errors";
import { assertActionAllowed, assertSameHuman, verifyOwnerAction } from "@/lib/server/auth";
import { setReleaseAt, loadState } from "@/lib/server/seals";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = handle(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params;
  const body = await readJson(req);
  const releaseAt = body.releaseAt;
  if (typeof releaseAt !== "number" || !Number.isInteger(releaseAt)) throw new ApiError(400, "bad_release_at", "releaseAt must be an integer unix time");
  const state = await loadState(id);
  const { humanId } = await verifyOwnerAction(body.proof, { action: "extend", sealId: id, extra: String(releaseAt) });
  assertSameHuman(humanId, state);

  assertActionAllowed("extend", state, { releaseAt });
  const r = await setReleaseAt(state.seal.entityKey, releaseAt);
  return Response.json({ ok: true, releaseAt, txHash: r.txHash });
});
