/**
 * POLISH-002: useDashboardWidgets — manages dashboard widget preferences.
 * Persists to localStorage under key `vl_dashboard_widgets_<userId>`.
 */
import { useState, useEffect, useCallback } from "react";

export type WidgetId =
  | "revenue"
  | "active-students"
  | "lessons-today"
  | "crm-overdue"
  | "new-leads"
  | "debt-summary";

export interface WidgetConfig {
  id: WidgetId;
  label: string;
  visible: boolean;
}

const DEFAULT_WIDGETS: WidgetConfig[] = [
  { id: "revenue", label: "Revenue luna curentă", visible: true },
  { id: "active-students", label: "Elevi activi", visible: true },
  { id: "lessons-today", label: "Lecții azi", visible: true },
  { id: "crm-overdue", label: "Taskuri CRM restante", visible: true },
  { id: "new-leads", label: "Leaduri noi (7 zile)", visible: false },
  { id: "debt-summary", label: "Plăți restante", visible: false },
];

function getStorageKey(userId: string): string {
  return `vl_dashboard_widgets_${userId}`;
}

function loadFromStorage(userId: string): WidgetConfig[] {
  try {
    const raw = localStorage.getItem(getStorageKey(userId));
    if (!raw) return DEFAULT_WIDGETS;
    const parsed = JSON.parse(raw) as Partial<WidgetConfig>[];
    // Merge saved preferences with defaults (new widgets get default visibility)
    return DEFAULT_WIDGETS.map((def) => {
      const saved = parsed.find((w) => w.id === def.id);
      return saved ? { ...def, visible: saved.visible ?? def.visible } : def;
    });
  } catch {
    return DEFAULT_WIDGETS;
  }
}

function saveToStorage(userId: string, widgets: WidgetConfig[]): void {
  try {
    localStorage.setItem(
      getStorageKey(userId),
      JSON.stringify(widgets.map(({ id, visible }) => ({ id, visible })))
    );
  } catch {
    // ignore storage errors (private browsing, quota)
  }
}

interface UseDashboardWidgetsReturn {
  widgets: WidgetConfig[];
  visibleWidgets: WidgetConfig[];
  toggleWidget: (id: WidgetId) => void;
  moveUp: (id: WidgetId) => void;
  moveDown: (id: WidgetId) => void;
  reset: () => void;
}

export function useDashboardWidgets(userId: string): UseDashboardWidgetsReturn {
  const [widgets, setWidgets] = useState<WidgetConfig[]>(() =>
    loadFromStorage(userId)
  );

  // Reload if userId changes (e.g. login as different user)
  useEffect(() => {
    setWidgets(loadFromStorage(userId));
  }, [userId]);

  // Persist on every change
  useEffect(() => {
    saveToStorage(userId, widgets);
  }, [userId, widgets]);

  const toggleWidget = useCallback((id: WidgetId) => {
    setWidgets((prev) =>
      prev.map((w) => (w.id === id ? { ...w, visible: !w.visible } : w))
    );
  }, []);

  const moveUp = useCallback((id: WidgetId) => {
    setWidgets((prev) => {
      const idx = prev.findIndex((w) => w.id === id);
      if (idx <= 0) return prev;
      const next = [...prev];
      [next[idx - 1], next[idx]] = [next[idx], next[idx - 1]];
      return next;
    });
  }, []);

  const moveDown = useCallback((id: WidgetId) => {
    setWidgets((prev) => {
      const idx = prev.findIndex((w) => w.id === id);
      if (idx < 0 || idx >= prev.length - 1) return prev;
      const next = [...prev];
      [next[idx], next[idx + 1]] = [next[idx + 1], next[idx]];
      return next;
    });
  }, []);

  const reset = useCallback(() => {
    setWidgets(DEFAULT_WIDGETS);
  }, []);

  return {
    widgets,
    visibleWidgets: widgets.filter((w) => w.visible),
    toggleWidget,
    moveUp,
    moveDown,
    reset,
  };
}
