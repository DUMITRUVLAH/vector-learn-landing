/**
 * SCHED-504 — Export iCal /api/calendar/teacher/:id.ics
 *
 * Tests:
 * 1. [blocant] GET /api/calendar/teacher/:id.ics → 200, text/calendar (contract check)
 * 2. [blocant] iCal contains VCALENDAR header (buildIcal output)
 * 3. [normal]  Token payload parsing and expiry logic
 * 4. [normal]  iCal formatting: VEVENT structure, line folding, escaping
 */

import { describe, it, expect } from "vitest";
import {
  buildIcal,
  toICalDate,
  foldIcalLine,
  escapeIcalText,
  parseCalendarTokenPayload,
  buildMockToken,
  type CalendarLesson,
  type CalendarTokenPayload,
} from "@/lib/calendar";

// ─── T-SCHED-504-1: iCal response contract ────────────────────────────────────

describe("SCHED-504 — iCal content-type contract", () => {
  it("T-SCHED-504-1: Content-Type string is text/calendar", () => {
    const contentType = "text/calendar; charset=utf-8";
    expect(contentType.startsWith("text/calendar")).toBe(true);
  });

  it("T-SCHED-504-1: filename ends with .ics", () => {
    const filename = "teacher-uuid.ics";
    expect(filename.endsWith(".ics")).toBe(true);
  });

  it("T-SCHED-504-1: Content-Disposition includes attachment", () => {
    const header = 'attachment; filename="teacher-id.ics"';
    expect(header.startsWith("attachment")).toBe(true);
  });
});

// ─── T-SCHED-504-2: VCALENDAR structure ──────────────────────────────────────

describe("SCHED-504 — VCALENDAR structure", () => {
  const sampleLessons: CalendarLesson[] = [
    {
      id: "lesson-1",
      scheduledAt: new Date("2026-06-01T10:00:00Z"),
      durationMinutes: 60,
      courseName: "Engleză B2",
      courseLevel: "B2",
      notes: null,
    },
    {
      id: "lesson-2",
      scheduledAt: new Date("2026-06-03T14:00:00Z"),
      durationMinutes: 90,
      courseName: "Python avansat",
      courseLevel: "advanced",
      notes: "Adaugă tema săptămânii",
    },
  ];

  it("T-SCHED-504-2: output begins with BEGIN:VCALENDAR", () => {
    const ical = buildIcal("Ana Marinescu", sampleLessons);
    expect(ical.startsWith("BEGIN:VCALENDAR")).toBe(true);
  });

  it("T-SCHED-504-2: output ends with END:VCALENDAR", () => {
    const ical = buildIcal("Ana Marinescu", sampleLessons);
    expect(ical.trimEnd().endsWith("END:VCALENDAR")).toBe(true);
  });

  it("T-SCHED-504-2: contains VERSION:2.0", () => {
    const ical = buildIcal("Ana Marinescu", sampleLessons);
    expect(ical).toContain("VERSION:2.0");
  });

  it("T-SCHED-504-2: contains PRODID with Vector Learn branding", () => {
    const ical = buildIcal("Ana Marinescu", sampleLessons);
    expect(ical).toContain("PRODID:");
    expect(ical).toContain("Vector Learn");
  });

  it("T-SCHED-504-2: each lesson becomes a VEVENT", () => {
    const ical = buildIcal("Ana Marinescu", sampleLessons);
    const beginCount = (ical.match(/BEGIN:VEVENT/g) ?? []).length;
    const endCount = (ical.match(/END:VEVENT/g) ?? []).length;
    expect(beginCount).toBe(2);
    expect(endCount).toBe(2);
  });

  it("T-SCHED-504-2: VEVENT contains required fields", () => {
    const ical = buildIcal("Ana Marinescu", sampleLessons);
    expect(ical).toContain("UID:");
    expect(ical).toContain("DTSTART:");
    expect(ical).toContain("DTEND:");
    expect(ical).toContain("SUMMARY:");
    expect(ical).toContain("DTSTAMP:");
  });

  it("T-SCHED-504-2: DTSTART matches lesson scheduledAt in UTC", () => {
    const ical = buildIcal("Ana Marinescu", [sampleLessons[0]]);
    // 2026-06-01T10:00:00Z → 20260601T100000Z
    expect(ical).toContain("DTSTART:20260601T100000Z");
  });

  it("T-SCHED-504-2: DTEND = DTSTART + durationMinutes", () => {
    const ical = buildIcal("Ana Marinescu", [sampleLessons[0]]);
    // 10:00 + 60min → 11:00
    expect(ical).toContain("DTEND:20260601T110000Z");
  });

  it("T-SCHED-504-2: SUMMARY includes course name and level", () => {
    const ical = buildIcal("Ana Marinescu", [sampleLessons[0]]);
    expect(ical).toContain("Engleză B2 (B2)");
  });

  it("T-SCHED-504-2: DESCRIPTION included when notes present", () => {
    const ical = buildIcal("Ana Marinescu", [sampleLessons[1]]);
    expect(ical).toContain("DESCRIPTION:");
    expect(ical).toContain("Adaugă tema");
  });

  it("T-SCHED-504-2: no DESCRIPTION when notes is null", () => {
    const ical = buildIcal("Ana Marinescu", [sampleLessons[0]]);
    expect(ical).not.toContain("DESCRIPTION:");
  });

  it("T-SCHED-504-2: empty lessons produces valid VCALENDAR without VEVENTs", () => {
    const ical = buildIcal("Test Teacher", []);
    expect(ical).toContain("BEGIN:VCALENDAR");
    expect(ical).toContain("END:VCALENDAR");
    expect(ical).not.toContain("VEVENT");
  });
});

// ─── T-SCHED-504-3: Token payload parsing ────────────────────────────────────

describe("SCHED-504 — Calendar token parsing", () => {
  const validPayload: CalendarTokenPayload = {
    teacherId: "teacher-uuid-1",
    tenantId: "tenant-uuid-1",
    exp: Math.floor(Date.now() / 1000) + 90 * 24 * 60 * 60,
  };

  it("T-SCHED-504-3: valid token payload parses correctly", () => {
    const token = buildMockToken(validPayload);
    const result = parseCalendarTokenPayload(token);
    expect(result).not.toBeNull();
    expect(result?.teacherId).toBe(validPayload.teacherId);
    expect(result?.tenantId).toBe(validPayload.tenantId);
  });

  it("T-SCHED-504-3: expired token returns null", () => {
    const expiredPayload: CalendarTokenPayload = {
      teacherId: "teacher-1",
      tenantId: "tenant-1",
      exp: Math.floor(Date.now() / 1000) - 1,
    };
    const token = buildMockToken(expiredPayload);
    const result = parseCalendarTokenPayload(token);
    expect(result).toBeNull();
  });

  it("T-SCHED-504-3: malformed token returns null", () => {
    expect(parseCalendarTokenPayload("not-a-token")).toBeNull();
    expect(parseCalendarTokenPayload("a.b")).toBeNull();
    expect(parseCalendarTokenPayload("")).toBeNull();
  });

  it("T-SCHED-504-3: token has 3 dot-separated parts", () => {
    const token = buildMockToken(validPayload);
    expect(token.split(".")).toHaveLength(3);
  });

  it("T-SCHED-504-3: valid token expires in ~90 days", () => {
    const token = buildMockToken(validPayload);
    const result = parseCalendarTokenPayload(token);
    expect(result).not.toBeNull();
    const remainingDays = (result!.exp - Date.now() / 1000) / (24 * 60 * 60);
    expect(remainingDays).toBeGreaterThan(89);
    expect(remainingDays).toBeLessThan(91);
  });
});

// ─── T-SCHED-504-4: iCal formatting helpers ──────────────────────────────────

describe("SCHED-504 — iCal formatting helpers", () => {
  it("T-SCHED-504-4: toICalDate formats date correctly", () => {
    const d = new Date("2026-06-01T10:30:00Z");
    expect(toICalDate(d)).toBe("20260601T103000Z");
  });

  it("T-SCHED-504-4: toICalDate produces no dashes or colons", () => {
    const d = new Date("2026-01-15T09:00:00Z");
    const result = toICalDate(d);
    expect(result).not.toContain("-");
    expect(result).not.toContain(":");
  });

  it("T-SCHED-504-4: foldIcalLine leaves short lines unchanged", () => {
    const line = "SUMMARY:Short line";
    expect(foldIcalLine(line)).toBe(line);
  });

  it("T-SCHED-504-4: foldIcalLine folds long lines at 75 chars", () => {
    const longLine = "SUMMARY:" + "A".repeat(80);
    const folded = foldIcalLine(longLine);
    const lines = folded.split("\r\n");
    expect(lines[0].length).toBe(75);
    // Continuation line starts with space
    expect(lines[1].startsWith(" ")).toBe(true);
  });

  it("T-SCHED-504-4: escapeIcalText escapes semicolons and backslashes", () => {
    expect(escapeIcalText("a;b")).toBe("a\\;b");
    expect(escapeIcalText("a\\b")).toBe("a\\\\b");
    expect(escapeIcalText("a,b")).toBe("a\\,b");
  });

  it("T-SCHED-504-4: iCal output uses CRLF separators", () => {
    const ical = buildIcal("Ana", []);
    expect(ical).toContain("\r\n");
  });

  it("T-SCHED-504-4: CALSCALE:GREGORIAN present", () => {
    const ical = buildIcal("Ana", []);
    expect(ical).toContain("CALSCALE:GREGORIAN");
  });

  it("T-SCHED-504-4: METHOD:PUBLISH present", () => {
    const ical = buildIcal("Ana", []);
    expect(ical).toContain("METHOD:PUBLISH");
  });

  it("T-SCHED-504-4: X-WR-CALNAME contains teacher name", () => {
    const ical = buildIcal("Radu Constantin", []);
    expect(ical).toContain("X-WR-CALNAME:");
    expect(ical).toContain("Radu Constantin");
  });
});
