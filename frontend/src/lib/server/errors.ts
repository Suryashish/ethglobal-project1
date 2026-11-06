/** Typed API error: becomes `{ error: code, message }` with `status`. */
export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export function errorResponse(e: unknown): Response {
  if (e instanceof ApiError) {
    return Response.json({ error: e.code, message: e.message }, { status: e.status });
  }
  const msg = e instanceof Error ? e.message : String(e);
  console.error("[api] unhandled", e);
  return Response.json({ error: "internal_error", message: msg.slice(0, 300) }, { status: 500 });
}

/** Wraps a route handler so thrown ApiErrors / unexpected errors become JSON responses. */
export function handle<A extends unknown[]>(fn: (...args: A) => Promise<Response>) {
  return async (...args: A): Promise<Response> => {
    try {
      return await fn(...args);
    } catch (e) {
      return errorResponse(e);
    }
  };
}

/** Largest JSON body any route accepts (an inline draft is ~12 KB; 64 KB leaves room, blocks memory/gas abuse). */
export const MAX_JSON_BYTES = 64 * 1024;

/** Reads at most `max` bytes of the body; throws 413 beyond that (checks Content-Length first, then while streaming). */
export async function readBodyCapped(req: Request, max: number): Promise<Uint8Array> {
  const declared = Number(req.headers.get("content-length") ?? "NaN");
  if (Number.isFinite(declared) && declared > max) throw new ApiError(413, "too_large", `request body exceeds ${max} bytes`);
  if (!req.body) return new Uint8Array();
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > max) {
      await reader.cancel().catch(() => {});
      throw new ApiError(413, "too_large", `request body exceeds ${max} bytes`);
    }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let o = 0;
  for (const c of chunks) { out.set(c, o); o += c.length; }
  return out;
}

export async function readJson(req: Request): Promise<Record<string, unknown>> {
  const raw = await readBodyCapped(req, MAX_JSON_BYTES);
  try {
    const body = JSON.parse(new TextDecoder().decode(raw));
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error("not an object");
    return body as Record<string, unknown>;
  } catch {
    throw new ApiError(400, "bad_json", "request body must be a JSON object");
  }
}
