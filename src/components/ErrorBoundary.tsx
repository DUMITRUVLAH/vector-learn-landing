import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
  /** When this value changes, the boundary resets (e.g. pass the current route path). */
  resetKey?: string;
}

interface State {
  error: Error | null;
}

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
    // Surface in the console for debugging; a real telemetry sink can hook in here later.
    console.error("[ErrorBoundary]", error, info.componentStack);
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
