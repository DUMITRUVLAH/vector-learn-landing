/**
 * CRM-130: Keyboard shortcuts for the CRM kanban board.
 *
 * Active shortcuts:
 *   /         → focus search input
 *   n         → open "New lead" modal
 *   Escape    → close modal / clear selection (handled in component)
 *   j         → move to next visible card
 *   k         → move to previous visible card
 *   Enter     → navigate to selected card's detail page
 *
 * All shortcuts are disabled when focus is on an interactive element
 * (input, textarea, select, [contenteditable]) to avoid interfering with typing.
 */
import { useEffect, useCallback, RefObject } from "react";

export interface UseKanbanKeyboardOptions {
  /** Called when user presses "/" (focus search) */
  onSearch: () => void;
  /** Called when user presses "n" (new lead) */
  onNewLead: () => void;
  /** Whether any modal is currently open (disables j/k/n when true) */
  modalOpen?: boolean;
  /** Ref to the search input (for focus) */
  searchRef?: RefObject<HTMLInputElement | null>;
}

/**
 * Returns true if the currently focused element is an interactive text element.
 * Shortcuts should be suppressed in this case.
 */
function isFocusedOnInput(): boolean {
  const el = document.activeElement;
  if (!el) return false;
  const tag = el.tagName.toLowerCase();
  if (tag === "input" || tag === "textarea" || tag === "select") return true;
  if ((el as HTMLElement).isContentEditable) return true;
  return false;
}

export function useKanbanKeyboard({
  onSearch,
  onNewLead,
  modalOpen = false,
  searchRef,
}: UseKanbanKeyboardOptions): void {
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      // Never intercept modifier keys
      if (e.ctrlKey || e.metaKey || e.altKey) return;

      // When a modal is open, don't handle shortcuts (except Escape, which the
      // modal itself handles via its own listener)
      if (modalOpen && e.key !== "Escape") return;

      switch (e.key) {
        case "/": {
          // Focus search — only when NOT already in an input
          if (!isFocusedOnInput()) {
            e.preventDefault();
            if (searchRef?.current) {
              searchRef.current.focus();
              searchRef.current.select();
            } else {
              onSearch();
            }
          }
          break;
        }
        case "n": {
          if (!isFocusedOnInput()) {
            e.preventDefault();
            onNewLead();
          }
          break;
        }
        // j/k and Enter are handled separately (card focus management)
        default:
          break;
      }
    },
    [onSearch, onNewLead, modalOpen, searchRef]
  );

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);
}
