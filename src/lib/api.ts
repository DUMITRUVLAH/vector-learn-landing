import { reportClientError } from "@/lib/telemetry";
import { clearApiCache, dedupe } from "./apiCache";

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

/**
 * PERF-002: GET-urile trec prin deduplicare + micro-cache (`src/lib/apiCache.ts`); orice altă
 * metodă golește cache-ul, ca o listă să nu rămână învechită după o mutație. Vezi acolo pentru
 * de ce ferestrele sunt cele alese.
 */
export async function api<T = unknown>(
  path: string,
  init: RequestInit = {}
): Promise<T> {
  const method = (init.method ?? "GET").toUpperCase();
  const url = path.startsWith("/") ? path : `/api/${path}`;

  if (method !== "GET") {
    clearApiCache();
    return rawApi<T>(url, init);
  }
  return dedupe(url, () => rawApi<T>(url, init));
}

async function rawApi<T>(url: string, init: RequestInit): Promise<T> {
  const res = await fetch(url, {
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
  return (await parseJson<T>(res, path)) as T;
}

/**
 * PLATFORM-002: un 200 cu HTML în loc de JSON e clasa de bug-uri #1 din repo — o rută
 * nemontată cade în fallback-ul SPA, iar pagina crapă cu „Unexpected token '<'". Serverul
 * NU vede nimic (a răspuns 200), deci singurul loc de unde se poate raporta e aici.
 */
async function parseJson<T>(res: Response, path: string): Promise<T> {
  try {
    // Citim DOAR prin res.json(). Varianta „ia textul, apoi JSON.parse" ar da un mesaj de
    // eroare mai bogat, dar consumă corpul altfel decât se așteaptă zeci de teste care
    // mochează fetch cu un obiect ce are numai `json()` — și un helper folosit peste tot
    // nu are voie să ceară mai mult din Response decât cere contractul lui real.
    return (await res.json()) as T;
  } catch {
    const type = res.headers?.get?.("content-type") ?? "necunoscut";
    reportClientError({
      kind: "client_api_error",
      message: `Răspuns non-JSON de la ${path} (content-type: ${type}) — probabil rută nemontată`,
      statusCode: res.status,
    });
    throw new ApiError(res.status, "invalid_json_response");
  }
}

/**
 * Upload helper for multipart/form-data (file uploads). Unlike api(), it does NOT
 * set Content-Type — the browser sets multipart boundaries itself. Shares the same
 * credentials + error-coercion behaviour as api().
 */
export async function apiUpload<T = unknown>(path: string, form: FormData): Promise<T> {
  // PERF-002: un upload e o mutație — listele cache-uite (capturi, atașamente, extrase) trebuie
  // să se reîncarce după el, altfel fișierul tocmai încărcat nu apare.
  clearApiCache();
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
  return (await parseJson<T>(res, path)) as T;
}
