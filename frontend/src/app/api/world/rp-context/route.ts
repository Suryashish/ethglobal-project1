import { createRpContext } from "@iigs/world/server";
import { ApiError, handle, readJson } from "@/lib/server/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = handle(async (req: Request) => {
  const body = await readJson(req);
  if (body.kind !== "owner" && body.kind !== "reader") throw new ApiError(400, "bad_kind", "kind must be owner or reader");
  if (typeof body.signal !== "string" || !body.signal) throw new ApiError(400, "bad_signal", "signal required");
  return Response.json(await createRpContext(body.kind, body.signal));
});
