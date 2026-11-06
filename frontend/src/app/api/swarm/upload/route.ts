import { ApiError, handle } from "@/lib/server/errors";
import { MAX_UPLOAD_BYTES, uploadToSwarm } from "@/lib/server/swarm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = handle(async (req: Request) => {
  const buf = new Uint8Array(await req.arrayBuffer());
  if (buf.length === 0) throw new ApiError(400, "empty_body", "no bytes sent");
  if (buf.length > MAX_UPLOAD_BYTES) throw new ApiError(413, "too_large", "ciphertext exceeds 10 MiB");
  const reference = await uploadToSwarm(buf);
  return Response.json({ reference });
});
