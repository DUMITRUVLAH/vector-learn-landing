/**
 * POLISH-002: Dashboard widget preferences — order and visibility stored in localStorage.
 * Key: `vl_dashboard_widgets_<userId>` (or `vl_dashboard_widgets_anon` when userId unknown).
 *
 * Widget IDs (stable, never changes):
 *   "findesk"   — FinDesk KPIs (expenses/invoices/net)
 *   "par"       — PAR pending approvals
 *   "itpark"    — ITPark active residents
 *   "invoices"  — Invoice count this month
 *   "payroll"   — Active employees count
 *   "budget"    — Budget status summary
 */
import { useState, useCallback, useEffect } from "react";

export type WidgetId =
  | "findesk"
  | "par"
  | "itpark"
  | "invoices"
  | "payroll"
  | "budget";

export interface WidgetConfig {
  id: WidgetId;
  label: string;
  description: string;
}

export const ALL_WIDGETS: WidgetConfig[] = [
  { id: "findesk",  label: "FinDesk",       description: "Cheltuieli, facturi și sold net" },
  { id: "par",      label: "PAR",           description: "Cereri de plată pending" },
  { id: "itpark",   label: "ITPark",        description: "Rezidenți activi IT Park" },
  { id: "invoices", label: "Facturi luna",  description: "Facturi emise în luna curentă" },
  { id: "payroll",  label: "Angajați activi", description: "Nr. angajați activi în statul de plată" },
  { id: "budget",   label: "Buget",         description: "Status buget planificat vs realizat" },
];

/** Default visible set — first 4 in order. */
export const DEFAULT_WIDGET_ORDER: WidgetId[] = ["findesk", "par", "itpark", "invoices"];

interface WidgetPreferences {
  order: WidgetId[];
  hidden: WidgetId[];
}

const DEFAULT_PREFS: WidgetPreferences = {
  order: DEFAULT_WIDGET_ORDER,
  hidden: ["payroll", "budget"],
};

function storageKey(userId: string | null) {
  return `vl_dashboard_widgets_${userId ?? "anon"}`;
}

function readPrefs(userId: string | null): WidgetPreferences {
  try {
    const raw = localStorage.getItem(storageKey(userId));
    if (!raw) return DEFAULT_PREFS;
    const parsed = JSON.parse(raw) as WidgetPreferences;
    // Validate shape
    if (!Array.isArray(parsed.order) || !Array.isArray(parsed.hidden)) return DEFAULT_PREFS;
    return parsed;
  } catch {
    return DEFAULT_PREFS;
  }
}

function writePrefs(userId: string | null, prefs: WidgetPreferences) {
  try {
    localStorage.setItem(storageKey(userId), JSON.stringify(prefs));
  } catch {
    // localStorage unavailable — silently ignore
  }
}

export interface UseDashboardWidgetsReturn {
  /** Visible widgets in display order */
  visibleWidgets: WidgetId[];
  /** All widgets with visibility state */
  allWidgets: Array<WidgetConfig & { visible: boolean }>;
  toggleWidget: (id: WidgetId) => void;
  moveUp: (id: WidgetId) => void;
  moveDown: (id: WidgetId) => void;
  reset: () => void;
}

export function useDashboardWidgets(userId: string | null): UseDashboardWidgetsReturn {
  const [prefs, setPrefs] = useState<WidgetPreferences>(() => readPrefs(userId));

  // Re-read from storage when userId changes (e.g. auth loads)
  useEffect(() => {
    setPrefs(readPrefs(userId));
  }, [userId]);

  const save = useCallback((next: WidgetPreferences) => {
    setPrefs(next);
    writePrefs(userId, next);
  }, [userId]);

  const toggleWidget = useCallback((id: WidgetId) => {
    setPrefs((prev) => {
      const isHidden = prev.hidden.includes(id);
      let nextOrder = prev.order;
      let nextHidden = prev.hidden;
      if (isHidden) {
        // Show: add to end of order, remove from hidden
        nextOrder = [...prev.order.filter((w) => w !== id), id];
        nextHidden = prev.hidden.filter((w) => w !== id);
      } else {
        // Hide: remove from order, add to hidden
        nextOrder = prev.order.filter((w) => w !== id);
        nextHidden = [...prev.hidden, id];
      }
      const next = { order: nextOrder, hidden: nextHidden };
      writePrefs(userId, next);
      return next;
    });
  }, [userId]);

  const moveUp = useCallback((id: WidgetId) => {
    setPrefs((prev) => {
      const idx = prev.order.indexOf(id);
      if (idx <= 0) return prev;
      const next = [...prev.order];
      [next[idx - 1], next[idx]] = [next[idx], next[idx - 1]];
      const updated = { ...prev, order: next };
      writePrefs(userId, updated);
      return updated;
    });
  }, [userId]);

  const moveDown = useCallback((id: WidgetId) => {
    setPrefs((prev) => {
      const idx = prev.order.indexOf(id);
      if (idx < 0 || idx >= prev.order.length - 1) return prev;
      const next = [...prev.order];
      [next[idx], next[idx + 1]] = [next[idx + 1], next[idx]];
      const updated = { ...prev, order: next };
      writePrefs(userId, updated);
      return updated;
    });
  }, [userId]);

  const reset = useCallback(() => {
    save(DEFAULT_PREFS);
  }, [save]);

  const visibleWidgets = prefs.order.filter((id) => !prefs.hidden.includes(id));

  const allWidgets = ALL_WIDGETS.map((w) => ({
    ...w,
    visible: !prefs.hidden.includes(w.id),
  }));

  return { visibleWidgets, allWidgets, toggleWidget, moveUp, moveDown, reset };
}
