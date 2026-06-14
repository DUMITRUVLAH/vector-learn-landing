/**
 * BANKLINK-001: Seed demo bank connections and transactions for development
 *
 * Creates:
 *   - 2 bank connections (MAIB + Moldindconbank)
 *   - 5 transactions (various statuses: unmatched, matched, ignored)
 *
 * Idempotent: skips if connections already exist for the tenant.
 */

import { db } from "../db/client";
import { eq, count } from "drizzle-orm";
import { finBankConnections, finBankTransactions } from "../db/schema/finBankLink";

export async function seedBankLink(tenantId: string): Promise<{
  connectionsInserted: number;
  transactionsInserted: number;
}> {
  // Check if already seeded
  const [{ cnt }] = await db
    .select({ cnt: count() })
    .from(finBankConnections)
    .where(eq(finBankConnections.tenantId, tenantId));

  if (Number(cnt) > 0) {
    return { connectionsInserted: 0, transactionsInserted: 0 };
  }

  // Insert 2 bank connections
  const inserted = await db
    .insert(finBankConnections)
    .values([
      {
        tenantId,
        name: "BC Maib — Cont curent MDL",
        bankCode: "MAIB",
        accountIban: "MD00AGRNMD0X000000000000000",
        currency: "MDL",
        importFormat: "OFX",
        isActive: true,
      },
      {
        tenantId,
        name: "Moldindconbank — Cont EUR",
        bankCode: "MOBIASBANCA",
        accountIban: "MD00MOBNMD0X000000000000001",
        currency: "EUR",
        importFormat: "MT940",
        isActive: true,
      },
    ])
    .returning({ id: finBankConnections.id, name: finBankConnections.name });

  const [conn1, conn2] = inserted;

  // Insert 5 transactions
  await db.insert(finBankTransactions).values([
    {
      bankConnectionId: conn1.id,
      tenantId,
      externalId: "DEMO-OFX-001",
      transactionDate: "2026-06-01",
      valueDate: "2026-06-01",
      amountCents: 150_000, // +1500 MDL credit
      currency: "MDL",
      description: "Plata cursuri engleza — Maria Ionescu",
      counterpartyName: "Maria Ionescu",
      reference: "REF001",
      status: "unmatched",
    },
    {
      bankConnectionId: conn1.id,
      tenantId,
      externalId: "DEMO-OFX-002",
      transactionDate: "2026-06-05",
      valueDate: "2026-06-05",
      amountCents: 200_000, // +2000 MDL
      currency: "MDL",
      description: "Plata abonament — Popescu Ion",
      counterpartyName: "Popescu Ion",
      reference: "REF002",
      status: "matched",
      matchedSourceType: "payment",
    },
    {
      bankConnectionId: conn1.id,
      tenantId,
      externalId: "DEMO-OFX-003",
      transactionDate: "2026-06-10",
      valueDate: "2026-06-10",
      amountCents: -50_000, // -500 MDL debit (expense)
      currency: "MDL",
      description: "Comision bancar lunar",
      counterpartyName: "BC Maib",
      reference: "COM-LUNAR",
      status: "ignored",
    },
    {
      bankConnectionId: conn2.id,
      tenantId,
      externalId: "DEMO-MT940-001",
      transactionDate: "2026-06-03",
      valueDate: "2026-06-03",
      amountCents: 50_00, // +50 EUR (5000 EUR-cents)
      currency: "EUR",
      description: "Transfer curs intensiv — Müller Hans",
      counterpartyName: "Müller Hans",
      reference: "MT940-REF-001",
      status: "unmatched",
    },
    {
      bankConnectionId: conn2.id,
      tenantId,
      externalId: "DEMO-MT940-002",
      transactionDate: "2026-06-12",
      valueDate: "2026-06-12",
      amountCents: 100_00, // +100 EUR
      currency: "EUR",
      description: "Inscriere curs programare — Schmidt Anna",
      counterpartyName: "Schmidt Anna",
      reference: "MT940-REF-002",
      status: "unmatched",
    },
  ]);

  return { connectionsInserted: 2, transactionsInserted: 5 };
}
