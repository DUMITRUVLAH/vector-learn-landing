/**
 * Sidebar badge refresh bus.
 *
 * The "Inbox aprobare 4" pill in BusinessShell polls every 60s. That is fine while
 * you are reading, and wrong the moment you *act*: approve a request and the list
 * drops to 3 while the sidebar still claims 4 for up to a minute. The shell and the
 * page are siblings, so the page cannot hand the new count down — it publishes an
 * event instead, and whoever renders a badge re-reads its own source of truth.
 *
 * Deliberately a plain module-level set (no context/provider): the shell mounts once,
 * pages come and go, and a decision on ANY page (inbox, finance queue, PAR detail)
 * must be able to nudge it without threading props through the tree.
 */

type Listener = () => void;

const listeners = new Set<Listener>();

/** Subscribe a badge holder. Returns the unsubscribe function. */
export function onParBadgeRefresh(fn: Listener): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

/**
 * Ask every subscribed badge to refresh now.
 * Call this after any action that changes what is pending for the current user:
 * approve, reject, request-changes, bulk approve, mark-paid.
 */
export function requestParBadgeRefresh(): void {
  for (const fn of [...listeners]) fn();
}
