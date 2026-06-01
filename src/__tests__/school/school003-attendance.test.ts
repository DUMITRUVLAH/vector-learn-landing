/**
 * SCHOOL-003 — Unit tests pentru funcțiile pure de prezență
 *
 * T-SCHOOL-003-3: attendanceRate returns 80% for 3 present + 1 late + 1 absent.
 */
import { describe, it, expect } from "vitest";
import { attendanceRate, absenceCount } from "../../../server/lib/attendance";

type StatusOnly = { status: "present" | "absent" | "late" | "excused" | "pending" };

describe("attendanceRate", () => {
  it("[normal] T-SCHOOL-003-3: 3 present + 1 late + 1 absent → 80%", () => {
    const records: StatusOnly[] = [
      { status: "present" },
      { status: "present" },
      { status: "present" },
      { status: "late" },
      { status: "absent" },
    ];
    expect(attendanceRate(records)).toBe(80);
  });

  it("[normal] 100% când toți sunt prezenți", () => {
    const records: StatusOnly[] = [
      { status: "present" },
      { status: "present" },
    ];
    expect(attendanceRate(records)).toBe(100);
  });

  it("[normal] 0% când toți sunt absenți", () => {
    const records: StatusOnly[] = [
      { status: "absent" },
      { status: "absent" },
    ];
    expect(attendanceRate(records)).toBe(0);
  });

  it("[normal] null pentru lista goală (evita împărțire la 0)", () => {
    expect(attendanceRate([])).toBeNull();
  });

  it("[normal] late contează drept prezent în rata de prezență", () => {
    const records: StatusOnly[] = [
      { status: "late" },
      { status: "absent" },
    ];
    expect(attendanceRate(records)).toBe(50);
  });

  it("[normal] excused nu contează ca prezent", () => {
    const records: StatusOnly[] = [
      { status: "excused" },
      { status: "absent" },
    ];
    expect(attendanceRate(records)).toBe(0);
  });
});

describe("absenceCount", () => {
  it("[normal] numără absențele corect", () => {
    const records: StatusOnly[] = [
      { status: "absent" },
      { status: "absent" },
      { status: "present" },
      { status: "late" },
    ];
    expect(absenceCount(records, "absent")).toBe(2);
  });

  it("[normal] returnează 0 când nu există status-ul cerut", () => {
    const records: StatusOnly[] = [
      { status: "present" },
      { status: "present" },
    ];
    expect(absenceCount(records, "absent")).toBe(0);
  });

  it("[normal] numără late-urile corect", () => {
    const records: StatusOnly[] = [
      { status: "late" },
      { status: "late" },
      { status: "present" },
    ];
    expect(absenceCount(records, "late")).toBe(2);
  });
});
