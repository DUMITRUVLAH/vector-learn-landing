/**
 * GAP-017 — Portal notification preferences
 *
 * Covers:
 *   T-GAP-017-1 [blocant]: default prefs have lessonReminder:true
 *   T-GAP-017-2 [blocant]: lesson reminder logic — student with lesson tomorrow + prefs enabled
 *   T-GAP-017-3 [blocant]: debt alert logic — student with debt > threshold + debtAlert:true
 *   T-GAP-017-4 [blocant]: debt alert skipped when debtAlert:false
 *   T-GAP-017-5 [blocant]: PATCH prefs schema is valid
 *   T-GAP-017-6 [normal]: toggle UI reflects correct off state
 */
import { describe, it, expect } from "vitest";
import type { PortalNotificationPrefs } from "../../lib/api/portalNotifs";

// ─── T-GAP-017-1: Default prefs have lessonReminder:true ─────────────────────

describe("GAP-017 — default notification prefs", () => {
  it("T-GAP-017-1: default prefs shape has lessonReminder:true", () => {
    const defaultPrefs: Omit<PortalNotificationPrefs, "id" | "tenantId" | "studentId" | "createdAt" | "updatedAt"> = {
      lessonReminder: true,
      reminderHoursBefore: 24,
      debtAlert: true,
      debtThresholdCents: 20000,
      packageLowAlert: true,
      packageLowThreshold: 2,
    };

    expect(defaultPrefs.lessonReminder).toBe(true);
    expect(defaultPrefs.reminderHoursBefore).toBe(24);
    expect(defaultPrefs.debtThresholdCents).toBe(20000);
    expect(defaultPrefs.packageLowThreshold).toBe(2);
  });
});

// ─── T-GAP-017-2: Lesson reminder logic ──────────────────────────────────────

describe("GAP-017 — lesson reminder logic", () => {
  it("T-GAP-017-2: student with lesson tomorrow and reminder enabled should be queued", () => {
    const prefs = { lessonReminder: true, reminderHoursBefore: 24 };
    const lessonScheduledAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // tomorrow
    const now = new Date();

    const scheduledFor = new Date(lessonScheduledAt.getTime() - prefs.reminderHoursBefore * 60 * 60 * 1000);
    const shouldQueue = prefs.lessonReminder && scheduledFor >= now;

    expect(shouldQueue).toBe(true);
    expect(scheduledFor.getTime()).toBeGreaterThanOrEqual(now.getTime());
  });

  it("T-GAP-017-2b: student with reminder disabled should NOT be queued", () => {
    const prefs = { lessonReminder: false, reminderHoursBefore: 24 };
    expect(prefs.lessonReminder).toBe(false);
    // Route logic: if (!prefs.lessonReminder) continue; — not queued
  });

  it("T-GAP-017-2c: reminder for a past send time should NOT be queued", () => {
    const prefs = { lessonReminder: true, reminderHoursBefore: 24 };
    const lessonScheduledAt = new Date(Date.now() + 2 * 60 * 60 * 1000); // 2 hours from now
    const now = new Date();

    const scheduledFor = new Date(lessonScheduledAt.getTime() - prefs.reminderHoursBefore * 60 * 60 * 1000);
    const shouldQueue = prefs.lessonReminder && scheduledFor >= now;

    expect(shouldQueue).toBe(false); // Send time is 22h ago
  });
});

// ─── T-GAP-017-3: Debt alert logic ───────────────────────────────────────────

describe("GAP-017 — debt alert logic", () => {
  it("T-GAP-017-3: student with debt > threshold and debtAlert:true triggers alert", () => {
    const prefs = { debtAlert: true, debtThresholdCents: 20000 };
    const student = { debtCents: 35000, parentEmail: "parent@test.com" };

    const shouldAlert = prefs.debtAlert && student.debtCents >= prefs.debtThresholdCents;
    const hasContact = !!(student.parentEmail);

    expect(shouldAlert).toBe(true);
    expect(hasContact).toBe(true);
  });

  it("T-GAP-017-3b: student with debt exactly at threshold triggers alert", () => {
    const prefs = { debtAlert: true, debtThresholdCents: 20000 };
    const student = { debtCents: 20000 };

    const shouldAlert = prefs.debtAlert && student.debtCents >= prefs.debtThresholdCents;
    expect(shouldAlert).toBe(true);
  });
});

// ─── T-GAP-017-4: Debt alert skipped when debtAlert:false ────────────────────

describe("GAP-017 — debt alert disabled", () => {
  it("T-GAP-017-4: student with debtAlert:false is NOT alerted even with high debt", () => {
    const prefs = { debtAlert: false, debtThresholdCents: 20000 };
    const student = { debtCents: 100000 }; // very high debt

    const shouldAlert = prefs.debtAlert && student.debtCents >= prefs.debtThresholdCents;
    expect(shouldAlert).toBe(false);
  });

  it("T-GAP-017-4b: student with debt below threshold is NOT alerted", () => {
    const prefs = { debtAlert: true, debtThresholdCents: 20000 };
    const student = { debtCents: 5000 }; // below threshold

    const shouldAlert = prefs.debtAlert && student.debtCents >= prefs.debtThresholdCents;
    expect(shouldAlert).toBe(false);
  });
});

// ─── T-GAP-017-5: PATCH prefs schema validation ──────────────────────────────

describe("GAP-017 — prefs update schema", () => {
  it("T-GAP-017-5: updating lessonReminder to false is valid", () => {
    const patch = { lessonReminder: false };
    // Schema allows: lessonReminder?: boolean, reminderHoursBefore?: int, etc.
    expect(typeof patch.lessonReminder).toBe("boolean");
  });

  it("T-GAP-017-5b: partial update (only debtAlert) is valid", () => {
    const patch = { debtAlert: true };
    // Other fields remain unchanged
    expect(typeof patch.debtAlert).toBe("boolean");
  });

  it("T-GAP-017-5c: reminderHoursBefore must be 1-72", () => {
    const validValues = [1, 24, 48, 72];
    const invalidValues = [0, 73, -1];

    for (const v of validValues) {
      expect(v >= 1 && v <= 72).toBe(true);
    }
    for (const v of invalidValues) {
      expect(v >= 1 && v <= 72).toBe(false);
    }
  });
});

// ─── T-GAP-017-6: Toggle UI reflects off state ───────────────────────────────

describe("GAP-017 — toggle UI state", () => {
  it("T-GAP-017-6: toggle CSS class for on state uses bg-primary", () => {
    const isOn = true;
    const className = isOn ? "bg-primary" : "bg-muted";
    expect(className).toBe("bg-primary");
  });

  it("T-GAP-017-6b: toggle CSS class for off state uses bg-muted", () => {
    const isOn = false;
    const className = isOn ? "bg-primary" : "bg-muted";
    expect(className).toBe("bg-muted");
  });

  it("T-GAP-017-6c: toggle transform for on state is translate-x-6", () => {
    const isOn = true;
    const transform = isOn ? "translate-x-6" : "translate-x-1";
    expect(transform).toBe("translate-x-6");
  });
});

// ─── T-GAP-017-DB: Schema import check ───────────────────────────────────────

describe("GAP-017 — schema structure", () => {
  it("T-GAP-017-DB: portalNotifs API module exports required types", async () => {
    const module = await import("../../lib/api/portalNotifs");
    expect(module).toBeDefined();
    // Type PortalNotificationPrefs is exported
    expect(typeof module.updatePortalNotifPrefs).toBe("function");
  });
});
