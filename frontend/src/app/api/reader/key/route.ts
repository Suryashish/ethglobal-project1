import { toBase64, unwrapKey } from "@iigs/core";
import { ApiError, handle, readJson } from "@/lib/server/errors";
import { hexKey } from "@/lib/server/env";
import { checkGatedRelease } from "@/lib/server/gated";
import { isReleasedOnSepolia } from "@/lib/server/sepolia";
import { loadState } from "@/lib/server/seals";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = handle(async (req: Request) => {
  const body = await readJson(req);
  if (typeof body.sealId !== "string") throw new ApiError(400, "bad_seal_id", "sealId required");
  const state = await loadState(body.sealId);
  const tokenSecret = hexKey("READER_TOKEN_SECRET");
  const chainReleased = state.release ? false : await isReleasedOnSepolia(state.seal.sealId);
  checkGatedRelease(state, body.token, tokenSecret, { chainReleased });
  const key = unwrapKey(state.seal.wrappedKeyEscrow, hexKey("GATED_SECRET_KEY"), state.seal.sealId);
  return Response.json({ keyB64: toBase64(key) });
});
