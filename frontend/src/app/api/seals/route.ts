import { ApiError, handle, readJson } from "@/lib/server/errors";
import { verifyArmProof } from "@/lib/server/auth";
import { armSeal, checkDraft, rateLimitArm, sealsOfOwner } from "@/lib/server/seals";
import { sealStateToJson } from "@/lib/serialize";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = handle(async (req: Request) => {
  const body = await readJson(req);
  const draft = checkDraft(body.draft);
  const { humanId } = await verifyArmProof(body.proof, draft);
  rateLimitArm(humanId);
  const res = await armSeal(draft, humanId);
  return Response.json({
    sealId: draft.sealId,
    sealEntityKey: res.sealEntityKey,
    txHash: res.txHash,
    createdAt: res.createdAt,
    ownerNullifier: humanId,
  });
});

export const GET = handle(async (req: Request) => {
  const owner = new URL(req.url).searchParams.get("owner");
  if (!owner || owner.length > 128) throw new ApiError(400, "bad_owner", "owner query parameter required");
  const states = await sealsOfOwner(owner);
  return Response.json({ owner, seals: Object.values(states).map(sealStateToJson) });
});
