export interface ApiFieldError {
  field: string;
  message: string;
}

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message?: string,
    /** Field-level validation errors, e.g. the PAR /submit endpoint's `errors` array. */
    public readonly details: ApiFieldError[] = []
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
    let details: ApiFieldError[] = [];
    try {
      // The API returns errors in a few shapes:
      //   - app errors:        { error: "some_code" }                     (string)
      //   - validation errors: { error: "validation_failed", errors:[{field,message}] }
      //   - zod errors:        { error: { issues, name }, success }       (object)
      // Coerce to a readable string so the UI never shows "[object Object]", and
      // preserve any field-level `errors` array so the caller can map them.
      const body = (await res.json()) as { error?: unknown; errors?: unknown };
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
      if (Array.isArray(body?.errors)) {
        details = (body.errors as unknown[])
          .filter((x): x is ApiFieldError =>
            !!x && typeof (x as ApiFieldError).field === "string")
          .map((x) => ({ field: x.field, message: String(x.message ?? "invalid") }));
      }
    } catch {
      // ignore — keep the http_<status> fallback
    }
    throw new ApiError(res.status, code, undefined, details);
  }

  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

/**
 * Upload helper for multipart/form-data (file uploads). Unlike api(), it does NOT
 * set Content-Type — the browser sets multipart boundaries itself. Shares the same
 * credentials + error-coercion behaviour as api().
 */
export async function apiUpload<T = unknown>(path: string, form: FormData): Promise<T> {
  const res = await fetch(path.startsWith("/") ? path : `/api/${path}`, {
    method: "POST",
    credentials: "include",
    body: form,
  });

  if (!res.ok) {
    let code = `http_${res.status}`;
    try {
      const body = (await res.json()) as { error?: unknown };
      const e = body?.error;
      if (typeof e === "string") code = e;
      else if (e && typeof e === "object") {
        const issues = (e as { issues?: { message?: string }[] }).issues;
        code = Array.isArray(issues) && issues.length
          ? issues.map((i) => i.message ?? "invalid").join("; ")
          : ((e as { name?: string }).name ?? `http_${res.status}`);
      }
    } catch {
      // keep fallback
    }
    throw new ApiError(res.status, code);
  }

  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}
