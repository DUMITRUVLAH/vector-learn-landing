/**
 * AI-A01 — LessonSummaryPanel UI tests (T-AI-A01-5)
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { LessonSummaryPanel } from "../../components/app/LessonSummaryPanel";

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

function stubSummaryResponse(summary = "Elevul a progresat bine.") {
  mockFetch.mockResolvedValueOnce({
    ok: true,
    json: async () => ({
      summary,
      auditId: "test-audit-id",
      model: "stub",
      isStub: true,
      pseudonymized: true,
    }),
  });
}

describe("LessonSummaryPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("T-AI-A01-5: renders generate button and notes textarea", () => {
    render(<LessonSummaryPanel />);
    expect(screen.getByLabelText(/notițele profesorului/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /generează sumar/i })).toBeInTheDocument();
  });

  it("generate button is disabled when notes are empty", () => {
    render(<LessonSummaryPanel />);
    const btn = screen.getByRole("button", { name: /generează sumar/i });
    expect(btn).toBeDisabled();
  });

  it("shows summary after successful AI call", async () => {
    stubSummaryResponse("Lecție excelentă. Progres vizibil.");
    render(<LessonSummaryPanel />);

    const textarea = screen.getByLabelText(/notițele profesorului/i);
    fireEvent.change(textarea, { target: { value: "Lecție bună astăzi." } });

    const btn = screen.getByRole("button", { name: /generează sumar/i });
    fireEvent.click(btn);

    await waitFor(() => {
      expect(screen.getByLabelText(/sumar generat/i)).toBeInTheDocument();
    });

    expect(screen.getByDisplayValue("Lecție excelentă. Progres vizibil.")).toBeInTheDocument();
  });

  it("shows stub warning when isStub=true", async () => {
    stubSummaryResponse();
    render(<LessonSummaryPanel teacherNotes="Lecție bună." />);

    const btn = screen.getByRole("button", { name: /generează sumar/i });
    fireEvent.click(btn);

    await waitFor(() => {
      expect(screen.getByText(/AI nu este configurat/i)).toBeInTheDocument();
    });
  });

  it("shows error message on fetch failure", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      json: async () => ({ error: "Server error" }),
    });
    render(<LessonSummaryPanel teacherNotes="Test notes" />);

    const btn = screen.getByRole("button", { name: /generează sumar/i });
    fireEvent.click(btn);

    await waitFor(() => {
      expect(screen.getByRole("alert")).toBeInTheDocument();
    });
  });

  it("dismiss with Anulează hides summary", async () => {
    stubSummaryResponse("Sumar test.");
    render(<LessonSummaryPanel teacherNotes="Note test." />);

    const btn = screen.getByRole("button", { name: /generează sumar/i });
    fireEvent.click(btn);

    await waitFor(() => {
      expect(screen.getByLabelText(/sumar generat/i)).toBeInTheDocument();
    });

    const cancelBtn = screen.getByRole("button", { name: /anulează/i });
    fireEvent.click(cancelBtn);

    expect(screen.queryByLabelText(/sumar generat/i)).not.toBeInTheDocument();
  });

  it("shows GDPR badge", () => {
    render(<LessonSummaryPanel />);
    expect(screen.getByText(/date pseudonimizate/i)).toBeInTheDocument();
  });
});
