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
    public readonly details: ApiFieldError[] = [],
    /**
     * Corpul JSON brut al erorii. Unele rute nu trimit doar un cod, ci și CONTEXTUL care explică
     * de ce a picat (ex. `GET /api/par/:id` → `reason`, `workspace`, `currentEmail`) — fără el,
     * ecranul nu poate afișa decât codul sec, care nu spune omului nimic.
     */
    public readonly body: Record<string, unknown> = {}
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
  // `cache: "reload"` = reîncărcare cerută explicit de utilizator (butonul „Reîncarcă").
  // Trebuie să ocolească micro-cache-ul, altfel butonul pare că nu face nimic.
  return dedupe(url, () => rawApi<T>(url, init), init.cache === "reload");
}

/**
 * Cât așteptăm un GET înainte să-l declarăm blocat.
 *
 * De ce există: `fetch` nu are timeout implicit. O cerere care rămâne agățată (rețea care a
 * dispărut, laptop trezit din somn cu conexiunea moartă, proxy care ține socketul deschis) NU
 * respinge niciodată promisiunea — iar fiecare ecran care face `finally { setLoading(false) }`
 * rămâne pe „Se încarcă…" la infinit, fără nicio cale de ieșire în afară de reîncărcarea paginii.
 * Exact așa a arătat fila „Workspace-uri" din Consola Platformă (2026-08-28), în timp ce
 * `GET /api/platform/workspaces` răspundea în 260 ms pe prod.
 *
 * 30 s = de peste 100× latența reală a celui mai lent GET al aplicației, deci nu poate tăia o
 * cerere sănătoasă; dar transformă o cerere moartă într-o eroare vizibilă, cu buton de reîncercare.
 * Un apelant care chiar are nevoie de mai mult își trimite propriul `signal` și scapă de limită.
 */
export const GET_TIMEOUT_MS = 30_000;

async function rawApi<T>(url: string, init: RequestInit): Promise<T> {
  const method = (init.method ?? "GET").toUpperCase();
  // Doar GET-urile primesc limita automat: mutațiile (extragere AI, generare PDF, import) pot
  // dura legitim minute, iar un abort acolo ar lăsa acțiunea pe jumătate făcută pe server.
  const guard = method === "GET" && !init.signal ? new AbortController() : null;
  const timer = guard ? setTimeout(() => guard.abort(), GET_TIMEOUT_MS) : null;

  let res: Response;
  try {
    res = await fetch(url, {
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        ...(init.headers ?? {}),
      },
      ...init,
      signal: init.signal ?? guard?.signal,
    });
  } catch (err) {
    if (guard?.signal.aborted) {
      reportClientError({
        kind: "client_api_error",
        message: `Cererea ${url} nu a răspuns în ${GET_TIMEOUT_MS / 1000} s (abandonată)`,
        method,
      });
      throw new ApiError(0, "request_timeout");
    }
    throw err;
  } finally {
    if (timer) clearTimeout(timer);
  }

  if (!res.ok) {
    let code = `http_${res.status}`;
    let details: ApiFieldError[] = [];
    let raw: Record<string, unknown> = {};
    try {
      // The API returns errors in a few shapes:
      //   - app errors:        { error: "some_code" }                     (string)
      //   - validation errors: { error: "validation_failed", errors:[{field,message}] }
      //   - zod errors:        { error: { issues, name }, success }       (object)
      // Coerce to a readable string so the UI never shows "[object Object]", and
      // preserve any field-level `errors` array so the caller can map them.
      const body = (await res.json()) as { error?: unknown; errors?: unknown };
      if (body && typeof body === "object") raw = body as Record<string, unknown>;
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
    throw new ApiError(res.status, code, undefined, details, raw);
  }

  if (res.status === 204) return undefined as T;
  // `url`, nu `path`: parametrul a fost redenumit când `api()` a fost împărțit în api()+rawApi()
  // pentru cache-ul de cereri (PERF-002). Referința rămasă la `path` arunca „ReferenceError: path
  // is not defined" pe FIECARE răspuns reușit — adică ar fi rupt toată aplicația.
  return (await parseJson<T>(res, url)) as T;
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
