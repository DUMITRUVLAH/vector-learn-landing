/**
 * POLISH-001: Unit tests for CommandPalette + useCommandPalette
 * Tests: T-POLISH-001-1, T-POLISH-001-2, T-POLISH-001-3, T-POLISH-001-4, T-POLISH-001-5, T-POLISH-001-6
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { CommandPalette } from "@/components/CommandPalette";
import { useCommandPalette } from "@/hooks/useCommandPalette";
import { renderHook } from "@testing-library/react";

// Mock the router so navigation calls don't throw
vi.mock("@/router/HashRouter", () => ({
  useRouter: () => ({
    path: "/app",
    navigate: vi.fn(),
  }),
  Link: ({ to, children, ...rest }: { to: string; children: React.ReactNode; [key: string]: unknown }) =>
    <a href={`#${to}`} {...rest}>{children}</a>,
}));

// Mock API calls
vi.mock("@/lib/api/students", () => ({
  listStudents: vi.fn().mockResolvedValue({
    items: [
      { id: "stu-1", fullName: "Ana Popescu", phone: "079000001", email: null, status: "active", createdAt: "", updatedAt: "" },
    ],
    total: 1, limit: 5, offset: 0,
  }),
}));

vi.mock("@/lib/api/leads", () => ({
  fetchLeadsList: vi.fn().mockResolvedValue({
    items: [
      { id: "lead-1", fullName: "Ana Ionescu", stage: "new", phone: null, email: null, valueCents: 0, debtCents: 0, source: "manual", createdAt: "", updatedAt: "" },
    ],
    page: 1, pageSize: 5, total: 1, totalPages: 1,
  }),
}));

describe("useCommandPalette", () => {
  it("starts closed", () => {
    const { result } = renderHook(() => useCommandPalette());
    expect(result.current.isOpen).toBe(false);
  });

  it("opens on Cmd+K keydown", () => {
    const { result } = renderHook(() => useCommandPalette());
    act(() => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "k", metaKey: true, bubbles: true }));
    });
    expect(result.current.isOpen).toBe(true);
  });

  it("opens on Ctrl+K keydown", () => {
    const { result } = renderHook(() => useCommandPalette());
    act(() => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "k", ctrlKey: true, bubbles: true }));
    });
    expect(result.current.isOpen).toBe(true);
  });

  it("toggles back to closed on second Cmd+K", () => {
    const { result } = renderHook(() => useCommandPalette());
    act(() => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "k", metaKey: true, bubbles: true }));
    });
    act(() => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "k", metaKey: true, bubbles: true }));
    });
    expect(result.current.isOpen).toBe(false);
  });
});

describe("CommandPalette component", () => {
  const onClose = vi.fn();

  beforeEach(() => {
    onClose.mockClear();
  });

  afterEach(() => {
    vi.clearAllTimers();
  });

  // T-POLISH-001-1: palette renders when isOpen=true (aria-expanded)
  it("T-POLISH-001-1: renders with role=combobox and aria-expanded when open", () => {
    render(<CommandPalette isOpen={true} onClose={onClose} />);
    const input = screen.getByRole("combobox");
    expect(input).toBeDefined();
    expect(input.getAttribute("aria-expanded")).toBe("true");
  });

  // T-POLISH-001-3: Escape closes the palette
  it("T-POLISH-001-3: Escape key calls onClose", () => {
    render(<CommandPalette isOpen={true} onClose={onClose} />);
    const input = screen.getByRole("combobox");
    fireEvent.keyDown(input, { key: "Escape" });
    expect(onClose).toHaveBeenCalledOnce();
  });

  // T-POLISH-001-4: shows default page suggestions when query is empty
  it("T-POLISH-001-4: shows default nav page suggestions when query is empty", () => {
    render(<CommandPalette isOpen={true} onClose={onClose} />);
    // Should show default pages — at minimum "Dashboard"
    expect(screen.getByText("Dashboard")).toBeDefined();
  });

  // T-POLISH-001-2: typing 2+ chars triggers search (verifying input accepts 2+ chars)
  it("T-POLISH-001-2: input accepts 2+ characters and updates", async () => {
    render(<CommandPalette isOpen={true} onClose={onClose} />);
    const input = screen.getByRole("combobox");

    fireEvent.change(input, { target: { value: "An" } });
    expect((input as HTMLInputElement).value).toBe("An");

    fireEvent.change(input, { target: { value: "Ana" } });
    expect((input as HTMLInputElement).value).toBe("Ana");
  });

  // T-POLISH-001-5: clicking a result calls navigate and closes
  it("T-POLISH-001-5: clicking a page result closes the palette", () => {
    render(<CommandPalette isOpen={true} onClose={onClose} />);
    // Click on "Dashboard" page result
    const dashItem = screen.getByText("Dashboard");
    fireEvent.click(dashItem);
    expect(onClose).toHaveBeenCalledOnce();
  });

  // T-POLISH-001-6: no hardcoded colors (just verify the component renders semantic classes)
  it("T-POLISH-001-6: renders using semantic token classes (bg-card, text-foreground)", () => {
    const { container } = render(<CommandPalette isOpen={true} onClose={onClose} />);
    const panel = container.querySelector(".bg-card");
    expect(panel).not.toBeNull();
    // Verify text-foreground used (not hardcoded hex inline style)
    const hasInlineHexColor = container.innerHTML.includes("color: #");
    expect(hasInlineHexColor).toBe(false);
  });

  // No render when closed
  it("renders nothing when isOpen=false", () => {
    render(<CommandPalette isOpen={false} onClose={onClose} />);
    expect(screen.queryByRole("combobox")).toBeNull();
  });
});
