import { ApiError, handle, readBodyCapped } from "@/lib/server/errors";
import { MAX_UPLOAD_BYTES, uploadToSwarm } from "@/lib/server/swarm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = handle(async (req: Request) => {
  // capped while streaming: an oversized upload is cut off without buffering it in memory
  const buf = await readBodyCapped(req, MAX_UPLOAD_BYTES);
  if (buf.length === 0) throw new ApiError(400, "empty_body", "no bytes sent");
  const reference = await uploadToSwarm(buf);
  return Response.json({ reference });
});
