import { ApiError, handle, readJson } from "@/lib/server/errors";
import { loadStates } from "@/lib/server/seals";
import { sealStateToJson } from "@/lib/serialize";
import { isSealId } from "@iigs/core";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Batch states keyed by seal id (ids with no seal are omitted). */
export const POST = handle(async (req: Request) => {
  const body = await readJson(req);
  const ids = body.ids;
  if (!Array.isArray(ids) || ids.length > 50 || !ids.every(isSealId)) {
    throw new ApiError(400, "bad_ids", "ids must be an array of at most 50 valid seal ids");
  }
  const states = await loadStates(ids as string[], true);
  return Response.json(Object.fromEntries(Object.entries(states).map(([k, v]) => [k, sealStateToJson(v)])));
});
