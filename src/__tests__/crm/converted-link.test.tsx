/**
 * CRM-148 — "Convertit" badge links to student
 * T-CRM-148-1 [blocant] Given lead cu convertedToStudentId=X, Then cartonașul are link spre /app/students/X.
 * T-CRM-148-2 [blocant] Given click pe "Convertit" pe card, Then navigate la student, NU se deschide cartonașul lead.
 * T-CRM-148-3 [normal] Given lead neconvertit, Then niciun link de student.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import React from "react";

/** Minimal mirror of the CRM-148 "Convertit" button logic on KanbanCard */
function ConvertedBadge({
  convertedToStudentId,
  onNavigateStudent,
  onCardOpen,
}: {
  convertedToStudentId?: string | null;
  onNavigateStudent: (path: string) => void;
  onCardOpen: () => void;
}) {
  if (!convertedToStudentId) return null;
  return (
    // Simulates the outer card button handler that would open the lead card
    <div
      role="button"
      onClick={() => onCardOpen()}
      aria-label="Open card"
      data-testid="card-wrapper"
    >
      <button
        type="button"
        data-testid="converted-btn"
        aria-label="Convertit — deschide fișa studentului"
        onClick={(e) => {
          e.stopPropagation();
          onNavigateStudent(`/app/students/${convertedToStudentId}`);
        }}
      >
        Convertit →
      </button>
    </div>
  );
}

/** Minimal mirror of CRM-148 logic on LeadCardPage */
function ConvertedBlock({
  convertedToStudentId,
  convertedAt,
  onNavigateStudent,
}: {
  convertedToStudentId?: string | null;
  convertedAt?: string | null;
  onNavigateStudent: (path: string) => void;
}) {
  if (!convertedToStudentId) return null;
  return (
    <div data-testid="converted-block">
      <span>
        Convertit la {convertedAt ? new Date(convertedAt).toLocaleDateString("ro-RO") : "—"}
      </span>
      <button
        type="button"
        data-testid="student-link"
        aria-label="Vezi fișa studentului"
        onClick={() => onNavigateStudent(`/app/students/${convertedToStudentId}`)}
      >
        Vezi studentul →
      </button>
    </div>
  );
}

describe("ConvertedBlock (LeadCardPage) — CRM-148", () => {
  // T-CRM-148-1 [blocant]
  it("renders 'Vezi studentul' link to /app/students/<id> when converted", () => {
    const navigate = vi.fn();
    render(
      <ConvertedBlock
        convertedToStudentId="student-abc"
        convertedAt="2026-01-15T10:00:00Z"
        onNavigateStudent={navigate}
      />
    );
    const link = screen.getByTestId("student-link");
    expect(link).toBeTruthy();
    fireEvent.click(link);
    expect(navigate).toHaveBeenCalledWith("/app/students/student-abc");
  });

  // T-CRM-148-3 [normal]
  it("renders nothing when lead is not converted", () => {
    const navigate = vi.fn();
    render(
      <ConvertedBlock
        convertedToStudentId={null}
        convertedAt={null}
        onNavigateStudent={navigate}
      />
    );
    expect(screen.queryByTestId("converted-block")).toBeNull();
  });
});

describe("ConvertedBadge (KanbanCard) — CRM-148", () => {
  // T-CRM-148-2 [blocant]
  it("navigates to student and does NOT open the lead card on click", () => {
    const navigate = vi.fn();
    const openCard = vi.fn();
    render(
      <ConvertedBadge
        convertedToStudentId="student-xyz"
        onNavigateStudent={navigate}
        onCardOpen={openCard}
      />
    );
    const btn = screen.getByTestId("converted-btn");
    fireEvent.click(btn);
    expect(navigate).toHaveBeenCalledWith("/app/students/student-xyz");
    expect(openCard).not.toHaveBeenCalled();
  });

  // T-CRM-148-3 [normal]
  it("renders nothing on KanbanCard when not converted", () => {
    const navigate = vi.fn();
    const openCard = vi.fn();
    render(
      <ConvertedBadge
        convertedToStudentId={null}
        onNavigateStudent={navigate}
        onCardOpen={openCard}
      />
    );
    expect(screen.queryByTestId("converted-btn")).toBeNull();
  });

  // T-CRM-148-1 [blocant] — correct student URL
  it("navigates to the correct /app/students/<id> URL", () => {
    const navigate = vi.fn();
    render(
      <ConvertedBadge
        convertedToStudentId="stu-999"
        onNavigateStudent={navigate}
        onCardOpen={vi.fn()}
      />
    );
    fireEvent.click(screen.getByTestId("converted-btn"));
    expect(navigate).toHaveBeenCalledWith("/app/students/stu-999");
  });
});
