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

export async function readJson(req: Request): Promise<Record<string, unknown>> {
  try {
    const body = await req.json();
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error("not an object");
    return body as Record<string, unknown>;
  } catch {
    throw new ApiError(400, "bad_json", "request body must be a JSON object");
  }
}
