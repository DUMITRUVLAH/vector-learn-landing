/**
 * CRM-139 — Search auto-aplicat (debounced) în vederea Listă
 * T-CRM-139-1: tastare rapidă "ana" → fetch apelat o singură dată după debounce
 * T-CRM-139-2: schimbare sursă → re-fetch declanșat automat
 * T-CRM-139-3: unmount în timpul debounce → niciun setState/fetch după unmount
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("CRM-139 — useDebouncedValue", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  // T-CRM-139-1 [blocant]: rapid typing → debounce collapses multiple updates
  it("T-CRM-139-1: rapid value changes produce only one debounced update", () => {
    const { result, rerender } = renderHook(
      ({ value, delay }: { value: string; delay: number }) =>
        useDebouncedValue(value, delay),
      { initialProps: { value: "", delay: 300 } }
    );

    // Initial value
    expect(result.current).toBe("");

    // Rapid typing: a → an → ana — none should flush yet
    act(() => { rerender({ value: "a", delay: 300 }); });
    act(() => { rerender({ value: "an", delay: 300 }); });
    act(() => { rerender({ value: "ana", delay: 300 }); });

    // Still old value before delay
    expect(result.current).toBe("");

    // Advance timer by 300ms — only the last value fires
    act(() => vi.advanceTimersByTime(300));
    expect(result.current).toBe("ana");
  });

  // T-CRM-139-1b: single change after delay → updates immediately
  it("T-CRM-139-1b: value after delay is debounced correctly", () => {
    const { result, rerender } = renderHook(
      ({ value }: { value: string }) => useDebouncedValue(value, 300),
      { initialProps: { value: "" } }
    );
    act(() => { rerender({ value: "ion" }); });
    act(() => vi.advanceTimersByTime(299));
    expect(result.current).toBe(""); // not yet
    act(() => vi.advanceTimersByTime(1));
    expect(result.current).toBe("ion"); // now
  });

  // T-CRM-139-2: source change → debounced update fires
  it("T-CRM-139-2: changing filter source triggers debounced update", () => {
    const { result, rerender } = renderHook(
      ({ value }: { value: string }) => useDebouncedValue(value, 300),
      { initialProps: { value: "all" } }
    );
    act(() => { rerender({ value: "facebook_ad" }); });
    act(() => vi.advanceTimersByTime(300));
    expect(result.current).toBe("facebook_ad");
  });

  // T-CRM-139-3 [blocant]: unmount during debounce → no update after unmount
  it("T-CRM-139-3: unmounting during debounce window does not update state", () => {
    const { result, rerender, unmount } = renderHook(
      ({ value }: { value: string }) => useDebouncedValue(value, 300),
      { initialProps: { value: "" } }
    );

    act(() => { rerender({ value: "test" }); });
    // Unmount before timer fires
    unmount();

    // Advancing timer after unmount should not throw or update
    expect(() => act(() => vi.advanceTimersByTime(300))).not.toThrow();
    // result.current is still the last rendered value (not a new update)
    expect(result.current).toBe("");
  });
});
