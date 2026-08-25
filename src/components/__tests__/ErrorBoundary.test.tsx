/**
 * Regression for the 2026-08-25 report: a user (inginerita2000@gmail.com) hit
 * "Failed to fetch dynamically imported module: .../ParDetail-....js" right after a deploy and
 * had to notice + click "Reîncarcă" herself. A stale-chunk error (the tab was open before a new
 * deploy shipped new chunk hashes) should self-heal with one automatic reload instead of showing
 * the manual crash card — but a SECOND failure right after must NOT loop forever.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { ErrorBoundary } from "../ErrorBoundary";

vi.mock("@/lib/telemetry", () => ({ reportClientError: vi.fn() }));

function Boom({ message }: { message: string }): never {
  throw new Error(message);
}

describe("ErrorBoundary — stale chunk after deploy", () => {
  let reloadSpy: ReturnType<typeof vi.fn>;
  const originalLocation = window.location;

  beforeEach(() => {
    reloadSpy = vi.fn();
    // jsdom's window.location.reload isn't directly spy-able (non-configurable property) —
    // replace the whole location object for the duration of the test instead.
    Object.defineProperty(window, "location", {
      configurable: true,
      value: { ...originalLocation, reload: reloadSpy },
    });
    // ErrorBoundary logs via console.error on every catch — keep test output clean.
    vi.spyOn(console, "error").mockImplementation(() => {});
    sessionStorage.clear();
  });

  afterEach(() => {
    Object.defineProperty(window, "location", { configurable: true, value: originalLocation });
    vi.restoreAllMocks();
  });

  it("auto-reloads once on a Chrome-style stale-chunk error", () => {
    render(
      <ErrorBoundary>
        <Boom message="Failed to fetch dynamically imported module: https://www.finflow.best/assets/ParDetail-Cs4c13kY.js" />
      </ErrorBoundary>,
    );
    expect(reloadSpy).toHaveBeenCalledTimes(1);
  });

  it("auto-reloads on the Firefox and Safari phrasings too", () => {
    render(
      <ErrorBoundary>
        <Boom message="error loading dynamically imported module: https://x/y.js" />
      </ErrorBoundary>,
    );
    expect(reloadSpy).toHaveBeenCalledTimes(1);

    reloadSpy.mockClear();
    sessionStorage.clear();
    render(
      <ErrorBoundary>
        <Boom message="Importing a module script failed." />
      </ErrorBoundary>,
    );
    expect(reloadSpy).toHaveBeenCalledTimes(1);
  });

  it("does NOT auto-reload for an unrelated crash — shows the manual card instead", () => {
    render(
      <ErrorBoundary>
        <Boom message="Cannot read properties of undefined (reading 'foo')" />
      </ErrorBoundary>,
    );
    expect(reloadSpy).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toBeTruthy();
    expect(screen.getByText("Reîncarcă")).toBeTruthy();
  });

  it("does not loop: a second stale-chunk failure right after the first is NOT auto-reloaded", () => {
    const { unmount } = render(
      <ErrorBoundary>
        <Boom message="Failed to fetch dynamically imported module: https://x/a.js" />
      </ErrorBoundary>,
    );
    expect(reloadSpy).toHaveBeenCalledTimes(1);
    unmount();

    // Simulate the reload not having actually happened yet (jsdom doesn't navigate) — a second
    // boundary instance catching the SAME class of error immediately after must fall through to
    // the manual card, not reload again.
    render(
      <ErrorBoundary>
        <Boom message="Failed to fetch dynamically imported module: https://x/b.js" />
      </ErrorBoundary>,
    );
    expect(reloadSpy).toHaveBeenCalledTimes(1); // still just the first call
    expect(screen.getByText("Reîncarcă")).toBeTruthy();
  });

  it("resets when resetKey changes, clearing a previously-caught error", () => {
    const { rerender } = render(
      <ErrorBoundary resetKey="/business/par/1">
        <Boom message="Cannot read properties of undefined (reading 'foo')" />
      </ErrorBoundary>,
    );
    expect(screen.getByRole("alert")).toBeTruthy();

    rerender(
      <ErrorBoundary resetKey="/business/par/2">
        <div>fine now</div>
      </ErrorBoundary>,
    );
    expect(screen.getByText("fine now")).toBeTruthy();
  });

  it("„Spre panou” duce la un panou REAL, nu la pagina de marketing pentru nelogați", () => {
    // Regresie 2026-08-25: href-ul era "#/app/dashboard", o rută pe care App.tsx nu o mai are
    // după separarea CRM-ului; lanțul de redirect ateriza pe "/#/business" — landing-ul public
    // „Intră în cont". Adică exact în momentul recuperării dintr-o eroare, utilizatorul logat
    // vedea un ecran de neautentificat. Ruta corectă e panoul din /business/*.
    render(
      <ErrorBoundary>
        <Boom message="ceva a crăpat la randare" />
      </ErrorBoundary>,
    );
    const link = screen.getByRole("link", { name: /spre panou/i });
    expect(link.getAttribute("href")).toBe("#/business/dashboard");
    expect(link.getAttribute("href")).not.toBe("#/app/dashboard");
  });
});
