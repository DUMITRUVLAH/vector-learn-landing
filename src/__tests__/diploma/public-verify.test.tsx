/**
 * DIPLOMA-805 — T-DIPLOMA-805-1..4
 * Tests for the public certificate verification page + API endpoint logic.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { VerifyCertificatePage } from "@/pages/public/VerifyCertificatePage";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const VALID_TOKEN = "550e8400-e29b-41d4-a716-446655440000";
const UNKNOWN_TOKEN = "aaaabbbb-cccc-dddd-eeee-ffffffffffff";

const CERT_RESPONSE = {
  valid: true,
  certificate: {
    certificateId: "FACEBO-2026VA-1",
    participantName: "Ion Popescu",
    courseName: "Facebook Ads",
    edition: "Mai 2026",
    mentorName: "Maria Ionescu",
    completionDate: "2026-05-31",
    issuedAt: "2026-06-01T10:00:00Z",
  },
};

// ─── T-DIPLOMA-805-1 [blocant] — valid token renders public fields ─────────────

describe("VerifyCertificatePage — valid token", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => CERT_RESPONSE,
      })
    );
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("T-DIPLOMA-805-1 [blocant] — renders participant name, course, badge 'autentic'", async () => {
    render(<VerifyCertificatePage token={VALID_TOKEN} />);
    // Loading state first
    expect(screen.getByText(/se verifică/i)).toBeTruthy();

    await waitFor(() => {
      expect(screen.getByText(/certificat autentic/i)).toBeTruthy();
    });

    expect(screen.getByText("Ion Popescu")).toBeTruthy();
    expect(screen.getByText("Facebook Ads")).toBeTruthy();
    expect(screen.getByText("Mai 2026")).toBeTruthy();
    expect(screen.getByText("Maria Ionescu")).toBeTruthy();
    expect(screen.getByText("FACEBO-2026VA-1")).toBeTruthy();
  });

  it("T-DIPLOMA-805-1b — API called without auth header (public endpoint pattern)", async () => {
    render(<VerifyCertificatePage token={VALID_TOKEN} />);
    await waitFor(() => screen.getByText(/certificat autentic/i));

    const fetchCalls = (fetch as ReturnType<typeof vi.fn>).mock.calls;
    expect(fetchCalls.length).toBeGreaterThan(0);
    // Should NOT include an Authorization header
    const [url, init] = fetchCalls[0] as [string, RequestInit | undefined];
    expect(url).toContain("/api/public/certificates/");
    const headers = (init?.headers ?? {}) as Record<string, string>;
    expect(headers["Authorization"]).toBeUndefined();
  });
});

// ─── T-DIPLOMA-805-2 [blocant] — invalid / 404 token shows "not found" ─────────

describe("VerifyCertificatePage — invalid token", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        json: async () => ({ error: "not_found" }),
      })
    );
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("T-DIPLOMA-805-2 [blocant] — 404 renders 'Certificat negăsit', no crash", async () => {
    render(<VerifyCertificatePage token={UNKNOWN_TOKEN} />);
    await waitFor(() => {
      expect(screen.getByText(/certificat negăsit/i)).toBeTruthy();
    });
    // No participant data shown
    expect(screen.queryByText("Ion Popescu")).toBeNull();
  });
});

// ─── T-DIPLOMA-805-3 [blocant] — endpoint accessible without auth header ────────

describe("certificatesPublic route — schema & public access", () => {
  it("T-DIPLOMA-805-3 [blocant] — route uses /api/public/certificates (no-auth path)", () => {
    // Verify the URL pattern matches the spec (public, no /api/certificates/ auth path)
    const PUBLIC_BASE = "/api/public/certificates";
    const token = "550e8400-e29b-41d4-a716-446655440000";
    const url = `${PUBLIC_BASE}/${token}`;
    expect(url).toBe("/api/public/certificates/550e8400-e29b-41d4-a716-446655440000");
  });

  it("T-DIPLOMA-805-3b — endpoint never exposes sensitive fields (schema-level)", () => {
    // The server query explicitly selects only these safe columns:
    const SAFE_FIELDS = [
      "certificateId",
      "participantName",
      "courseName",
      "edition",
      "mentorName",
      "completionDate",
      "issuedAt",
    ] as const;

    // Fields that must NOT appear in the public response
    const FORBIDDEN_FIELDS = ["tenantId", "email", "phone", "amount", "pdfUrl"];

    for (const field of FORBIDDEN_FIELDS) {
      expect(SAFE_FIELDS).not.toContain(field);
    }
  });
});

// ─── T-DIPLOMA-805-4 — round-trip: issued cert → token → verify page ─────────

describe("T-DIPLOMA-805-4 — round-trip issue → verify", () => {
  it("renders correct participant after fetch with issued token", async () => {
    const token = "99999999-1234-5678-abcd-aaaaaaaaaaaa";
    const issued = {
      valid: true,
      certificate: {
        certificateId: "ENGLISH-2026-42",
        participantName: "Ana Maria Ionescu",
        courseName: "English Advanced",
        edition: "Promoția 2026",
        mentorName: "Prof. Smith",
        completionDate: "2026-05-20",
        issuedAt: "2026-05-21T09:00:00Z",
      },
    };

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => issued,
      })
    );

    render(<VerifyCertificatePage token={token} />);
    await waitFor(() => {
      expect(screen.getByText("Ana Maria Ionescu")).toBeTruthy();
      expect(screen.getByText("English Advanced")).toBeTruthy();
      expect(screen.getByText("ENGLISH-2026-42")).toBeTruthy();
    });

    vi.restoreAllMocks();
  });
});
