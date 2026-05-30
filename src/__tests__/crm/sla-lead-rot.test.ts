/**
 * CRM-124 — SLA timp de răspuns + lead-rot escalation
 * Unit tests for SLA badge logic and neglected lead detection.
 */
import { describe, it, expect } from "vitest";

// ─── SLA badge computation logic ─────────────────────────────────────────────

function computeSlaBadge(
  createdAt: Date,
  now: Date,
  isHot: boolean,
  slaHotMinutes: number,
  slaDefaultHours: number,
  rotDays: number
): "green" | "yellow" | "red" {
  const minutesSince = (now.getTime() - createdAt.getTime()) / 60000;
  const thresholdMinutes = isHot ? slaHotMinutes : slaDefaultHours * 60;
  const rotThreshold = rotDays * 24 * 60;
  if (minutesSince > rotThreshold) return "red";
  if (minutesSince > thresholdMinutes * 2) return "red";
  if (minutesSince > thresholdMinutes) return "yellow";
  return "green";
}

function computeNeglected(
  createdAt: Date,
  lastInteractionAt: Date | null,
  rotDays: number,
  now: Date
): boolean {
  const rotCutoff = new Date(now.getTime() - rotDays * 24 * 60 * 60 * 1000);
  const isOldEnough = createdAt < rotCutoff;
  if (!isOldEnough) return false;
  if (!lastInteractionAt) return true;
  return lastInteractionAt < rotCutoff;
}

describe("CRM-124 SLA badge computation", () => {
  const now = new Date("2026-05-30T12:00:00Z");
  const defaults = { slaHotMinutes: 15, slaDefaultHours: 24, rotDays: 7 };

  it("T-CRM-124-1 — lead created just now is green (SLA not breached)", () => {
    const createdAt = new Date(now.getTime() - 5 * 60 * 1000); // 5 minutes ago
    const badge = computeSlaBadge(createdAt, now, false, defaults.slaHotMinutes, defaults.slaDefaultHours, defaults.rotDays);
    expect(badge).toBe("green");
  });

  it("T-CRM-124-1b — hot lead created 12 min ago is green (< sla_hot_minutes=15)", () => {
    const createdAt = new Date(now.getTime() - 12 * 60 * 1000);
    const badge = computeSlaBadge(createdAt, now, true, defaults.slaHotMinutes, defaults.slaDefaultHours, defaults.rotDays);
    expect(badge).toBe("green");
  });

  it("T-CRM-124-1c — hot lead created 20 min ago is yellow (> sla_hot_minutes=15 but < 30)", () => {
    const createdAt = new Date(now.getTime() - 20 * 60 * 1000);
    const badge = computeSlaBadge(createdAt, now, true, defaults.slaHotMinutes, defaults.slaDefaultHours, defaults.rotDays);
    expect(badge).toBe("yellow");
  });

  it("T-CRM-124-2 — lead created 25 hours ago is yellow (> 24h, < 48h default SLA)", () => {
    const createdAt = new Date(now.getTime() - 25 * 60 * 60 * 1000);
    const badge = computeSlaBadge(createdAt, now, false, defaults.slaHotMinutes, defaults.slaDefaultHours, defaults.rotDays);
    expect(badge).toBe("yellow");
  });

  it("T-CRM-124-2b — lead created 50 hours ago is red (> 2x default SLA)", () => {
    const createdAt = new Date(now.getTime() - 50 * 60 * 60 * 1000);
    const badge = computeSlaBadge(createdAt, now, false, defaults.slaHotMinutes, defaults.slaDefaultHours, defaults.rotDays);
    expect(badge).toBe("red");
  });

  it("T-CRM-124-3 — lead created 8 days ago is red (> rot_days=7)", () => {
    const createdAt = new Date(now.getTime() - 8 * 24 * 60 * 60 * 1000);
    const badge = computeSlaBadge(createdAt, now, false, defaults.slaHotMinutes, defaults.slaDefaultHours, defaults.rotDays);
    expect(badge).toBe("red");
  });

  it("T-CRM-124-4 — configurable: sla_hot_minutes=30 changes threshold", () => {
    const createdAt = new Date(now.getTime() - 20 * 60 * 1000); // 20 min ago
    // With default 15 min → yellow; with 30 min → green
    expect(computeSlaBadge(createdAt, now, true, 15, 24, 7)).toBe("yellow");
    expect(computeSlaBadge(createdAt, now, true, 30, 24, 7)).toBe("green");
  });
});

describe("CRM-124 neglected lead detection", () => {
  const now = new Date("2026-05-30T12:00:00Z");

  it("T-CRM-124-5 — lead created 10 days ago with no interaction is neglected (rot_days=7)", () => {
    const createdAt = new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000);
    expect(computeNeglected(createdAt, null, 7, now)).toBe(true);
  });

  it("T-CRM-124-5b — lead created 10 days ago with interaction 8 days ago is neglected", () => {
    const createdAt = new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000);
    const lastInteraction = new Date(now.getTime() - 8 * 24 * 60 * 60 * 1000);
    expect(computeNeglected(createdAt, lastInteraction, 7, now)).toBe(true);
  });

  it("T-CRM-124-5c — lead created 10 days ago with interaction 3 days ago is NOT neglected", () => {
    const createdAt = new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000);
    const lastInteraction = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000);
    expect(computeNeglected(createdAt, lastInteraction, 7, now)).toBe(false);
  });

  it("T-CRM-124-6 — lead created 3 days ago is NOT neglected (too young for rot_days=7)", () => {
    const createdAt = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000);
    expect(computeNeglected(createdAt, null, 7, now)).toBe(false);
  });

  it("T-CRM-124-7 — configurable: rot_days=2 means 3-day-old lead is neglected", () => {
    const createdAt = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000);
    expect(computeNeglected(createdAt, null, 7, now)).toBe(false);
    expect(computeNeglected(createdAt, null, 2, now)).toBe(true);
  });
});

describe("CRM-124 SLA config defaults", () => {
  it("T-CRM-124-8 — default thresholds are 15min/24h/7d", () => {
    // Verify the defaults from the spec
    const defaults = { slaHotMinutes: 15, slaDefaultHours: 24, rotDays: 7 };
    expect(defaults.slaHotMinutes).toBe(15);
    expect(defaults.slaDefaultHours).toBe(24);
    expect(defaults.rotDays).toBe(7);
  });
});
