/**
 * CRM-143 — Tests for StageMoveUndoToast
 * T-CRM-143-1 [blocant] After a successful stage move, the undo toast with "Anulează" appears.
 * T-CRM-143-2 [blocant] Clicking "Anulează" calls the onUndo callback.
 * T-CRM-143-3 [normal] Without a click, onUndo is NOT called after the 5s countdown.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { StageMoveUndoToast } from "@/components/crm/StageMoveUndoToast";

describe("StageMoveUndoToast (CRM-143)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // T-CRM-143-1 [blocant]
  it("renders toast with message and Anulează button", () => {
    const onUndo = vi.fn();
    const onDismiss = vi.fn();

    render(
      <StageMoveUndoToast
        message='Mutat la "Interesat"'
        onUndo={onUndo}
        onDismiss={onDismiss}
      />
    );

    // Toast container has role="status" with aria-live
    const toast = screen.getByRole("status");
    expect(toast).toBeTruthy();
    expect(toast.getAttribute("aria-live")).toBe("polite");

    // Message is visible
    expect(screen.getByText(/Mutat la "Interesat"/)).toBeTruthy();

    // Anulează button is present
    const undoBtn = screen.getByRole("button", { name: /anulează mutarea de stadiu/i });
    expect(undoBtn).toBeTruthy();
    expect(undoBtn.hasAttribute("disabled") ? (undoBtn as HTMLButtonElement).disabled : false).toBe(false);
  });

  // T-CRM-143-2 [blocant]
  it("clicking Anulează calls onUndo and then onDismiss", async () => {
    const onUndo = vi.fn().mockResolvedValue(undefined);
    const onDismiss = vi.fn();

    render(
      <StageMoveUndoToast
        message='Mutat la "Pierdut"'
        onUndo={onUndo}
        onDismiss={onDismiss}
      />
    );

    const undoBtn = screen.getByRole("button", { name: /anulează mutarea de stadiu/i });
    fireEvent.click(undoBtn);

    // Wait for the async onUndo to resolve
    await act(async () => {
      await Promise.resolve();
    });

    expect(onUndo).toHaveBeenCalledTimes(1);
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  // T-CRM-143-3 [normal]
  it("does NOT call onUndo if countdown expires without a click", () => {
    const onUndo = vi.fn();
    const onDismiss = vi.fn();

    render(
      <StageMoveUndoToast
        message='Mutat la "Contactat"'
        onUndo={onUndo}
        onDismiss={onDismiss}
      />
    );

    // Advance 6 seconds — past the 5s window
    act(() => {
      vi.advanceTimersByTime(6000);
    });

    // onUndo must NOT have been called
    expect(onUndo).not.toHaveBeenCalled();

    // onDismiss IS called (auto-dismiss after countdown)
    expect(onDismiss).toHaveBeenCalled();
  });

  it("countdown label decrements each second", () => {
    const onUndo = vi.fn();
    const onDismiss = vi.fn();

    render(
      <StageMoveUndoToast
        message="Mutat"
        onUndo={onUndo}
        onDismiss={onDismiss}
      />
    );

    // Initially shows 5s
    expect(screen.getByText(/5s/)).toBeTruthy();

    act(() => { vi.advanceTimersByTime(1000); });
    expect(screen.getByText(/4s/)).toBeTruthy();

    act(() => { vi.advanceTimersByTime(1000); });
    expect(screen.getByText(/3s/)).toBeTruthy();
  });

  it("close button calls onDismiss without onUndo", () => {
    const onUndo = vi.fn();
    const onDismiss = vi.fn();

    render(
      <StageMoveUndoToast
        message="Mutat"
        onUndo={onUndo}
        onDismiss={onDismiss}
      />
    );

    const closeBtn = screen.getByRole("button", { name: /închide notificarea/i });
    fireEvent.click(closeBtn);

    expect(onDismiss).toHaveBeenCalledTimes(1);
    expect(onUndo).not.toHaveBeenCalled();
  });
});
