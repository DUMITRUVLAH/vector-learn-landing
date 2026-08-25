import { lazy, type ComponentType, type LazyExoticComponent } from "react";

/** Long enough that a slow connection still finishes a normal chunk load; short enough that a
 * genuinely stuck request doesn't leave the user staring at a spinner for minutes. */
const LAZY_IMPORT_TIMEOUT_MS = 20_000;

/**
 * Rejects with `message` after `ms` if `promise` hasn't settled by then — otherwise passes
 * `promise`'s own resolution/rejection through untouched. Exported separately from
 * lazyWithTimeout() so the timeout behavior itself is testable with fake timers, independent of
 * React's Suspense/lazy internals.
 */
export function raceWithTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_resolve, reject) => {
      setTimeout(() => reject(new Error(message)), ms);
    }),
  ]);
}

/**
 * `React.lazy()` that can't hang forever.
 *
 * A stale-chunk dynamic import (the tab was open before a deploy shipped new chunk hashes)
 * usually rejects fast — "Failed to fetch dynamically imported module" — which ErrorBoundary
 * already catches and auto-recovers from with one reload. But some network/CDN conditions leave
 * the underlying fetch neither resolving nor rejecting: the Suspense boundary then shows its
 * fallback forever, which looks exactly like the app freezing (2026-08-25 report: PAR settings
 * hung after a deploy). Racing the import against a timeout turns that hang into the SAME
 * recoverable rejection ErrorBoundary already handles.
 */
// Mirrors React's own lazy<T extends ComponentType<any>>() signature — components with typed
// props (e.g. ParAdmin's {isAdmin}) aren't assignable to ComponentType<unknown> due to prop
// contravariance, so `any` here matches React's own .d.ts rather than being a shortcut.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function lazyWithTimeout<T extends ComponentType<any>>(
  factory: () => Promise<{ default: T }>,
): LazyExoticComponent<T> {
  return lazy(() =>
    raceWithTimeout(
      factory(),
      LAZY_IMPORT_TIMEOUT_MS,
      "Failed to fetch dynamically imported module: timed out",
    ),
  );
}
