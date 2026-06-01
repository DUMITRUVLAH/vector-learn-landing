/**
 * AI-A01 — Tests for lesson summary API client and pseudonymize integration
 * T-AI-A01-2: lesson summary API returns expected shape
 * T-AI-A01-4: audit-log returns array (portability)
 * T-AI-A01-6: approve endpoint returns messageId
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock fetch globally for API client tests
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Helper: mock a successful API response
function mockApiResponse<T>(data: T, status = 200) {
  mockFetch.mockResolvedValueOnce({
    ok: status < 400,
    status,
    json: async () => data,
  } as Response);
}

describe("AI-A01: lesson summary API client", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("T-AI-A01-2: generateLessonSummary maps response correctly", async () => {
    const { generateLessonSummary } = await import("../../lib/api/ai");

    mockApiResponse({
      summary: "Elevul a progresat bine la lecție.",
      auditId: "audit-123",
      model: "stub",
      isStub: true,
      pseudonymized: true,
    });

    const result = await generateLessonSummary({
      teacherNotes: "Lecție vocabular. Progres bun.",
      studentName: "Maria Popescu",
    });

    expect(result.summary).toBe("Elevul a progresat bine la lecție.");
    expect(result.auditId).toBe("audit-123");
    expect(result.pseudonymized).toBe(true);
  });

  it("T-AI-A01-6: approveLessonSummary returns approved=true", async () => {
    const { approveLessonSummary } = await import("../../lib/api/ai");

    mockApiResponse({
      messageId: "draft-12345",
      approved: true,
      note: "Sumar aprobat.",
    });

    const result = await approveLessonSummary("audit-123", "Sumar editat.");

    expect(result.approved).toBe(true);
    expect(typeof result.messageId).toBe("string");
  });

  it("T-AI-A01-4: listAiAuditLog returns an array (portability check)", async () => {
    const { listAiAuditLog } = await import("../../lib/api/ai");

    // API should return plain array, not { rows: [...] }
    mockApiResponse([
      {
        id: "entry-1",
        action: "lesson_summary",
        model: "stub",
        promptTokens: 0,
        completionTokens: 0,
        costUsdMicro: 0,
        pseudonymized: true,
        status: "completed",
        entityType: "lesson",
        entityId: null,
        note: null,
        createdAt: new Date().toISOString(),
      },
    ]);

    const result = await listAiAuditLog({ limit: 10 });
    // T-AI-A01-4: must be array (not .rows wrapper)
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBe(1);
    expect(result[0].action).toBe("lesson_summary");
  });

  it("throws on HTTP error", async () => {
    const { generateLessonSummary } = await import("../../lib/api/ai");

    mockApiResponse({ error: "unauthenticated" }, 401);

    await expect(
      generateLessonSummary({ teacherNotes: "Test" })
    ).rejects.toThrow();
  });
});
