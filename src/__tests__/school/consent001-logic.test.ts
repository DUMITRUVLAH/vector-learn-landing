/**
 * CONSENT-001 — Unit tests for consent logic
 *
 * T-CONSENT-001-4: sign changes status to signed
 * T-CONSENT-001-5: already-signed → 409
 * T-CONSENT-001-6: empty name → 400
 * T-CONSENT-001-9: dedup on create
 *
 * These tests run pure business logic extracted from the route handlers
 * without a real DB — they model the validation rules.
 */
import { describe, it, expect } from "vitest";

// ─── Pure business logic helpers (extracted from route) ───────────────────────

type ConsentStatus = "pending" | "signed" | "declined";

interface ConsentRequestState {
  status: ConsentStatus;
  signedAt: Date | null;
  signedByName: string | null;
  declinedAt: Date | null;
}

/**
 * Simulates the sign logic from POST /requests/:id/sign
 */
function signRequest(
  req: ConsentRequestState,
  name: string
): { ok: true; updated: ConsentRequestState } | { ok: false; error: string; status: number } {
  if (!name || name.trim() === "") {
    return { ok: false, error: "name_required", status: 400 };
  }
  if (req.status !== "pending") {
    return { ok: false, error: "already_processed", status: 409 };
  }
  return {
    ok: true,
    updated: {
      ...req,
      status: "signed",
      signedAt: new Date(),
      signedByName: name.trim(),
    },
  };
}

/**
 * Simulates the decline logic from POST /requests/:id/decline
 */
function declineRequest(
  req: ConsentRequestState
): { ok: true; updated: ConsentRequestState } | { ok: false; error: string; status: number } {
  if (req.status !== "pending") {
    return { ok: false, error: "already_processed", status: 409 };
  }
  return {
    ok: true,
    updated: {
      ...req,
      status: "declined",
      declinedAt: new Date(),
      signedAt: null,
    },
  };
}

/**
 * Simulates the dedup check from POST /requests (batch create)
 */
function checkDuplicates(
  existing: Array<{ templateId: string; studentId: string; guardianId: string }>,
  incoming: { templateId: string; studentId: string; guardianId: string }
): boolean {
  return existing.some(
    (e) =>
      e.templateId === incoming.templateId &&
      e.studentId === incoming.studentId &&
      e.guardianId === incoming.guardianId
  );
}

// ─── T-CONSENT-001-4: Sign changes status ────────────────────────────────────

describe("signRequest", () => {
  it("[blocant] T-CONSENT-001-4: semnarea cu un nume valid → status signed + signedByName setat", () => {
    const req: ConsentRequestState = {
      status: "pending",
      signedAt: null,
      signedByName: null,
      declinedAt: null,
    };

    const result = signRequest(req, "Ion Popescu");

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.updated.status).toBe("signed");
      expect(result.updated.signedByName).toBe("Ion Popescu");
      expect(result.updated.signedAt).toBeInstanceOf(Date);
    }
  });

  it("[blocant] T-CONSENT-001-6: semnarea cu câmp gol → 400 name_required", () => {
    const req: ConsentRequestState = {
      status: "pending",
      signedAt: null,
      signedByName: null,
      declinedAt: null,
    };

    const result = signRequest(req, "");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe("name_required");
      expect(result.status).toBe(400);
    }
  });

  it("[normal] semnarea cu spații doar → 400 name_required", () => {
    const req: ConsentRequestState = {
      status: "pending",
      signedAt: null,
      signedByName: null,
      declinedAt: null,
    };

    const result = signRequest(req, "   ");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe("name_required");
    }
  });

  it("[blocant] T-CONSENT-001-5: semnare repetată → 409 already_processed", () => {
    const req: ConsentRequestState = {
      status: "signed",
      signedAt: new Date(),
      signedByName: "Ion Popescu",
      declinedAt: null,
    };

    const result = signRequest(req, "Alt Nume");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe("already_processed");
      expect(result.status).toBe(409);
    }
  });

  it("[normal] semnare după refuz → 409 already_processed", () => {
    const req: ConsentRequestState = {
      status: "declined",
      signedAt: null,
      signedByName: null,
      declinedAt: new Date(),
    };

    const result = signRequest(req, "Ion Popescu");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe("already_processed");
    }
  });
});

// ─── Decline logic ─────────────────────────────────────────────────────────────

describe("declineRequest", () => {
  it("[normal] refuzarea unei cereri pending → status declined + declinedAt setat", () => {
    const req: ConsentRequestState = {
      status: "pending",
      signedAt: null,
      signedByName: null,
      declinedAt: null,
    };

    const result = declineRequest(req);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.updated.status).toBe("declined");
      expect(result.updated.declinedAt).toBeInstanceOf(Date);
    }
  });

  it("[normal] refuz după semnare → 409 already_processed", () => {
    const req: ConsentRequestState = {
      status: "signed",
      signedAt: new Date(),
      signedByName: "Ion Popescu",
      declinedAt: null,
    };

    const result = declineRequest(req);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe("already_processed");
    }
  });
});

// ─── T-CONSENT-001-9: Dedup logic ────────────────────────────────────────────

describe("checkDuplicates", () => {
  it("[normal] T-CONSENT-001-9: aceeași combinație (template, student, guardian) → duplicate detectat", () => {
    const existing = [
      { templateId: "t1", studentId: "s1", guardianId: "g1" },
    ];
    const incoming = { templateId: "t1", studentId: "s1", guardianId: "g1" };

    expect(checkDuplicates(existing, incoming)).toBe(true);
  });

  it("[normal] combinație diferită → nu e duplicat", () => {
    const existing = [
      { templateId: "t1", studentId: "s1", guardianId: "g1" },
    ];
    const incoming = { templateId: "t1", studentId: "s1", guardianId: "g2" };

    expect(checkDuplicates(existing, incoming)).toBe(false);
  });

  it("[normal] lista goală → nu e duplicat", () => {
    const existing: Array<{ templateId: string; studentId: string; guardianId: string }> = [];
    const incoming = { templateId: "t1", studentId: "s1", guardianId: "g1" };

    expect(checkDuplicates(existing, incoming)).toBe(false);
  });

  it("[normal] același template + student diferit → nu e duplicat", () => {
    const existing = [
      { templateId: "t1", studentId: "s1", guardianId: "g1" },
    ];
    const incoming = { templateId: "t1", studentId: "s2", guardianId: "g1" };

    expect(checkDuplicates(existing, incoming)).toBe(false);
  });
});
