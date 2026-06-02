/**
 * GUARDIAN-001 — T-GUARDIAN-001-6: StudentGuardiansPanel render test
 *
 * Smoke test: componenta se randează cu 2 tutori mock fără crash.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import React from "react";

vi.mock("@/lib/api/guardians", () => ({
  listGuardians: vi.fn().mockResolvedValue({
    guardians: [
      {
        id: "g-1",
        tenantId: "t1",
        studentId: "s1",
        fullName: "Maria Ionescu",
        relationship: "Mamă",
        phone: "+40700000001",
        email: "maria@test.com",
        isPrimary: true,
        hasCustody: true,
        canPickup: true,
        receivesCommunications: true,
        notes: null,
        createdAt: "2026-01-01T00:00:00Z",
        updatedAt: "2026-01-01T00:00:00Z",
      },
      {
        id: "g-2",
        tenantId: "t1",
        studentId: "s1",
        fullName: "Ion Ionescu",
        relationship: "Tată",
        phone: "+40700000002",
        email: null,
        isPrimary: false,
        hasCustody: true,
        canPickup: false,
        receivesCommunications: false,
        notes: null,
        createdAt: "2026-01-01T00:00:00Z",
        updatedAt: "2026-01-01T00:00:00Z",
      },
    ],
  }),
  addGuardian: vi.fn(),
  updateGuardian: vi.fn(),
  deleteGuardian: vi.fn(),
}));

import { StudentGuardiansPanel } from "../../components/app/StudentGuardiansPanel";

describe("StudentGuardiansPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("[blocant] T-GUARDIAN-001-6: se randează fără crash cu 2 tutori", () => {
    const { container } = render(<StudentGuardiansPanel studentId="s1" />);
    expect(container).toBeTruthy();
  });

  it("[normal] afișează titlul 'Tutori autorizați'", () => {
    render(<StudentGuardiansPanel studentId="s1" />);
    expect(screen.getByText(/tutori autorizați/i)).toBeTruthy();
  });

  it("[normal] afișează butonul de adăugare", () => {
    render(<StudentGuardiansPanel studentId="s1" />);
    expect(screen.getByRole("button", { name: /adaugă tutore/i })).toBeTruthy();
  });
});
