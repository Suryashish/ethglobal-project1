import { createRpContext } from "@iigs/world/server";
import { ApiError, handle, readJson } from "@/lib/server/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = handle(async (req: Request) => {
  const body = await readJson(req);
  if (body.kind !== "owner" && body.kind !== "reader") throw new ApiError(400, "bad_kind", "kind must be owner or reader");
  if (typeof body.signal !== "string" || !body.signal || body.signal.length > 512) throw new ApiError(400, "bad_signal", "signal required (max 512 chars)");
  if (body.nationality !== undefined && (typeof body.nationality !== "string" || !/^[A-Z]{2}$/.test(body.nationality))) {
    throw new ApiError(400, "bad_nationality", "nationality must be an ISO-3166 alpha-2 code");
  }
  if (body.kind === "reader" && body.nationality === undefined) throw new ApiError(400, "bad_nationality", "readers must declare the nationality they will prove");
  return Response.json(await createRpContext(body.kind, body.signal, { nationality: body.nationality as string | undefined }));
});
