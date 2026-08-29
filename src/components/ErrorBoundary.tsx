import { Component, type ErrorInfo, type ReactNode } from "react";
import { reportClientError } from "@/lib/telemetry";
import { isStaleChunkError, recoverFromStaleChunk } from "@/lib/staleChunk";

interface Props {
  children: ReactNode;
  /** When this value changes, the boundary resets (e.g. pass the current route path). */
  resetKey?: string;
}

interface State {
  error: Error | null;
}

/* Detecția și recuperarea „chunk vechi după deploy" trăiesc în `@/lib/staleChunk`: sunt folosite
 * și de factory-ul `lazy()` (src/lib/lazyWithTimeout.ts), care prinde cazul MAI DEVREME — înainte
 * ca eroarea să urce aici ca un crash de randare. Boundary-ul rămâne plasa pentru chunk-urile
 * importate în afara acelui helper. */

/**
 * Where "Spre panou" actually goes.
 *
 * It used to be a hardcoded "#/app/dashboard" — a route App.tsx no longer has since the CRM
 * split, so it fell through the redirect chain onto "/#/business", the LOGGED-OUT marketing page
 * ("Intră în cont"). A logged-in user recovering from an error was shown a signup screen.
 *
 * This became reachable in practice on 2026-08-25: the stale-chunk auto-reload above deliberately
 * falls through to this card on a SECOND failure inside the cooldown, so it is the screen a
 * business user actually hits after a failed recovery — exactly the wrong moment to look logged
 * out. Every signed-in page in this app lives under /business/*, so that is the panel.
 * `scripts/check-nav-links.mjs` keeps this honest against App.tsx's route table.
 */
const PANEL_HREF = "#/business/dashboard";

/**
 * Catches render-time errors in the subtree so one broken page shows a recoverable error card
 * instead of white-screening the whole SPA (IMPROVEMENTS #8 / code-quality #1). Resets when
 * `resetKey` changes so navigating to another route clears a crashed page.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // Fiecare deploy mintește hash-uri noi de chunk; o filă deschisă dinainte (sau un cache de
    // service worker) încă indică numele vechi, deci următoarea rută încărcată leneș pică. Nu e
    // un bug pe care utilizatorul trebuie să-l vadă — un reload cu cache-ul golit îl repară
    // transparent (detalii despre cache-ul otrăvit: src/lib/staleChunk.ts).
    if (isStaleChunkError(error.message) && recoverFromStaleChunk()) {
      // Recuperare pornită: pagina se reîncarcă imediat. NU raportăm — altfel owner-ul primea un
      // email „tip NOU de eroare" la fiecare hash nou de chunk, pentru o situație care se repară
      // singură. Dacă recuperarea NU reușește, a doua trecere cade pe ramura de mai jos și ATUNCI
      // pleacă raportul: acolo chiar e ceva stricat.
      console.warn("[ErrorBoundary] chunk vechi după deploy — reîncarc cu cache-ul golit");
      return;
    }

    console.error("[ErrorBoundary]", error, info.componentStack);
    // PLATFORM-002: pagina tocmai a murit pentru un client real. Până acum se oprea în
    // consola LUI de browser, unde nu se uită nimeni; acum ajunge în Consola Platformă.
    reportClientError({
      kind: "client_crash",
      message: error.message || String(error),
      stack: `${error.stack ?? ""}\n--- componentStack ---${info.componentStack ?? ""}`,
    });
  }

  componentDidUpdate(prev: Props): void {
    if (prev.resetKey !== this.props.resetKey && this.state.error) {
      this.setState({ error: null });
    }
  }

  render(): ReactNode {
    if (this.state.error) {
      return (
        <div
          role="alert"
          className="flex min-h-[60vh] flex-col items-center justify-center gap-4 px-6 text-center"
        >
          <div className="max-w-md space-y-3">
            <h1 className="text-xl font-semibold text-foreground">A apărut o eroare</h1>
            <p className="text-sm text-muted-foreground">
              Pagina nu a putut fi afișată. Reîncarcă sau revino la panou.
            </p>
            <div className="flex items-center justify-center gap-3 pt-2">
              <button
                type="button"
                onClick={() => window.location.reload()}
                className="touch-target rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
              >
                Reîncarcă
              </button>
              <a
                href={PANEL_HREF}
                className="touch-target rounded-md border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-muted"
              >
                Spre panou
              </a>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
