import { handle } from "@/lib/server/errors";
import { loadState } from "@/lib/server/seals";
import { sealStateToJson } from "@/lib/serialize";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = handle(async (_req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params;
  return Response.json(sealStateToJson(await loadState(id, true)));
});
