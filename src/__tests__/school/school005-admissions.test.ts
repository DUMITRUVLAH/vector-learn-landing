/**
 * SCHOOL-005 — Teste pentru funcții pure de admitere
 *
 * T-SCHOOL-005-2: isEligibleToEnroll cu status accepted + niciun doc required
 * T-SCHOOL-005-3: isEligibleToEnroll cu status accepted + doc required → false
 * T-SCHOOL-005-7: admissionStatusLabel('accepted') → string non-gol
 */
import { describe, it, expect } from "vitest";
import {
  isEligibleToEnroll,
  admissionStatusLabel,
  admissionStatusColor,
  type AdmissionStatus,
} from "../../../server/lib/admissions";

describe("isEligibleToEnroll", () => {
  it("[T-SCHOOL-005-2] returns true when accepted and no required docs", () => {
    expect(
      isEligibleToEnroll({ status: "accepted" }, [
        { status: "verified" },
        { status: "received" },
      ])
    ).toBe(true);
  });

  it("[T-SCHOOL-005-2] returns true when accepted and no documents at all", () => {
    expect(isEligibleToEnroll({ status: "accepted" }, [])).toBe(true);
  });

  it("[T-SCHOOL-005-3] returns false when accepted but has a required doc", () => {
    expect(
      isEligibleToEnroll({ status: "accepted" }, [
        { status: "verified" },
        { status: "required" },
      ])
    ).toBe(false);
  });

  it("returns false when not accepted (even with all docs verified)", () => {
    expect(
      isEligibleToEnroll({ status: "review" }, [{ status: "verified" }])
    ).toBe(false);
  });

  it("returns false for enrolled status", () => {
    expect(isEligibleToEnroll({ status: "enrolled" }, [])).toBe(false);
  });

  it("returns false for rejected", () => {
    expect(isEligibleToEnroll({ status: "rejected" }, [])).toBe(false);
  });
});

describe("admissionStatusLabel", () => {
  it("[T-SCHOOL-005-7] returns non-empty Romanian label for accepted", () => {
    const label = admissionStatusLabel("accepted");
    expect(typeof label).toBe("string");
    expect(label.length).toBeGreaterThan(0);
    expect(label).toBe("Acceptat");
  });

  const statuses: AdmissionStatus[] = [
    "draft", "submitted", "review", "accepted",
    "waitlisted", "rejected", "enrolled",
  ];

  it("returns a label for every status", () => {
    for (const s of statuses) {
      const label = admissionStatusLabel(s);
      expect(typeof label).toBe("string");
      expect(label.length).toBeGreaterThan(0);
    }
  });
});

describe("admissionStatusColor", () => {
  it("returns a CSS class string for accepted", () => {
    const color = admissionStatusColor("accepted");
    expect(typeof color).toBe("string");
    expect(color.length).toBeGreaterThan(0);
  });
});
