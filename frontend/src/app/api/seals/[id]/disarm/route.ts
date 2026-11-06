import { handle, readJson } from "@/lib/server/errors";
import { assertActionAllowed, assertSameHuman, verifyOwnerAction } from "@/lib/server/auth";
import { disarm, loadState } from "@/lib/server/seals";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = handle(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params;
  const body = await readJson(req);

  const state = await loadState(id);
  const { humanId } = await verifyOwnerAction(body.proof, { action: "disarm", sealId: id, extra: "" });
  assertSameHuman(humanId, state);

  assertActionAllowed("disarm", state);
  const r = await disarm(id);
  return Response.json({ ok: true, at: r.at, txHash: r.txHash });
});
