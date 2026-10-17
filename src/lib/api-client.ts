export type ApiIssue = { path: string; message: string };

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public issues: ApiIssue[] = [],
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export async function api<T>(path: string, init: RequestInit & { json?: unknown } = {}): Promise<T> {
  const { json, headers, ...rest } = init;
  const request: RequestInit = { ...rest, headers };
  if (json !== undefined) {
    request.headers = { "content-type": "application/json", ...headers };
    request.body = JSON.stringify(json);
  }
  const res = await fetch(path, request);
  const body = res.headers.get("content-type")?.includes("application/json") ? await res.json() : null;
  if (!res.ok) throw new ApiError(res.status, body?.error ?? `Request failed (${res.status})`, body?.issues);
  return body as T;
}

export function qs(params: Record<string, string | number | boolean | undefined | null | string[]>): string {
  const sp = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === "" || value === false) continue;
    if (Array.isArray(value)) {
      if (value.length > 0) sp.set(key, value.join(","));
    } else {
      sp.set(key, String(value));
    }
  }
  const s = sp.toString();
  return s ? `?${s}` : "";
}

export function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : "Something went wrong";
}
