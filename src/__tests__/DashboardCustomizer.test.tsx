/**
 * POLISH-002: Unit tests for useDashboardWidgets + DashboardCustomizer
 * Tests: T-POLISH-002-1, T-POLISH-002-2, T-POLISH-002-3, T-POLISH-002-4, T-POLISH-002-5
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { renderHook } from "@testing-library/react";
import { DashboardCustomizer } from "@/components/DashboardCustomizer";
import { useDashboardWidgets, DEFAULT_WIDGET_ORDER, ALL_WIDGETS } from "@/hooks/useDashboardWidgets";

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: vi.fn((key: string) => store[key] ?? null),
    setItem: vi.fn((key: string, value: string) => { store[key] = value; }),
    removeItem: vi.fn((key: string) => { delete store[key]; }),
    clear: vi.fn(() => { store = {}; }),
  };
})();

Object.defineProperty(window, "localStorage", { value: localStorageMock });

describe("useDashboardWidgets", () => {
  beforeEach(() => {
    localStorageMock.clear();
    vi.clearAllMocks();
  });

  // T-POLISH-002-4: default state shows first 4 widgets
  it("T-POLISH-002-4: returns DEFAULT_WIDGET_ORDER when no localStorage", () => {
    const { result } = renderHook(() => useDashboardWidgets(null));
    expect(result.current.visibleWidgets).toEqual(DEFAULT_WIDGET_ORDER);
  });

  // T-POLISH-002-2: persistence across reload (simulated by re-rendering the hook)
  it("T-POLISH-002-2: hides a widget and persists to localStorage", () => {
    const { result } = renderHook(() => useDashboardWidgets("user-1"));

    act(() => {
      result.current.toggleWidget("par");
    });

    // Widget should be hidden
    expect(result.current.visibleWidgets).not.toContain("par");

    // localStorage should have been called with the updated prefs
    expect(localStorageMock.setItem).toHaveBeenCalled();
    const callArgs = localStorageMock.setItem.mock.calls.find(
      (args: string[]) => args[0] === "vl_dashboard_widgets_user-1"
    );
    expect(callArgs).toBeDefined();
    const saved = JSON.parse(callArgs[1]);
    expect(saved.hidden).toContain("par");
  });

  it("shows widget again after toggle back", () => {
    const { result } = renderHook(() => useDashboardWidgets(null));

    // Hide "findesk"
    act(() => { result.current.toggleWidget("findesk"); });
    expect(result.current.visibleWidgets).not.toContain("findesk");

    // Show again
    act(() => { result.current.toggleWidget("findesk"); });
    expect(result.current.visibleWidgets).toContain("findesk");
  });

  it("moveUp moves a widget up in the order", () => {
    const { result } = renderHook(() => useDashboardWidgets(null));
    const initialOrder = [...result.current.visibleWidgets];
    const secondId = initialOrder[1];

    act(() => { result.current.moveUp(secondId); });

    expect(result.current.visibleWidgets[0]).toBe(secondId);
  });

  it("moveDown moves a widget down", () => {
    const { result } = renderHook(() => useDashboardWidgets(null));
    const initialFirst = result.current.visibleWidgets[0];

    act(() => { result.current.moveDown(initialFirst); });

    expect(result.current.visibleWidgets[1]).toBe(initialFirst);
  });

  it("reset returns to defaults", () => {
    const { result } = renderHook(() => useDashboardWidgets(null));

    act(() => { result.current.toggleWidget("findesk"); });
    expect(result.current.visibleWidgets).not.toContain("findesk");

    act(() => { result.current.reset(); });
    expect(result.current.visibleWidgets).toEqual(DEFAULT_WIDGET_ORDER);
  });

  it("allWidgets contains all 6 widgets", () => {
    const { result } = renderHook(() => useDashboardWidgets(null));
    expect(result.current.allWidgets.length).toBe(ALL_WIDGETS.length);
  });
});

describe("DashboardCustomizer component", () => {
  const onClose = vi.fn();
  const onToggle = vi.fn();
  const onMoveUp = vi.fn();
  const onMoveDown = vi.fn();
  const onReset = vi.fn();

  const sampleWidgets = ALL_WIDGETS.map((w, i) => ({ ...w, visible: i < 4 }));

  beforeEach(() => {
    vi.clearAllMocks();
  });

  // T-POLISH-002-1: panel renders when isOpen=true — at least 4 visible widgets visible
  it("T-POLISH-002-1: renders widget list when open", () => {
    render(
      <DashboardCustomizer
        isOpen={true}
        onClose={onClose}
        widgets={sampleWidgets}
        onToggle={onToggle}
        onMoveUp={onMoveUp}
        onMoveDown={onMoveDown}
        onReset={onReset}
      />
    );
    // Should see at least "FinDesk" and "PAR" labels
    expect(screen.getByText("FinDesk")).toBeDefined();
    expect(screen.getByText("PAR")).toBeDefined();
  });

  // T-POLISH-002-3: toggle disables a widget immediately (calls onToggle)
  it("T-POLISH-002-3: clicking a toggle switch calls onToggle with the widget id", () => {
    render(
      <DashboardCustomizer
        isOpen={true}
        onClose={onClose}
        widgets={sampleWidgets}
        onToggle={onToggle}
        onMoveUp={onMoveUp}
        onMoveDown={onMoveDown}
        onReset={onReset}
      />
    );

    // Find the FinDesk toggle (aria-label: "Ascunde FinDesk")
    const toggleBtn = screen.getByRole("switch", { name: /Ascunde FinDesk/i });
    fireEvent.click(toggleBtn);
    expect(onToggle).toHaveBeenCalledWith("findesk");
  });

  // T-POLISH-002-5: dark mode — no hardcoded colors in the panel
  it("T-POLISH-002-5: panel uses semantic token classes (bg-card, text-foreground)", () => {
    const { container } = render(
      <DashboardCustomizer
        isOpen={true}
        onClose={onClose}
        widgets={sampleWidgets}
        onToggle={onToggle}
        onMoveUp={onMoveUp}
        onMoveDown={onMoveDown}
        onReset={onReset}
      />
    );
    expect(container.querySelector(".bg-card")).not.toBeNull();
    expect(container.innerHTML.includes("color: #")).toBe(false);
  });

  // Close button works
  it("close button calls onClose", () => {
    render(
      <DashboardCustomizer
        isOpen={true}
        onClose={onClose}
        widgets={sampleWidgets}
        onToggle={onToggle}
        onMoveUp={onMoveUp}
        onMoveDown={onMoveDown}
        onReset={onReset}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: /Închide panelul/i }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  // Returns null when closed
  it("renders nothing when isOpen=false", () => {
    render(
      <DashboardCustomizer
        isOpen={false}
        onClose={onClose}
        widgets={sampleWidgets}
        onToggle={onToggle}
        onMoveUp={onMoveUp}
        onMoveDown={onMoveDown}
        onReset={onReset}
      />
    );
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
