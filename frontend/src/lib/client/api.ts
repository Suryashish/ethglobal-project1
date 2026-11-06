export class ApiClientError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

async function parse(res: Response) {
  const text = await res.text();
  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    /* non-JSON error body */
  }
  if (!res.ok) {
    const j = (json ?? {}) as { error?: string; message?: string };
    throw new ApiClientError(res.status, j.error ?? "http_error", j.message ?? `Request failed (${res.status})`);
  }
  return json;
}

export async function apiGet<T>(url: string): Promise<T> {
  return (await parse(await fetch(url, { cache: "no-store" }))) as T;
}

export async function apiPost<T>(url: string, body: unknown): Promise<T> {
  return (await parse(
    await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }),
  )) as T;
}

export function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
