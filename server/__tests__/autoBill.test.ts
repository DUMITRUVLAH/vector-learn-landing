/**
 * @vitest-environment node
 * AUTOBILL: recurring-billing engine — INTEGRATION tests (PGlite, all migrations, real code path).
 *
 * Tests the ACTION end-to-end (§3.5.1quater): sets up a real auto-billing contract with a due
 * recurring service and a fully-configured client, runs the ACTUAL runAutoBilling(), and asserts
 * the invoice was created, submitted to (mock) SFS, the PDF emailed, dates advanced, and the
 * contract stamped — plus every skip/guard path (no email, no IDNO, not opted in, idempotency).
 *
 * The Resend EmailProvider is mocked to capture sends (incl. the PDF attachment) without network.
 */
import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import * as fs from "node:fs";
import * as path from "node:path";
import * as schema from "../db/schema/index";
import { tenants, users } from "../db/schema";
import { finParties } from "../db/schema/finParties";
import { finAgreements, finAgreementServices } from "../db/schema/finAgreements";
import { finInvoices } from "../db/schema/finInvoices";
import { finEinvoices, finSfsSettings } from "../db/schema/finEinvoices";
import { eq } from "drizzle-orm";

let testDb: ReturnType<typeof drizzle<typeof schema>>;
let tenantId: string;

vi.mock("../db/client", () => ({ get db() { return testDb; }, closeDb: async () => {} }));

// Capture every email the runner sends (and its PDF attachment) without hitting Resend.
const sentEmails: Array<{ to: string; subject: string; attachments?: Array<{ filename: string; content: Buffer }> }> = [];
vi.mock("../services/messaging/providers", () => ({
  EmailProvider: class {
    async send(opts: { to: string; subject: string; attachments?: Array<{ filename: string; content: Buffer }> }) {
      sentEmails.push(opts);
      return { messageId: "test-msg", status: "sent" as const };
    }
  },
}));

import { runAutoBilling } from "../lib/fin/autoBillRunner";

async function applyMigrations(pg: PGlite) {
  const dir = path.resolve(__dirname, "../../drizzle");
  const j = JSON.parse(fs.readFileSync(path.join(dir, "meta/_journal.json"), "utf8")) as { entries: { idx: number; tag: string }[] };
  for (const e of j.entries.sort((a, b) => a.idx - b.idx))
    for (const s of fs.readFileSync(path.join(dir, `${e.tag}.sql`), "utf8").split("--> statement-breakpoint").map((x) => x.trim()).filter(Boolean))
      await pg.exec(s);
}

const YESTERDAY = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);

async function makeContract(opts: {
  autoBilling: boolean;
  status?: "active" | "paused";
  party?: { idno?: string | null; iban?: string | null; email?: string | null };
  nextBillDate?: string;
}) {
  let partyId: string | null = null;
  if (opts.party !== undefined) {
    const [p] = await testDb
      .insert(finParties)
      .values({
        tenantId,
        name: "BETA CLIENT SRL",
        kind: "client",
        country: "MD",
        idno: opts.party.idno ?? null,
        iban: opts.party.iban ?? null,
        email: opts.party.email ?? null,
      })
      .returning();
    partyId = p.id;
  }
  const [a] = await testDb
    .insert(finAgreements)
    .values({ tenantId, partyId, title: "Chirie birou", status: opts.status ?? "active", currency: "MDL", autoBilling: opts.autoBilling })
    .returning();
  await testDb.insert(finAgreementServices).values({
    agreementId: a.id,
    name: "Chirie lunară",
    billingType: "recurring",
    unitPriceCents: 300000,
    quantity: 1,
    vatPct: 0,
    recurrencePeriod: "monthly",
    nextBillDate: opts.nextBillDate ?? YESTERDAY,
    isActive: true,
  });
  return a.id;
}

beforeAll(async () => {
  const pg = new PGlite();
  await applyMigrations(pg);
  testDb = drizzle(pg, { schema });
  const [t] = await testDb.insert(tenants).values({ name: "Vector", slug: "vector" }).returning();
  tenantId = t.id;
  await testDb.insert(users).values({ tenantId, email: "a@a.md", passwordHash: "x", name: "A", role: "admin" });
  // SFS mock settings so the e-Factura submit path runs without real credentials.
  await testDb.insert(finSfsSettings).values({ tenantId, idno: "1024600035737", bankAccount: "MD87AG000000022516065719", environment: "mock" });
}, 120_000);

beforeEach(() => { sentEmails.length = 0; });

describe("AUTOBILL: happy path — generate + e-Factura + email", () => {
  it("[blocant] bills a ready auto-contract: invoice + einvoice + PDF email + advances dates + stamps", async () => {
    const agreementId = await makeContract({
      autoBilling: true,
      party: { idno: "1009600020033", iban: "MD94AG000000022512036601", email: "client@beta.md" },
    });

    const summary = await runAutoBilling({ tenantId });
    expect(summary.billed).toBe(1);
    const outcome = summary.outcomes.find((o) => o.agreementId === agreementId)!;
    expect(outcome.status).toBe("billed");

    // Invoice created for this agreement
    const invoices = await testDb.select().from(finInvoices).where(eq(finInvoices.agreementId, agreementId));
    expect(invoices).toHaveLength(1);
    expect(invoices[0].totalCents).toBe(300000);

    // e-Factura submitted (mock transport → "sent")
    const einv = await testDb.select().from(finEinvoices).where(eq(finEinvoices.finInvoiceId, invoices[0].id));
    expect(einv).toHaveLength(1);
    expect(outcome.einvoice?.ok).toBe(true);

    // PDF emailed to the client
    expect(sentEmails).toHaveLength(1);
    expect(sentEmails[0].to).toBe("client@beta.md");
    expect(sentEmails[0].attachments?.[0].filename).toContain(".pdf");
    expect(sentEmails[0].attachments?.[0].content.subarray(0, 4).toString()).toBe("%PDF");
    expect(outcome.email?.ok).toBe(true);

    // nextBillDate advanced +1 month; contract stamped
    const svc = await testDb.select().from(finAgreementServices).where(eq(finAgreementServices.agreementId, agreementId));
    expect(svc[0].nextBillDate).not.toBe(YESTERDAY);
    const [ag] = await testDb.select().from(finAgreements).where(eq(finAgreements.id, agreementId));
    expect(ag.autoBilledAt).not.toBeNull();
  });

  it("[blocant] idempotent: a second run in the same period does not double-bill", async () => {
    const agreementId = await makeContract({
      autoBilling: true,
      party: { idno: "1009600020033", iban: "MD94AG000000022512036601", email: "c2@beta.md" },
    });
    await runAutoBilling({ tenantId });
    const first = await testDb.select().from(finInvoices).where(eq(finInvoices.agreementId, agreementId));
    sentEmails.length = 0;
    await runAutoBilling({ tenantId });
    const second = await testDb.select().from(finInvoices).where(eq(finInvoices.agreementId, agreementId));
    expect(second.length).toBe(first.length); // no new invoice
    expect(sentEmails).toHaveLength(0); // no duplicate email
  });
});

describe("AUTOBILL: guards — only opted-in, only due, degrade gracefully", () => {
  it("[blocant] does NOT bill a contract with auto_billing = false", async () => {
    const agreementId = await makeContract({
      autoBilling: false,
      party: { idno: "1009600020033", iban: "MD94AG000000022512036601", email: "x@beta.md" },
    });
    const summary = await runAutoBilling({ tenantId });
    expect(summary.outcomes.find((o) => o.agreementId === agreementId)).toBeUndefined();
    const invoices = await testDb.select().from(finInvoices).where(eq(finInvoices.agreementId, agreementId));
    expect(invoices).toHaveLength(0);
  });

  it("[blocant] client without email → invoice + e-Factura still happen, email skipped with reason", async () => {
    const agreementId = await makeContract({
      autoBilling: true,
      party: { idno: "1009600020033", iban: "MD94AG000000022512036601", email: null },
    });
    const summary = await runAutoBilling({ tenantId });
    const o = summary.outcomes.find((x) => x.agreementId === agreementId)!;
    expect(o.status).toBe("billed"); // invoice created
    expect(o.email?.ok).toBe(false);
    expect(o.email?.reason).toBe("buyer_email_missing");
    expect(sentEmails).toHaveLength(0);
  });

  it("[blocant] client without IDNO → e-Factura skipped with reason (no crash)", async () => {
    const agreementId = await makeContract({
      autoBilling: true,
      party: { idno: null, iban: "MD94AG000000022512036601", email: "noidno@beta.md" },
    });
    const summary = await runAutoBilling({ tenantId });
    const o = summary.outcomes.find((x) => x.agreementId === agreementId)!;
    expect(o.status).toBe("billed");
    expect(o.einvoice?.ok).toBe(false);
    expect(o.einvoice?.reason).toBe("buyer_idno_missing");
  });

  it("does not process a contract whose service is not yet due", async () => {
    const future = new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10);
    const agreementId = await makeContract({
      autoBilling: true,
      party: { idno: "1009600020033", iban: "MD94AG000000022512036601", email: "future@beta.md" },
      nextBillDate: future,
    });
    const summary = await runAutoBilling({ tenantId });
    expect(summary.outcomes.find((o) => o.agreementId === agreementId)).toBeUndefined();
  });
});
