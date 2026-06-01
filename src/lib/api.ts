export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message?: string
  ) {
    super(message ?? code);
  }
}

export async function api<T = unknown>(
  path: string,
  init: RequestInit = {}
): Promise<T> {
  const res = await fetch(path.startsWith("/") ? path : `/api/${path}`, {
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
    ...init,
  });

  if (!res.ok) {
    let code = `http_${res.status}`;
    try {
      // The API returns errors in two shapes:
      //   - app errors:  { error: "some_code" }            (string)
      //   - zod errors:  { error: { issues, name }, success }  (object)
      // Coerce both to a readable string so the UI never shows "[object Object]".
      const body = (await res.json()) as { error?: unknown };
      const e = body?.error;
      if (typeof e === "string") {
        code = e;
      } else if (e && typeof e === "object") {
        const issues = (e as { issues?: { message?: string; path?: unknown[] }[] }).issues;
        if (Array.isArray(issues) && issues.length) {
          code = issues.map((i) => i.message ?? "invalid").join("; ");
        } else {
          code = (e as { name?: string }).name ?? `http_${res.status}`;
        }
      }
    } catch {
      // ignore — keep the http_<status> fallback
    }
    throw new ApiError(res.status, code);
  }

  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}
