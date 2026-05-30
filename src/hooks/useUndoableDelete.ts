/**
 * CRM-131 — useUndoableDelete
 *
 * Generic hook that defers an item deletion by `delayMs`.
 * The caller gets an `undoDelete` function that cancels the pending deletion
 * when invoked before the timer fires.
 *
 * Usage:
 *   const { scheduleDelete, undoDelete, pendingId } = useUndoableDelete({
 *     delayMs: 5000,
 *     onDelete: (id) => deleteTask(leadId, id),
 *   });
 *
 * After calling `scheduleDelete(id)`:
 *   - The caller should optimistically remove the item from UI.
 *   - After `delayMs` ms, `onDelete(id)` is called.
 *   - If `undoDelete()` is called before `delayMs`, `onDelete` is NOT called
 *     and the item should be restored.
 */

import { useRef, useCallback } from "react";

interface UseUndoableDeleteOptions<T> {
  /** Milliseconds to wait before committing the delete. Default: 5000 */
  delayMs?: number;
  /** Called with the item id once the delay expires (unless cancelled). */
  onDelete: (id: T) => Promise<void> | void;
  /** Optional callback when the delete is cancelled (undo). */
  onUndo?: (id: T) => void;
  /** Optional error handler if onDelete rejects. */
  onError?: (err: unknown) => void;
}

interface UseUndoableDeleteReturn<T> {
  /** Schedule deletion of `id` after `delayMs`. Returns true if scheduled. */
  scheduleDelete: (id: T) => void;
  /**
   * Cancel the pending deletion.
   * Returns the stored id if there was a pending deletion, null otherwise.
   */
  undoDelete: () => T | null;
  /** The id of the currently pending deletion, or null if none. */
  pendingId: React.MutableRefObject<T | null>;
}

export function useUndoableDelete<T>({
  delayMs = 5000,
  onDelete,
  onUndo,
  onError,
}: UseUndoableDeleteOptions<T>): UseUndoableDeleteReturn<T> {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingId = useRef<T | null>(null);

  const scheduleDelete = useCallback(
    (id: T) => {
      // Clear any existing pending delete
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }

      pendingId.current = id;

      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        pendingId.current = null;
        void Promise.resolve(onDelete(id)).catch((err: unknown) => {
          onError?.(err);
        });
      }, delayMs);
    },
    [delayMs, onDelete, onError]
  );

  const undoDelete = useCallback((): T | null => {
    if (timerRef.current === null || pendingId.current === null) return null;

    clearTimeout(timerRef.current);
    timerRef.current = null;
    const id = pendingId.current;
    pendingId.current = null;

    onUndo?.(id);
    return id;
  }, [onUndo]);

  return { scheduleDelete, undoDelete, pendingId };
}
