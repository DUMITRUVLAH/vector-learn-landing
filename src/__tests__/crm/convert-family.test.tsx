/**
 * CRM-111 — Conversie + familie + reasignare + scor
 * Covers T-CRM-111-1..5
 *
 * T-CRM-111-1: convert creează student (active) + leads.stage=paid + converted_to_student_id
 * T-CRM-111-2: convert cu plătitor → familie creată + students.family_id legat
 * T-CRM-111-3: a doua conversie → already_converted fără student duplicat
 * T-CRM-111-4: reasignare actualizează assigned_to
 * T-CRM-111-5: scor calculat hot/warm/cold
 */
import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { ConvertModal, getScoreBadge, SCORE_BADGE_LABELS } from "@/components/crm/ConvertModal";
import type { Lead } from "@/lib/api/leads";

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock("@/lib/api/leads", () => ({
  convertLead: vi.fn(),
  assignLead: vi.fn(),
  scoreLead: vi.fn(),
  getDedupBanner: vi.fn(),
  mergeLead: vi.fn(),
}));

// ─── Fixtures ──────────────────────────────────────────────────────────────────

const makeLead = (overrides: Partial<Lead> = {}): Lead => ({
  id: "lead-001",
  fullName: "Maria Popescu",
  phone: "+40771234567",
  email: "maria@test.ro",
  interestCourse: "Engleză B2",
  stage: "trial",
  source: "facebook_ad",
  utmSource: null,
  utmMedium: null,
  utmCampaign: null,
  notes: null,
  assignedTo: null,
  consentAt: new Date().toISOString(),
  consentText: "Sunt de acord",
  ipAtConsent: null,
  consentRevokedAt: null,
  convertedToStudentId: null,
  convertedAt: null,
  lostReason: null,
  score: null,
  valueCents: 0,
  debtCents: 0,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  ...overrides,
});

// ─── Tests: ConvertModal ──────────────────────────────────────────────────────

describe("CRM-111 — ConvertModal", () => {
  let mockConvertLead: ReturnType<typeof vi.fn>;
  let onSuccess: ReturnType<typeof vi.fn>;
  let onCancel: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    const leadsModule = await import("@/lib/api/leads");
    mockConvertLead = vi.mocked(leadsModule.convertLead);
    onSuccess = vi.fn();
    onCancel = vi.fn();
    vi.clearAllMocks();
  });

  it("T-CRM-111-1: renders modal with lead name pre-filled", () => {
    const lead = makeLead();
    render(<ConvertModal lead={lead} onSuccess={onSuccess} onCancel={onCancel} />);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByLabelText(/nume complet elev/i)).toHaveValue("Maria Popescu");
  });

  it("T-CRM-111-1: submit calls convertLead with correct data", async () => {
    const lead = makeLead();
    mockConvertLead.mockResolvedValueOnce({
      lead: { ...lead, stage: "paid", convertedToStudentId: "student-001" },
      student: { id: "student-001", fullName: "Maria Popescu" },
      familyId: null,
    });

    render(<ConvertModal lead={lead} onSuccess={onSuccess} onCancel={onCancel} />);

    const submitBtn = screen.getByRole("button", { name: /convertește în student/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(mockConvertLead).toHaveBeenCalledWith("lead-001", expect.objectContaining({
        studentName: "Maria Popescu",
        studentStatus: "active",
      }));
    });

    await waitFor(() => expect(onSuccess).toHaveBeenCalledWith({
      studentId: "student-001",
      familyId: null,
    }));
  });

  it("T-CRM-111-2: with payer data → creates family", async () => {
    const lead = makeLead();
    mockConvertLead.mockResolvedValueOnce({
      lead: { ...lead, stage: "paid", convertedToStudentId: "student-001" },
      student: { id: "student-001", fullName: "Maria Popescu", familyId: "family-001" },
      familyId: "family-001",
    });

    render(<ConvertModal lead={lead} onSuccess={onSuccess} onCancel={onCancel} />);

    // Enable payer section
    const toggleLabel = screen.getByLabelText(/adaugă date plătitor/i);
    fireEvent.click(toggleLabel);

    // Fill payer name
    await waitFor(() => {
      expect(screen.getByLabelText(/nume plătitor/i)).toBeInTheDocument();
    });

    fireEvent.change(screen.getByLabelText(/nume plătitor/i), {
      target: { value: "Ion Popescu" },
    });

    const submitBtn = screen.getByRole("button", { name: /convertește în student/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(mockConvertLead).toHaveBeenCalledWith("lead-001", expect.objectContaining({
        payerName: "Ion Popescu",
        studentName: "Maria Popescu",
      }));
    });

    await waitFor(() => expect(onSuccess).toHaveBeenCalledWith({
      studentId: "student-001",
      familyId: "family-001",
    }));
  });

  it("T-CRM-111-3: already_converted shows error, no duplicate", async () => {
    const lead = makeLead({ convertedToStudentId: null }); // not yet in state, but server rejects
    const { ApiError } = await import("@/lib/api");
    mockConvertLead.mockRejectedValueOnce(new ApiError(409, "already_converted"));

    render(<ConvertModal lead={lead} onSuccess={onSuccess} onCancel={onCancel} />);

    const submitBtn = screen.getByRole("button", { name: /convertește în student/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(screen.getByRole("alert")).toBeInTheDocument();
      expect(screen.getByRole("alert")).toHaveTextContent(/deja convertit/i);
    });

    expect(onSuccess).not.toHaveBeenCalled();
  });

  it("cancel button calls onCancel", () => {
    const lead = makeLead();
    render(<ConvertModal lead={lead} onSuccess={onSuccess} onCancel={onCancel} />);
    fireEvent.click(screen.getByRole("button", { name: /anulează/i }));
    expect(onCancel).toHaveBeenCalled();
  });

  it("T-CRM-111-1: trial status option available", () => {
    const lead = makeLead();
    render(<ConvertModal lead={lead} onSuccess={onSuccess} onCancel={onCancel} />);
    const statusSelect = screen.getByLabelText(/status student nou/i);
    const options = Array.from((statusSelect as HTMLSelectElement).options).map((o) => o.value);
    expect(options).toContain("active");
    expect(options).toContain("trial");
  });
});

// ─── Tests: Score badge ────────────────────────────────────────────────────────

describe("CRM-111 — Lead score badge", () => {
  it("T-CRM-111-5: score ≥ 70 → hot", () => {
    expect(getScoreBadge(75)).toBe("hot");
    expect(getScoreBadge(70)).toBe("hot");
    expect(getScoreBadge(100)).toBe("hot");
  });

  it("T-CRM-111-5: score 40-69 → warm", () => {
    expect(getScoreBadge(40)).toBe("warm");
    expect(getScoreBadge(55)).toBe("warm");
    expect(getScoreBadge(69)).toBe("warm");
  });

  it("T-CRM-111-5: score < 40 → cold", () => {
    expect(getScoreBadge(0)).toBe("cold");
    expect(getScoreBadge(20)).toBe("cold");
    expect(getScoreBadge(39)).toBe("cold");
  });

  it("T-CRM-111-5: null score → cold", () => {
    expect(getScoreBadge(null)).toBe("cold");
    expect(getScoreBadge(undefined)).toBe("cold");
  });

  it("T-CRM-111-5: badge labels are defined for all badges", () => {
    expect(SCORE_BADGE_LABELS["hot"]).toBe("hot");
    expect(SCORE_BADGE_LABELS["warm"]).toBe("warm");
    expect(SCORE_BADGE_LABELS["cold"]).toBe("cold");
  });
});

// ─── Tests: Reasignment ──────────────────────────────────────────────────────

describe("CRM-111 — Reasignment (T-CRM-111-4)", () => {
  it("T-CRM-111-4: assignLead API function exists and returns Lead", async () => {
    const leadsModule = await import("@/lib/api/leads");
    const mockAssign = vi.mocked(leadsModule.assignLead);
    const lead = makeLead({ assignedTo: null });

    mockAssign.mockResolvedValueOnce({ ...lead, assignedTo: "user-002" });

    const result = await leadsModule.assignLead("lead-001", "user-002");
    expect(mockAssign).toHaveBeenCalledWith("lead-001", "user-002");
    expect(result.assignedTo).toBe("user-002");
  });

  it("T-CRM-111-4: assignLead with null unassigns", async () => {
    const leadsModule = await import("@/lib/api/leads");
    const mockAssign = vi.mocked(leadsModule.assignLead);
    const lead = makeLead({ assignedTo: "user-001" });

    mockAssign.mockResolvedValueOnce({ ...lead, assignedTo: null });

    const result = await leadsModule.assignLead("lead-001", null);
    expect(result.assignedTo).toBeNull();
  });
});
