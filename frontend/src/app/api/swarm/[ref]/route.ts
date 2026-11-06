import { ApiError, handle } from "@/lib/server/errors";
import { REF_RE, downloadFromSwarm } from "@/lib/server/swarm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = handle(async (_req: Request, ctx: { params: Promise<{ ref: string }> }) => {
  const { ref } = await ctx.params;
  if (!REF_RE.test(ref)) throw new ApiError(400, "bad_ref", "reference must be 64 hex characters");
  const upstream = await downloadFromSwarm(ref);
  return new Response(upstream.body, {
    headers: { "content-type": "application/octet-stream", "cache-control": "public, max-age=31536000, immutable" },
  });
});
