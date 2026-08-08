/**
 * PLATFORM-002 — raportarea erorilor din browser către Consola Platformă.
 *
 * Trimite spre `POST /api/telemetry/error`. Reguli, ca să nu facă mai mult rău decât bine:
 *   • strict fire-and-forget — un raport eșuat nu are voie să producă o a doua eroare
 *   • dedup local: aceeași eroare nu se retrimite mai des de o dată la 60s
 *   • plafon de 20 de rapoarte per sesiune de pagină (o buclă de randare poate arunca mii)
 *   • în dezvoltare doar loghează, ca telemetria să nu polueze consola proprietarului cu
 *     zgomotul propriilor experimente (`VITE_TELEMETRY=1` o pornește oricum)
 */
type ClientErrorKind = "client_crash" | "client_unhandled" | "client_api_error";

interface ReportInput {
  kind: ClientErrorKind;
  message: string;
  stack?: string | null;
  statusCode?: number | null;
  method?: string | null;
}

const DEDUP_MS = 60_000;
const MAX_PER_PAGE = 20;

const lastSent = new Map<string, number>();
let sentCount = 0;

function enabled(): boolean {
  if (import.meta.env?.VITE_TELEMETRY === "1") return true;
  return !!import.meta.env?.PROD;
}

/** Ruta din SPA fără query — „unde s-a întâmplat", nu „ce a căutat". */
function currentRoute(): string {
  const hash = window.location.hash.replace(/^#/, "");
  return (hash.split("?")[0] || "/").slice(0, 300);
}

export function reportClientError(input: ReportInput): void {
  try {
    const key = `${input.kind}|${input.message}`.slice(0, 200);
    const now = Date.now();
    const previous = lastSent.get(key);
    if (previous && now - previous < DEDUP_MS) return;
    if (sentCount >= MAX_PER_PAGE) return;
    lastSent.set(key, now);
    sentCount++;

    const payload = {
      kind: input.kind,
      message: String(input.message).slice(0, 2000),
      stack: input.stack ? String(input.stack).slice(0, 8000) : null,
      location: currentRoute(),
      url: window.location.href.slice(0, 1000),
      statusCode: input.statusCode ?? null,
      method: input.method ?? null,
    };

    if (!enabled()) {
      console.warn("[telemetry:dev]", payload.kind, payload.message, payload.location);
      return;
    }

    // `keepalive` ca raportul să plece și dacă eroarea e urmată de o navigare/închidere.
    void fetch("/api/telemetry/error", {
      method: "POST",
      credentials: "include",
      keepalive: true,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }).catch(() => {
      /* raportarea nu are voie să genereze erori */
    });
  } catch {
    /* idem */
  }
}

/**
 * Prinde ce scapă de ErrorBoundary: excepții globale și promisiuni respinse.
 * Se apelează o singură dată, din `main.tsx`.
 */
export function installGlobalErrorReporting(): void {
  window.addEventListener("error", (event) => {
    // Erorile de încărcare a resurselor (img/script) au `event.error` null și nu spun nimic util.
    if (!event.error && !event.message) return;
    reportClientError({
      kind: "client_unhandled",
      message: event.message || String(event.error),
      stack: event.error instanceof Error ? event.error.stack : null,
    });
  });

  window.addEventListener("unhandledrejection", (event) => {
    const reason = event.reason;
    reportClientError({
      kind: "client_unhandled",
      message: reason instanceof Error ? reason.message : String(reason ?? "unhandled rejection"),
      stack: reason instanceof Error ? reason.stack : null,
    });
  });
}
