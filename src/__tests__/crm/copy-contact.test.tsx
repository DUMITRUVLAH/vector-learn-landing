/**
 * CRM-144 — Tests for CopyButton
 * T-CRM-144-1 [blocant] Lead with phone → copy button exists with aria-label.
 * T-CRM-144-2 [blocant] Click → clipboard.writeText called with value; feedback shown.
 * T-CRM-144-3 [normal] Clipboard rejection → no exception thrown.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, act, waitFor } from "@testing-library/react";
import { CopyButton } from "@/components/crm/CopyButton";

describe("CopyButton (CRM-144)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  // T-CRM-144-1 [blocant]
  it("renders with aria-label and copy icon", () => {
    render(<CopyButton value="+40721234567" ariaLabel="Copiază telefonul" />);

    const btn = screen.getByRole("button", { name: /copiază telefonul/i });
    expect(btn).toBeTruthy();
    // Starts in non-copied state
    expect(screen.queryByText("Copiat!")).toBeNull();
  });

  // T-CRM-144-2 [blocant]
  it("calls clipboard.writeText and shows Copiat! feedback on click", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText },
      writable: true,
      configurable: true,
    });

    vi.useFakeTimers();
    render(<CopyButton value="test@example.com" ariaLabel="Copiază email-ul" />);

    const btn = screen.getByRole("button");

    await act(async () => {
      fireEvent.click(btn);
      // flush microtasks so the async writeText resolves and setCopied(true) runs
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(writeText).toHaveBeenCalledWith("test@example.com");

    // Feedback text is visible immediately after resolved promise
    expect(screen.getByText("Copiat!")).toBeTruthy();

    // After 1.5s feedback disappears
    act(() => { vi.advanceTimersByTime(1600); });
    expect(screen.queryByText("Copiat!")).toBeNull();

    vi.useRealTimers();
  });

  // T-CRM-144-3 [normal]
  it("does not throw when clipboard rejects", async () => {
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText: vi.fn().mockRejectedValue(new Error("Permission denied")) },
      writable: true,
      configurable: true,
    });

    render(<CopyButton value="+40721234567" ariaLabel="Copiază telefonul" />);
    const btn = screen.getByRole("button");

    // Should NOT throw
    await act(async () => {
      fireEvent.click(btn);
      await Promise.resolve();
    });

    // No feedback shown (graceful silent failure)
    expect(screen.queryByText("Copiat!")).toBeNull();
  });

  it("shows Copiat! in aria-label after copy", async () => {
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText: vi.fn().mockResolvedValue(undefined) },
      writable: true,
      configurable: true,
    });

    vi.useFakeTimers();
    render(<CopyButton value="test" ariaLabel="Copiază" />);

    fireEvent.click(screen.getByRole("button"));
    await act(async () => { await Promise.resolve(); });

    const btn = screen.getByRole("button");
    expect(btn.getAttribute("aria-label")).toBe("Copiat!");

    vi.useRealTimers();
  });
});
