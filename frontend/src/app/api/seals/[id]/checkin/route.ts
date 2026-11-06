import { handle, readJson } from "@/lib/server/errors";
import { assertActionAllowed, assertSameHuman, verifyOwnerAction } from "@/lib/server/auth";
import { checkin, loadState } from "@/lib/server/seals";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = handle(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params;
  const body = await readJson(req);

  const state = await loadState(id);
  const { humanId } = await verifyOwnerAction(body.proof, { action: "checkin", sealId: id, extra: "" });
  assertSameHuman(humanId, state);

  assertActionAllowed("checkin", state);
  const r = await checkin(id, state.seal.intervalSec);
  return Response.json({ ok: true, at: r.at, expiresAtSec: r.expiresAtSec, txHash: r.txHash });
});
