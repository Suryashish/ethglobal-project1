import { ApiError, handle, readJson } from "@/lib/server/errors";
import { verifyReaderSession } from "@/lib/server/auth";
import { hexKey } from "@/lib/server/env";
import { signReaderToken } from "@/lib/server/token";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = handle(async (req: Request) => {
  const body = await readJson(req);
  const secret = hexKey("READER_TOKEN_SECRET");
  const { humanId, nationality } = await verifyReaderSession(body.proof);
  if (!nationality) {
    throw new ApiError(403, "no_nationality", "The World ID credential did not reveal a nationality.");
  }
  const { token, expiresAt } = signReaderToken(secret, { humanId, nationality });
  return Response.json({ token, nationality, expiresAt });
});
