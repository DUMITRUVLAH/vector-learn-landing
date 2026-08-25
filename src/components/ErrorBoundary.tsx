import { Component, type ErrorInfo, type ReactNode } from "react";
import { reportClientError } from "@/lib/telemetry";

interface Props {
  children: ReactNode;
  /** When this value changes, the boundary resets (e.g. pass the current route path). */
  resetKey?: string;
}

interface State {
  error: Error | null;
}

/** Cross-browser phrasing for a lazy-loaded chunk that 404s — the stale-tab-after-deploy case:
 * the already-loaded bundle still references a hashed chunk filename that a NEW deploy replaced.
 * Chrome/Edge: "Failed to fetch dynamically imported module: <url>".
 * Firefox: "error loading dynamically imported module: <url>".
 * Safari: "Importing a module script failed." */
const STALE_CHUNK_RE = /fetch dynamically imported module|loading dynamically imported module|importing a module script failed/i;

/** One auto-reload per stale-chunk incident, not a loop: if the reload didn't actually fix it
 * (a real outage, not just a stale tab), a SECOND failure within this window falls through to
 * the manual "Reîncarcă" card instead of reloading forever. */
const STALE_CHUNK_RELOAD_KEY = "vl-stale-chunk-reload-at";
const STALE_CHUNK_RELOAD_COOLDOWN_MS = 15_000;

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
    console.error("[ErrorBoundary]", error, info.componentStack);
    // PLATFORM-002: pagina tocmai a murit pentru un client real. Până acum se oprea în
    // consola LUI de browser, unde nu se uită nimeni; acum ajunge în Consola Platformă.
    reportClientError({
      kind: "client_crash",
      message: error.message || String(error),
      stack: `${error.stack ?? ""}\n--- componentStack ---${info.componentStack ?? ""}`,
    });

    // Every deploy mints new chunk hashes; a tab that was open (or a service-worker-cached
    // index.html) before the deploy still points at the OLD filenames, so its NEXT lazy-loaded
    // route 404s. That's not a real bug the user needs to see — a full reload fetches the fresh
    // index.html and fixes it transparently. Bug 2026-08-25: inginerita2000@gmail.com hit exactly
    // this on /business/par/... right after a deploy and had to notice + click "Reîncarcă" herself.
    if (STALE_CHUNK_RE.test(error.message)) {
      let lastAttempt = 0;
      try {
        lastAttempt = Number(sessionStorage.getItem(STALE_CHUNK_RELOAD_KEY) ?? 0);
      } catch {
        // sessionStorage unavailable (private mode / blocked) — fall through to the manual card.
      }
      if (Date.now() - lastAttempt > STALE_CHUNK_RELOAD_COOLDOWN_MS) {
        try {
          sessionStorage.setItem(STALE_CHUNK_RELOAD_KEY, String(Date.now()));
        } catch {
          /* best-effort guard; a failed write just means no auto-reload this time */
        }
        window.location.reload();
      }
    }
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
                href="#/app/dashboard"
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
