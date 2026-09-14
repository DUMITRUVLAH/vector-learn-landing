/**
 * PAR-111: Notification service unit tests
 *
 * Test scenarios:
 *   T-PAR-111-1 [blocant] Given submit, Then first approver receives in-app notification
 *   T-PAR-111-2 [blocant] Given final approval (execute_payment), Then finance users notified
 *   T-PAR-111-3 [normal] Given reject, Then requestor receives notification with reason
 *
 * @vitest-environment node
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mocks (must use vi.mock at top level — hoisted by vitest) ───────────────

const mockValues = vi.fn().mockResolvedValue(undefined);
const mockInsertFn = vi.fn().mockReturnValue({ values: mockValues });

const mockSelectChainWhere = vi.fn().mockResolvedValue([]);
const mockSelectChain = {
  from: vi.fn().mockReturnThis(),
  where: mockSelectChainWhere,
};
const mockSelectFn = vi.fn().mockReturnValue(mockSelectChain);

vi.mock("../../../db/client", () => ({
  db: {
    insert: (...args: unknown[]) => mockInsertFn(...args),
    select: (...args: unknown[]) => mockSelectFn(...args),
  },
}));

const mockSendMessage = vi.fn().mockResolvedValue({ status: "sent" });

vi.mock("../../messaging/index", () => ({
  MessagingService: vi.fn().mockImplementation(() => ({
    sendMessage: (...args: unknown[]) => mockSendMessage(...args),
  })),
}));

vi.mock("drizzle-orm", () => ({
  and: vi.fn((...args: unknown[]) => args),
  eq: vi.fn((a: unknown, b: unknown) => `${String(a)}=${String(b)}`),
  inArray: vi.fn((a: unknown, b: unknown) => `${String(a)}_in_${JSON.stringify(b)}`),
  // VM1-07: delegations lookup uses date-range operators.
  gte: vi.fn((a: unknown, b: unknown) => `${String(a)}>=${String(b)}`),
  lte: vi.fn((a: unknown, b: unknown) => `${String(a)}<=${String(b)}`),
}));

import {
  notifySubmitted,
  notifyStepAdvanced,
  notifyFullyApprovedToFinance,
  notifyApprovedToRequestor,
  notifyReapprovalRequired,
  notifyRejected,
  notifyChangesRequested,
  notifyPaid,
} from "../notify";

// ─── Helpers ─────────────────────────────────────────────────────────────────

const ctx = {
  tenantId: "tenant-001",
  parId: "par-001",
  requestNo: "PAR-2026-0001",
};

// ─── T-PAR-111-1: submit → first approver notified ───────────────────────────

describe("PAR-111 notifySubmitted (T-PAR-111-1)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockValues.mockResolvedValue(undefined);
    mockInsertFn.mockReturnValue({ values: mockValues });
    mockSelectChainWhere.mockResolvedValue([]);
    mockSelectChain.from.mockReturnThis();
    mockSelectFn.mockReturnValue(mockSelectChain);
  });

  it("calls db.insert with approver userId when specific approver given", async () => {
    await notifySubmitted(ctx, "user-approver-1");

    expect(mockInsertFn).toHaveBeenCalled();
    const insertArg = mockValues.mock.calls[0][0] as {
      recipientUserId: string;
      kind: string;
      payload: { par_id: string; body: string };
    };
    expect(insertArg.recipientUserId).toBe("user-approver-1");
    expect(insertArg.kind).toBe("par");
    expect(insertArg.payload.par_id).toBe("par-001");
    expect(insertArg.payload.body).toContain("PAR-2026-0001");
    // VM1-08: approver copy is now Romanian ("așteaptă aprobarea ta").
    expect(insertArg.payload.body).toContain("așteaptă aprobarea");
  });

  it("in-app body contains link to /business/par/:id (the real route, not the dead /app/par prefix)", async () => {
    await notifySubmitted(ctx, "user-approver-1");

    const insertArg = mockValues.mock.calls[0][0] as {
      payload: { body: string };
    };
    expect(insertArg.payload.body).toContain(`/business/par/${ctx.parId}`);
  });

  it("does not throw when approverUserId is null (role-based routing)", async () => {
    // select returns [] (no approvers) — should still not throw
    await expect(notifySubmitted(ctx, null)).resolves.not.toThrow();
  });

  // VM1-07: while a delegation approver→delegate is active, the delegate is notified too.
  it("notifies the active delegate of the assigned approver as well", async () => {
    mockSelectChainWhere
      .mockResolvedValueOnce([]) // loadParSummary (parRequests) — runs first
      .mockResolvedValueOnce([{ toUserId: "user-delegate-9" }]) // parDelegations lookup
      .mockResolvedValue([]); // users lookups → no email, in-app only

    await notifySubmitted(ctx, "user-approver-1");

    const recipients = mockValues.mock.calls.map(
      (c) => (c[0] as { recipientUserId: string }).recipientUserId
    );
    expect(recipients).toContain("user-approver-1");
    expect(recipients).toContain("user-delegate-9");
  });
});

// ─── VM1-08: email deep link must be absolute (usable from Gmail/Outlook) ─────

describe("VM1-08 parDeepLink", () => {
  it("builds an absolute hash-routed URL from APP_URL", async () => {
    const { parDeepLink } = await import("../notify");
    const prev = process.env.APP_URL;
    process.env.APP_URL = "https://app.example.md";
    try {
      expect(parDeepLink("par-42")).toBe("https://app.example.md/#/business/par/par-42");
    } finally {
      if (prev === undefined) delete process.env.APP_URL;
      else process.env.APP_URL = prev;
    }
  });

  it("never emits a bare relative path (dead link in email clients)", async () => {
    const { parDeepLink } = await import("../notify");
    expect(parDeepLink("x").startsWith("/")).toBe(false);
    expect(parDeepLink("x")).toContain("/#/business/par/x");
  });
});

// ─── T-PAR-111-2: final approval → finance notified ──────────────────────────

describe("PAR-111 notifyFullyApprovedToFinance (T-PAR-111-2)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockValues.mockResolvedValue(undefined);
    mockInsertFn.mockReturnValue({ values: mockValues });
    mockSelectChainWhere.mockResolvedValue([]);
    mockSelectChain.from.mockReturnThis();
    mockSelectFn.mockReturnValue(mockSelectChain);
  });

  it("resolves without throw when no finance users found", async () => {
    await expect(notifyFullyApprovedToFinance(ctx)).resolves.not.toThrow();
  });

  it("sends in-app notification to each finance user when present", async () => {
    const financeUsers = [{ userId: "finance-user-1" }, { userId: "finance-user-2" }];
    // First select call returns finance users; subsequent calls return []
    mockSelectChainWhere
      .mockResolvedValueOnce(financeUsers) // parMembers for finance role
      .mockResolvedValue([]); // users lookup returns empty → no email

    await notifyFullyApprovedToFinance(ctx);

    const recipientIds = mockValues.mock.calls.map(
      (c) => (c[0] as { recipientUserId: string }).recipientUserId
    );
    expect(recipientIds).toContain("finance-user-1");
    expect(recipientIds).toContain("finance-user-2");
  });
});

// ─── T-PAR-111-3: reject → requestor notified with reason ────────────────────

describe("PAR-111 notifyRejected (T-PAR-111-3)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockValues.mockResolvedValue(undefined);
    mockInsertFn.mockReturnValue({ values: mockValues });
    mockSelectChainWhere.mockResolvedValue([]);
    mockSelectChain.from.mockReturnThis();
    mockSelectFn.mockReturnValue(mockSelectChain);
  });

  it("sends in-app notification to requestor with rejection reason", async () => {
    await notifyRejected(ctx, "user-requestor-1", "Budget not approved");

    const insertArg = mockValues.mock.calls[0][0] as {
      recipientUserId: string;
      payload: { body: string; par_id: string };
    };
    expect(insertArg.recipientUserId).toBe("user-requestor-1");
    expect(insertArg.payload.body).toContain("Budget not approved");
    expect(insertArg.payload.par_id).toBe("par-001");
  });

  it("truncates long rejection comments to 500 chars in the notification body", async () => {
    const longComment = "x".repeat(1000);
    await notifyRejected(ctx, "user-requestor-1", longComment);

    const insertArg = mockValues.mock.calls[0][0] as {
      payload: { body: string };
    };
    // The body should not contain 1000 x's (truncated)
    const bodyX = (insertArg.payload.body.match(/x/g) ?? []).length;
    expect(bodyX).toBeLessThanOrEqual(500);
  });
});

// ─── Additional scenarios ─────────────────────────────────────────────────────

describe("PAR-111 notifyChangesRequested", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockValues.mockResolvedValue(undefined);
    mockInsertFn.mockReturnValue({ values: mockValues });
    mockSelectChainWhere.mockResolvedValue([]);
    mockSelectChain.from.mockReturnThis();
    mockSelectFn.mockReturnValue(mockSelectChain);
  });

  it("sends notification to requestor with changes comment", async () => {
    await notifyChangesRequested(ctx, "user-requestor-1", "Add more detail to line 1");

    const insertArg = mockValues.mock.calls[0][0] as {
      recipientUserId: string;
      payload: { body: string };
    };
    expect(insertArg.recipientUserId).toBe("user-requestor-1");
    expect(insertArg.payload.body).toContain("Add more detail to line 1");
  });
});

describe("PAR-111 notifyPaid", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockValues.mockResolvedValue(undefined);
    mockInsertFn.mockReturnValue({ values: mockValues });
    mockSelectChainWhere.mockResolvedValue([]);
    mockSelectChain.from.mockReturnThis();
    mockSelectFn.mockReturnValue(mockSelectChain);
  });

  it("notifies requestor when PAR is paid", async () => {
    await notifyPaid(ctx, "user-requestor-1");

    const insertArg = mockValues.mock.calls[0][0] as {
      recipientUserId: string;
      payload: { body: string };
    };
    expect(insertArg.recipientUserId).toBe("user-requestor-1");
    // Copy-ul e în română („a fost achitată"), la fel ca restul notificărilor PAR.
    expect(insertArg.payload.body).toContain("a fost achitată");
  });
});

describe("PAR-111 notifyStepAdvanced", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockValues.mockResolvedValue(undefined);
    mockInsertFn.mockReturnValue({ values: mockValues });
    mockSelectChainWhere.mockResolvedValue([]);
    mockSelectChain.from.mockReturnThis();
    mockSelectFn.mockReturnValue(mockSelectChain);
  });

  it("sends notification to next approver when specific user assigned", async () => {
    await notifyStepAdvanced(ctx, "user-approver-2", "Executive Director");

    const insertArg = mockValues.mock.calls[0][0] as {
      recipientUserId: string;
      payload: { body: string };
    };
    expect(insertArg.recipientUserId).toBe("user-approver-2");
    expect(insertArg.payload.body).toContain("Executive Director");
  });

  it("does not throw when next approver is null (role-based)", async () => {
    await expect(notifyStepAdvanced(ctx, null, "Executive Director")).resolves.not.toThrow();
  });
});

/**
 * Regression (2026-08-28): emailul conținea DOUĂ linkuri — calea relativă din corpul
 * notificării in-app („Link: /business/par/<id>", moartă în orice client de mail) plus
 * linkul absolut. Destinatarul vedea întâi cel care nu funcționează.
 */
describe("stripInAppLink — calea relativă nu ajunge în email", () => {
  it("scoate „Link: /business/par/<id>” din corpul preluat de la notificarea in-app", async () => {
    const { stripInAppLink } = await import("../notify");

    expect(
      stripInAppLink("PAR PAR-2026-0003 a fost achitată. Link: /business/par/675c33af-b475-463f-9f4e-23becff5c694")
    ).toBe("PAR PAR-2026-0003 a fost achitată.");
  });

  it("lasă neatins un corp fără cale relativă", async () => {
    const { stripInAppLink } = await import("../notify");

    expect(stripInAppLink("PAR PAR-2026-0003 a fost respinsă. Motiv: lipsă factură")).toBe(
      "PAR PAR-2026-0003 a fost respinsă. Motiv: lipsă factură"
    );
  });
});

/**
 * Notificările de rezultat spuneau doar „PAR PAR-2026-0026 a fost aprobată" — numărul cererii
 * nu e informație pentru om, așa că destinatarul trebuia să deschidă aplicația ca să afle
 * despre CE plată e vorba. Acum prima propoziție poartă motivul, beneficiarul și suma, iar
 * emailul are și blocul de detalii.
 */
describe("notificări informative — suma, beneficiarul și motivul în prima propoziție", () => {
  const parRow = {
    totalEstimatedCents: 1250000,
    currency: "MDL",
    endUse: "chirie birou august",
    purpose: "execute_payment",
    payeeName: "ACME SRL",
    vendorId: null,
    projectId: null,
    eventId: null,
    budgetCodeId: null,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockValues.mockResolvedValue(undefined);
    mockInsertFn.mockReturnValue({ values: mockValues });
    mockSelectChain.from.mockReturnThis();
    mockSelectFn.mockReturnValue(mockSelectChain);
    mockSendMessage.mockResolvedValue({ status: "sent" });
    // 1) loadParFacts (par_requests) 2) getUser 3) accountFooter (tenants)
    mockSelectChainWhere
      .mockResolvedValueOnce([parRow])
      .mockResolvedValueOnce([{ name: "Ion", email: "ion@example.md" }])
      .mockResolvedValue([{ name: "ATIC" }]);
  });

  const emailArg = () => mockSendMessage.mock.calls[0][1] as { subject: string; body: string };

  it("aprobare: in-app și email spun pentru ce, către cine și cât", async () => {
    await notifyApprovedToRequestor(ctx, "user-requestor-1");

    const inApp = (mockValues.mock.calls[0][0] as { payload: { body: string } }).payload.body;
    expect(inApp).toContain("Plata pentru chirie birou august către ACME SRL în sumă de");
    expect(inApp).toContain("a fost aprobată");
    expect(inApp).toContain("cererea PAR-2026-0001");

    const email = emailArg();
    expect(email.subject).toContain("aprobată");
    expect(email.subject).toContain("ACME SRL");
    expect(email.body).toContain("Detalii plată:");
    expect(email.body).toContain("• Către: ACME SRL");
    expect(email.body).toContain("• Motiv: chirie birou august");
    // linkul relativ din corpul in-app nu ajunge în email
    expect(email.body).not.toContain("Link: /business/par/");
    expect(email.body).toContain("Deschide cererea: ");
  });

  it("respingere: păstrează motivul respingerii pe lângă descrierea plății", async () => {
    await notifyRejected(ctx, "user-requestor-1", "lipsește oferta a doua");

    const email = emailArg();
    expect(email.body).toContain("a fost RESPINSĂ");
    expect(email.body).toContain("Motiv: lipsește oferta a doua");
    expect(email.body).toContain("• Sumă: ");
  });

  it("plată executată: folosește suma chiar achitată, nu estimarea", async () => {
    await notifyPaid(ctx, "user-requestor-1", { actualAmountCents: 1300000 });

    const inApp = (mockValues.mock.calls[0][0] as { payload: { body: string } }).payload.body;
    expect(inApp).toContain("13.000,00 MDL");
    expect(inApp).toContain("a fost achitată");

    const email = emailArg();
    // blocul de detalii arată ambele sume când diferă de estimare
    expect(email.body).toContain("• Sumă: 12.500,00 MDL");
    expect(email.body).toContain("• Sumă achitată: 13.000,00 MDL");
  });

  it("cade înapoi pe numărul cererii când datele nu pot fi citite", async () => {
    mockSelectChainWhere.mockReset();
    mockSelectChainWhere.mockResolvedValue([]);

    await notifyApprovedToRequestor(ctx, "user-requestor-1");

    const inApp = (mockValues.mock.calls[0][0] as { payload: { body: string } }).payload.body;
    expect(inApp).toContain("Cererea PAR-2026-0001 a fost aprobată.");
  });
});

/**
 * Re-aprobarea (plata a depășit estimarea cu >10%) era singura notificare PAR fără email și
 * scrisă în engleză: aprobatorul care trebuie să decidă afla doar dacă intra în aplicație.
 */
describe("notifyReapprovalRequired — ambele sume, în email, nu doar in-app", () => {
  const parRow = {
    totalEstimatedCents: 1250000,
    currency: "MDL",
    endUse: "chirie birou august",
    purpose: "execute_payment",
    payeeName: "ACME SRL",
    vendorId: null,
    projectId: null,
    eventId: null,
    budgetCodeId: null,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockValues.mockResolvedValue(undefined);
    mockInsertFn.mockReturnValue({ values: mockValues });
    mockSelectChain.from.mockReturnThis();
    mockSelectFn.mockReturnValue(mockSelectChain);
    mockSendMessage.mockResolvedValue({ status: "sent" });
    mockSelectChainWhere
      .mockResolvedValueOnce([parRow])
      .mockResolvedValueOnce([{ name: "Ana", email: "ana@example.md" }])
      .mockResolvedValue([{ name: "ATIC" }]);
  });

  it("spune ce s-a achitat și cu cât s-a depășit estimarea", async () => {
    await notifyReapprovalRequired(ctx, "user-approver-1", {
      estimatedCents: 1250000,
      actualAmountCents: 1400000,
    });

    const inApp = (mockValues.mock.calls[0][0] as { payload: { body: string } }).payload.body;
    expect(inApp).toContain("Plata pentru chirie birou august către ACME SRL");
    expect(inApp).toContain("necesită re-aprobare");
    expect(inApp).toContain("s-a achitat 14.000,00 MDL");
    expect(inApp).toContain("cu 1.500,00 MDL peste estimare");

    const email = mockSendMessage.mock.calls[0][1] as { subject: string; body: string };
    expect(email.subject).toContain("re-aprobare necesară");
    expect(email.body).toContain("• Sumă: 12.500,00 MDL");
    expect(email.body).toContain("• Sumă achitată: 14.000,00 MDL");
    expect(email.body).toContain("Deschide cererea: ");
  });
});

// ─── VM5-13: digestul ÎNLOCUIEȘTE emailurile per-cerere ───────────────────────
//
// Owner-ul, 14.09.2026: „digestul înlocuiește cele instantanee; doar cele urgente trec și se scrie
// că-i urgent". Până acum mergeau amândouă — emailul per cerere ȘI digestul de 09:00/16:00 — iar
// subsolul digestului promitea deja „un singur email cu toate cererile, de două ori pe zi".

describe("VM5-13 emailul de aprobare pleacă doar pentru urgențe", () => {
  const parRow = (o: Partial<Record<string, unknown>> = {}) => ({
    totalEstimatedCents: 1250000,
    currency: "MDL",
    endUse: "chirie birou august",
    purpose: "execute_payment",
    payeeName: "ACME SRL",
    vendorId: null,
    projectId: null,
    eventId: null,
    budgetCodeId: null,
    isUrgent: false,
    requestedByUserId: "user-solicitant",
    ...o,
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mockValues.mockResolvedValue(undefined);
    mockInsertFn.mockReturnValue({ values: mockValues });
    mockSelectChain.from.mockReturnThis();
    mockSelectFn.mockReturnValue(mockSelectChain);
    mockSendMessage.mockResolvedValue({ status: "sent" });
  });

  it("cerere normală → notificare in-app, ZERO email (o preia digestul)", async () => {
    mockSelectChainWhere
      .mockResolvedValueOnce([parRow()])
      .mockResolvedValueOnce([]) // delegări
      .mockResolvedValue([{ id: "user-approver-1", name: "Ana", email: "ana@example.md" }]);

    await notifySubmitted(ctx, "user-approver-1");

    expect(mockInsertFn).toHaveBeenCalled(); // in-app rămâne instant
    expect(mockSendMessage).not.toHaveBeenCalled(); // emailul NU mai pleacă acum
  });

  it("cerere urgentă → emailul pleacă acum, cu URGENT în subiect", async () => {
    mockSelectChainWhere
      .mockResolvedValueOnce([parRow({ isUrgent: true })])
      .mockResolvedValueOnce([]) // delegări
      .mockResolvedValue([{ id: "user-approver-1", name: "Ana", email: "ana@example.md" }]);

    await notifySubmitted(ctx, "user-approver-1");

    expect(mockSendMessage).toHaveBeenCalledTimes(1);
    const email = mockSendMessage.mock.calls[0][1] as { subject: string; body: string };
    expect(email.subject).toContain("URGENT");
    // Corpul spune DE CE a venit în afara digestului — altfel omul crede că regula s-a stricat.
    expect(email.body).toContain("09:00");
  });

  it("finanțele primesc tot digest, nu un email per cerere aprobată", async () => {
    mockSelectChainWhere
      .mockResolvedValueOnce([{ userId: "user-finance-1" }]) // getFinanceUsers
      .mockResolvedValueOnce([parRow()]) // loadParFacts
      .mockResolvedValue([{ name: "Ion", email: "ion@example.md" }]);

    await notifyFullyApprovedToFinance(ctx);

    expect(mockInsertFn).toHaveBeenCalled();
    expect(mockSendMessage).not.toHaveBeenCalled();
  });

  it("dar o cerere URGENTĂ aprobată ajunge la finanțe pe loc", async () => {
    mockSelectChainWhere
      .mockResolvedValueOnce([{ userId: "user-finance-1" }])
      .mockResolvedValueOnce([parRow({ isUrgent: true })])
      .mockResolvedValue([{ name: "Ion", email: "ion@example.md" }]);

    await notifyFullyApprovedToFinance(ctx);

    const email = mockSendMessage.mock.calls[0][1] as { subject: string };
    expect(email.subject).toContain("URGENT");
  });

  it("respingerea rămâne instantanee — nu e o sarcină care poate aștepta 8 ore", async () => {
    mockSelectChainWhere
      .mockResolvedValueOnce([parRow()])
      .mockResolvedValue([{ name: "Ana", email: "ana@example.md" }]);

    await notifyRejected(ctx, "user-solicitant", "lipsesc devizele");

    expect(mockSendMessage).toHaveBeenCalled();
  });
});

// ─── VM5-13: solicitantul nu se notifică pe sine ─────────────────────────────

describe("VM5-13 solicitantul nu primește „aprobă-ți propria cerere”", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockValues.mockResolvedValue(undefined);
    mockInsertFn.mockReturnValue({ values: mockValues });
    mockSelectChain.from.mockReturnThis();
    mockSelectFn.mockReturnValue(mockSelectChain);
    mockSendMessage.mockResolvedValue({ status: "sent" });
  });

  it("rutarea pe rol îl sare pe cel care a depus cererea", async () => {
    // Cazul real: un aprobator depune o cerere. La trimitere, pasul lui se deblochează de pe nume
    // (sanitizarea anti-auto-aprobare din submit.ts), cade pe rutare pe rol, iar rutarea pe rol îl
    // includea înapoi — primea „așteaptă aprobarea ta" pe o cerere pe care segregarea sarcinilor
    // îl împiedică oricum s-o aprobe.
    mockSelectChainWhere
      .mockResolvedValueOnce([
        {
          totalEstimatedCents: 500000, currency: "MDL", endUse: "laptopuri",
          purpose: "execute_payment", payeeName: "ACME", vendorId: null, projectId: null,
          eventId: null, budgetCodeId: null, isUrgent: false,
          requestedByUserId: "user-solicitant",
        },
      ])
      .mockResolvedValueOnce([{ userId: "user-solicitant" }, { userId: "user-altcineva" }])
      .mockResolvedValue([{ id: "user-altcineva", name: "Ana", email: "ana@example.md" }]);

    await notifySubmitted(ctx, null);

    const recipients = mockValues.mock.calls.map(
      (c) => (c[0] as { recipientUserId: string }).recipientUserId
    );
    expect(recipients).not.toContain("user-solicitant");
    expect(recipients).toContain("user-altcineva");
  });
});
