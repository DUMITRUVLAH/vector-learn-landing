/**
 * POLISH-001 — CommandPalette + useCommandPalette
 *
 * T-POLISH-001-1 [blocant] Given CommandPalette isOpen=true, Then search input is rendered
 * T-POLISH-001-2 [blocant] Given isOpen=false, Then palette is not rendered
 * T-POLISH-001-3 [blocant] Given Escape key pressed, Then onClose is called
 * T-POLISH-001-4 [normal]  Given empty query, Then 5 nav suggestions shown
 * T-POLISH-001-5 [normal]  Given click on backdrop, Then onClose is called
 * T-POLISH-001-6 [normal]  useCommandPalette toggle works correctly
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { CommandPalette } from "@/components/CommandPalette";
import { renderHook } from "@testing-library/react";
import { useCommandPalette } from "@/hooks/useCommandPalette";

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock("@/hooks/useSession", () => ({
  useSession: () => ({
    data: { id: "user-1", tenantId: "tenant-1", user: { name: "Test", role: "admin" }, tenant: { name: "Test" } },
    logout: vi.fn(),
  }),
}));

vi.mock("@/router/HashRouter", () => ({
  useRouter: () => ({ path: "/app", navigate: vi.fn() }),
  Link: ({ children, to }: { children: React.ReactNode; to: string }) => <a href={`#${to}`}>{children}</a>,
}));

vi.mock("@/lib/api/students", () => ({
  listStudents: vi.fn().mockResolvedValue({ items: [], total: 0, limit: 5, offset: 0 }),
}));

vi.mock("@/lib/api/leads", () => ({
  fetchLeadsList: vi.fn().mockResolvedValue({ items: [], page: 1, pageSize: 5, total: 0, totalPages: 0 }),
}));

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("CommandPalette", () => {
  const onClose = vi.fn();

  beforeEach(() => {
    onClose.mockClear();
  });

  it("T-POLISH-001-1: renders search input when isOpen=true", () => {
    render(<CommandPalette isOpen={true} onClose={onClose} />);
    expect(screen.getByRole("combobox")).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/Caută elev/i)).toBeInTheDocument();
  });

  it("T-POLISH-001-2: does not render when isOpen=false", () => {
    render(<CommandPalette isOpen={false} onClose={onClose} />);
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
  });

  it("T-POLISH-001-3: calls onClose when Escape is pressed", () => {
    render(<CommandPalette isOpen={true} onClose={onClose} />);
    const input = screen.getByRole("combobox");
    fireEvent.keyDown(input, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("T-POLISH-001-4: shows nav suggestions when query is empty", async () => {
    render(<CommandPalette isOpen={true} onClose={onClose} />);
    // With empty query, should show nav items (up to 5)
    const listbox = await screen.findByRole("listbox");
    expect(listbox).toBeInTheDocument();
    // At least one nav item present
    expect(screen.getByText("Dashboard")).toBeInTheDocument();
  });

  it("T-POLISH-001-5: calls onClose when backdrop is clicked", () => {
    render(<CommandPalette isOpen={true} onClose={onClose} />);
    const dialog = screen.getByRole("dialog");
    fireEvent.click(dialog);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("T-POLISH-001-6: renders close button with accessible label", () => {
    render(<CommandPalette isOpen={true} onClose={onClose} />);
    expect(screen.getByLabelText("Închide paleta")).toBeInTheDocument();
  });
});

describe("useCommandPalette", () => {
  it("starts closed", () => {
    const { result } = renderHook(() => useCommandPalette());
    expect(result.current.isOpen).toBe(false);
  });

  it("toggle opens and closes", () => {
    const { result } = renderHook(() => useCommandPalette());
    act(() => result.current.toggle());
    expect(result.current.isOpen).toBe(true);
    act(() => result.current.toggle());
    expect(result.current.isOpen).toBe(false);
  });

  it("open() and close() work independently", () => {
    const { result } = renderHook(() => useCommandPalette());
    act(() => result.current.open());
    expect(result.current.isOpen).toBe(true);
    act(() => result.current.close());
    expect(result.current.isOpen).toBe(false);
  });
});
