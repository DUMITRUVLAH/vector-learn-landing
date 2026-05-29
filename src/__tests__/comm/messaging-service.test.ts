/**
 * COMM-201 — MessagingService unit tests
 *
 * T-COMM-201-1: sendMessage happy path → status=sent, row returned
 * T-COMM-201-2: lead with consent_revoked_at → ConsentRevokedError thrown
 * T-COMM-201-3: provider failure → status=failed, error_message persisted
 * T-COMM-201-4: sendMessage without lead → no consent check, sends fine
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  MessagingService,
  ConsentRevokedError,
} from "../../../server/services/messaging";
import type { DB } from "../../../server/db/client";
import type { Message } from "../../../server/db/schema/messages";

// ─── DB mock factory ──────────────────────────────────────────────────────────

function makeMockDb(
  opts: {
    consentRevokedAt?: Date | null;
    insertedId?: string;
  } = {}
) {
  const msgId = opts.insertedId ?? "msg-001";
  const insertedRow: Message = {
    id: msgId,
    tenantId: "tenant-001",
    leadId: null,
    studentId: null,
    direction: "outbound",
    channel: "email",
    toAddress: "test@example.com",
    body: "Test body",
    subject: "Test subject",
    templateId: null,
    status: "queued",
    providerMessageId: null,
    errorMessage: null,
    sentAt: null,
    deliveredAt: null,
    failedAt: null,
    createdAt: new Date(),
  };

  const updatedRow: Message = {
    ...insertedRow,
    status: "sent",
    providerMessageId: "provider-abc",
    sentAt: new Date(),
  };

  const insertReturning = vi.fn().mockResolvedValue([insertedRow]);
  const insertValues = vi.fn().mockReturnValue({ returning: insertReturning });
  const insertFn = vi.fn().mockReturnValue({ values: insertValues });

  const updateReturning = vi.fn().mockResolvedValue([updatedRow]);
  const updateSet = vi.fn().mockReturnValue({ where: vi.fn().mockReturnValue({ returning: updateReturning }) });
  const updateFn = vi.fn().mockReturnValue({ set: updateSet });

  const findFirst = vi.fn().mockResolvedValue(
    opts.consentRevokedAt !== undefined
      ? { consentRevokedAt: opts.consentRevokedAt }
      : null
  );
  const queryLeads = { findFirst };

  return {
    insert: insertFn,
    update: updateFn,
    query: { leads: queryLeads },
    // expose for assertions
    _mocks: { insertValues, insertReturning, updateSet, updateReturning, findFirst, updatedRow },
  } as unknown as DB & { _mocks: Record<string, unknown> };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("COMM-201 — MessagingService", () => {
  /**
   * T-COMM-201-1: happy path — lead without consent issue → status=sent
   */
  it("T-COMM-201-1: sends email and returns sent message", async () => {
    const db = makeMockDb({ consentRevokedAt: null });
    const service = new MessagingService(db);

    const result = await service.sendMessage("tenant-001", {
      channel: "email",
      toAddress: "maria@test.ro",
      body: "Bună ziua!",
      subject: "Test",
      leadId: "lead-001",
    });

    expect(result.status).toBe("sent");
    expect(result.id).toBe("msg-001");
  });

  /**
   * T-COMM-201-2: lead with consent_revoked_at → ConsentRevokedError
   */
  it("T-COMM-201-2: throws ConsentRevokedError when consent is revoked", async () => {
    const db = makeMockDb({ consentRevokedAt: new Date("2026-01-01") });
    const service = new MessagingService(db);

    await expect(
      service.sendMessage("tenant-001", {
        channel: "sms",
        toAddress: "+40771234567",
        body: "Bună ziua!",
        leadId: "lead-revocat",
      })
    ).rejects.toThrow(ConsentRevokedError);
  });

  /**
   * T-COMM-201-3: provider failure → status=failed recorded
   */
  it("T-COMM-201-3: records failed status when provider throws", async () => {
    const db = makeMockDb({ consentRevokedAt: null });
    const service = new MessagingService(db);

    // Override email provider to throw
    // @ts-expect-error — accessing private for test override
    service.emailProvider = {
      send: vi.fn().mockRejectedValue(new Error("SMTP connection refused")),
    };

    // The service should not throw — it should catch and record failed
    // Update mock to return failed row
    const failedRow: Message = {
      id: "msg-001",
      tenantId: "tenant-001",
      leadId: "lead-001",
      studentId: null,
      direction: "outbound",
      channel: "email",
      toAddress: "test@example.com",
      body: "Test",
      subject: null,
      templateId: null,
      status: "failed",
      providerMessageId: null,
      errorMessage: "SMTP connection refused",
      sentAt: null,
      deliveredAt: null,
      failedAt: new Date(),
      createdAt: new Date(),
    };

    const mockDb = db as unknown as { _mocks: Record<string, ReturnType<typeof vi.fn>> };
    mockDb._mocks.updateReturning.mockResolvedValue([failedRow]);

    const result = await service.sendMessage("tenant-001", {
      channel: "email",
      toAddress: "test@example.com",
      body: "Test",
      leadId: "lead-001",
    });

    expect(result.status).toBe("failed");
    expect(result.errorMessage).toBe("SMTP connection refused");
  });

  /**
   * T-COMM-201-4: no lead → no consent check, sends fine
   */
  it("T-COMM-201-4: sends whatsapp without lead (no consent check)", async () => {
    const db = makeMockDb({});
    const service = new MessagingService(db);

    const result = await service.sendMessage("tenant-001", {
      channel: "whatsapp",
      toAddress: "+40771234567",
      body: "Salut!",
      // no leadId
    });

    // findFirst should NOT have been called
    const mockDb = db as unknown as { _mocks: Record<string, ReturnType<typeof vi.fn>> };
    expect(mockDb._mocks.findFirst).not.toHaveBeenCalled();
    expect(result.status).toBe("sent");
  });
});

describe("COMM-201 — ConsentRevokedError", () => {
  it("has correct name and message in Romanian", () => {
    const err = new ConsentRevokedError();
    expect(err.name).toBe("ConsentRevokedError");
    expect(err.message).toContain("blocat");
  });
});
