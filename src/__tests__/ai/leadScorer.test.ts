/**
 * AI-A03 — Tests for lead qualifier and reply draft API
 * T-AI-A03-2: qualifyLead scoring rules
 * T-AI-A03-3: POST /api/ai/qualify-leads returns updated
 * T-AI-A03-4: POST /api/ai/reply-suggestion returns draft
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { qualifyLead } from "../../../server/lib/ai/leadScorer";

// Mock fetch for API client tests
const mockFetch = vi.fn();
global.fetch = mockFetch;

function mockApiResponse<T>(data: T, status = 200) {
  mockFetch.mockResolvedValueOnce({
    ok: status < 400,
    status,
    json: async () => data,
  } as Response);
}

// ─── Pure qualifying logic ────────────────────────────────────────────────────

describe("AI-A03: leadScorer pure logic", () => {
  const now = new Date();
  const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
  const threeDaysAgo = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000);
  const tenDaysAgo = new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000);

  it("T-AI-A03-2: hot: recent + organic source + contact info", () => {
    const q = qualifyLead({
      source: "webform",
      phone: "+40799123456",
      email: "test@email.com",
      interestCourse: "Engleză B2",
      createdAt: oneHourAgo,
      score: null,
    });
    expect(q).toBe("hot");
  });

  it("T-AI-A03-2: hot: all fields filled + recent", () => {
    const q = qualifyLead({
      source: "manual",
      phone: "+40799123456",
      email: "test@email.com",
      interestCourse: "Engleză",
      createdAt: threeDaysAgo,
      score: null,
    });
    expect(q).toBe("hot");
  });

  it("T-AI-A03-2: warm: recent + has contact", () => {
    const q = qualifyLead({
      source: "other",
      phone: "+40799123456",
      email: null,
      interestCourse: null,
      createdAt: threeDaysAgo,
      score: null,
    });
    expect(q).toBe("warm");
  });

  it("T-AI-A03-2: cold: old lead with no contact", () => {
    const q = qualifyLead({
      source: "other",
      phone: null,
      email: null,
      interestCourse: null,
      createdAt: tenDaysAgo,
      score: null,
    });
    expect(q).toBe("cold");
  });

  it("T-AI-A03-2: uses existing score when available (hot)", () => {
    const q = qualifyLead({
      source: "other",
      phone: null,
      email: null,
      interestCourse: null,
      createdAt: tenDaysAgo,
      score: 80, // override: high score = hot
    });
    expect(q).toBe("hot");
  });

  it("T-AI-A03-2: uses existing score warm (40-69)", () => {
    const q = qualifyLead({
      source: "other",
      phone: null,
      email: null,
      interestCourse: null,
      createdAt: tenDaysAgo,
      score: 55,
    });
    expect(q).toBe("warm");
  });

  it("T-AI-A03-2: uses existing score cold (<40)", () => {
    const q = qualifyLead({
      source: "other",
      phone: null,
      email: null,
      interestCourse: null,
      createdAt: tenDaysAgo,
      score: 20,
    });
    expect(q).toBe("cold");
  });
});

// ─── API client tests ─────────────────────────────────────────────────────────

describe("AI-A03: lead qualification API client", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("T-AI-A03-3: qualifyAllLeads returns updated count", async () => {
    const { qualifyAllLeads } = await import("../../lib/api/ai");

    mockApiResponse({ updated: 12 });

    const result = await qualifyAllLeads();
    expect(result.updated).toBe(12);
  });

  it("T-AI-A03-4: getReplyDraft returns draft string", async () => {
    const { getReplyDraft } = await import("../../lib/api/ai");

    mockApiResponse({
      draft: "Bună ziua! Vă contactăm în scurt timp.",
      auditId: "audit-456",
      isStub: true,
    });

    const result = await getReplyDraft({
      messageText: "Care sunt prețurile?",
    });

    expect(typeof result.draft).toBe("string");
    expect(result.draft.length).toBeGreaterThan(0);
    expect(typeof result.auditId).toBe("string");
  });

  it("T-AI-A03-4: getReplyDraft returns 200 with valid body shape", async () => {
    const { getReplyDraft } = await import("../../lib/api/ai");

    mockApiResponse({
      draft: "Răspuns AI stub.",
      auditId: "audit-789",
      isStub: false,
    });

    const result = await getReplyDraft({
      leadId: "00000000-0000-0000-0000-000000000001",
      messageText: "Cât durează cursul?",
      conversationHistory: ["Bună ziua!"],
    });

    // T-AI-A03-4: shape check
    expect(result).toHaveProperty("draft");
    expect(result).toHaveProperty("auditId");
    expect(result).toHaveProperty("isStub");
  });
});
