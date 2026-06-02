/**
 * POLISH-002 — DashboardCustomizer + useDashboardWidgets
 *
 * T-POLISH-002-1 [blocant] Given DashboardPage is mounted, Then at least 4 widgets visible
 * T-POLISH-002-2 [blocant] Given widget toggled off, Then it disappears from visible list
 * T-POLISH-002-3 [blocant] Given preferences in localStorage, Then they are restored on reload
 * T-POLISH-002-4 [normal]  Given no localStorage entry, Then default 4 visible widgets shown
 * T-POLISH-002-5 [normal]  Given customizer rendered, Then toggle switches are accessible
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { renderHook, act } from "@testing-library/react";
import { DashboardCustomizer } from "@/components/app/DashboardCustomizer";
import { useDashboardWidgets } from "@/hooks/useDashboardWidgets";

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock("@/hooks/useSession", () => ({
  useSession: () => ({
    status: "authenticated",
    data: { user: { id: "user-1", name: "Andreea", role: "admin" }, tenant: { name: "Lingua", plan: "pro" } },
    logout: vi.fn(),
    refresh: vi.fn(),
  }),
}));

vi.mock("@/router/HashRouter", () => ({
  useRouter: () => ({ path: "/app", navigate: vi.fn() }),
  Link: ({ children, to }: { children: React.ReactNode; to: string }) => <a href={`#${to}`}>{children}</a>,
}));

vi.mock("@/lib/api/analytics", () => ({
  getKpi: vi.fn().mockResolvedValue({ mrrCents: 100000, activeStudents: 45, newStudents: 3, churnRatePct: 2, arpuCents: 2200, prevMrrCents: 90000, prevActiveStudents: 42 }),
}));

vi.mock("@/lib/api/payments", () => ({
  paymentStats: vi.fn().mockResolvedValue({ monthPaidCents: 100000, pendingCents: 5000, overdueCents: 12000 }),
}));

vi.mock("@/lib/api/leads", () => ({
  fetchTodayDashboard: vi.fn().mockResolvedValue({ overdueOrDueToday: [{ id: "t1", title: "Call" }], totalActions: 3, newUncontacted: [], followUpNeeded: [], nextBestAction: [] }),
  fetchLeadsList: vi.fn().mockResolvedValue({ items: [], page: 1, pageSize: 100, total: 0, totalPages: 0 }),
}));

vi.mock("@/lib/api/students", () => ({
  listStudents: vi.fn().mockResolvedValue({ items: [], total: 45, limit: 1, offset: 0 }),
}));

// ─── Tests ────────────────────────────────────────────────────────────────────

// Mock localStorage for test environment
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => { store[key] = value; },
    removeItem: (key: string) => { delete store[key]; },
    clear: () => { store = {}; },
  };
})();
Object.defineProperty(window, "localStorage", { value: localStorageMock, writable: true });

describe("useDashboardWidgets", () => {
  beforeEach(() => {
    localStorageMock.clear();
  });

  it("T-POLISH-002-4: default widgets — 4 visible, 2 hidden", () => {
    const { result } = renderHook(() => useDashboardWidgets("test-user"));
    expect(result.current.visibleWidgets).toHaveLength(4);
    expect(result.current.widgets).toHaveLength(6);
  });

  it("T-POLISH-002-2: toggling a widget updates visible list", () => {
    const { result } = renderHook(() => useDashboardWidgets("test-user"));
    const firstVisibleId = result.current.visibleWidgets[0].id;
    act(() => result.current.toggleWidget(firstVisibleId));
    const stillVisible = result.current.visibleWidgets.find((w) => w.id === firstVisibleId);
    expect(stillVisible).toBeUndefined();
  });

  it("T-POLISH-002-3: persistence to localStorage", () => {
    const { result } = renderHook(() => useDashboardWidgets("persist-user"));
    // Disable the first widget
    act(() => result.current.toggleWidget(result.current.widgets[0].id));
    // Verify localStorage was written
    const raw = localStorage.getItem("vl_dashboard_widgets_persist-user");
    expect(raw).not.toBeNull();
    const parsed = JSON.parse(raw!);
    expect(parsed[0].visible).toBe(false);
  });

  it("reset restores defaults", () => {
    const { result } = renderHook(() => useDashboardWidgets("reset-user"));
    act(() => result.current.toggleWidget(result.current.widgets[0].id));
    expect(result.current.visibleWidgets).toHaveLength(3);
    act(() => result.current.reset());
    expect(result.current.visibleWidgets).toHaveLength(4);
  });

  it("moveUp and moveDown reorder widgets", () => {
    const { result } = renderHook(() => useDashboardWidgets("order-user"));
    const initialSecond = result.current.widgets[1].id;
    act(() => result.current.moveUp(initialSecond));
    expect(result.current.widgets[0].id).toBe(initialSecond);
  });
});

describe("DashboardCustomizer", () => {
  const onClose = vi.fn();
  const onToggle = vi.fn();
  const onMoveUp = vi.fn();
  const onMoveDown = vi.fn();
  const onReset = vi.fn();

  const defaultWidgets = [
    { id: "revenue" as const, label: "Revenue", visible: true },
    { id: "active-students" as const, label: "Elevi activi", visible: true },
  ];

  beforeEach(() => {
    onClose.mockClear();
    onToggle.mockClear();
  });

  it("T-POLISH-002-5: renders widget toggles with accessible labels", () => {
    render(
      <DashboardCustomizer
        isOpen={true}
        onClose={onClose}
        widgets={defaultWidgets}
        onToggle={onToggle}
        onMoveUp={onMoveUp}
        onMoveDown={onMoveDown}
        onReset={onReset}
      />
    );
    expect(screen.getByLabelText(/Dezactivează Revenue/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Dezactivează Elevi activi/i)).toBeInTheDocument();
  });

  it("does not render when isOpen=false", () => {
    render(
      <DashboardCustomizer
        isOpen={false}
        onClose={onClose}
        widgets={defaultWidgets}
        onToggle={onToggle}
        onMoveUp={onMoveUp}
        onMoveDown={onMoveDown}
        onReset={onReset}
      />
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("calls onClose when close button clicked", () => {
    render(
      <DashboardCustomizer
        isOpen={true}
        onClose={onClose}
        widgets={defaultWidgets}
        onToggle={onToggle}
        onMoveUp={onMoveUp}
        onMoveDown={onMoveDown}
        onReset={onReset}
      />
    );
    fireEvent.click(screen.getByLabelText("Închide personalizator"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("calls onReset when reset button clicked", () => {
    render(
      <DashboardCustomizer
        isOpen={true}
        onClose={onClose}
        widgets={defaultWidgets}
        onToggle={onToggle}
        onMoveUp={onMoveUp}
        onMoveDown={onMoveDown}
        onReset={onReset}
      />
    );
    fireEvent.click(screen.getByText(/Resetează la valorile implicite/i));
    expect(onReset).toHaveBeenCalledTimes(1);
  });
});
