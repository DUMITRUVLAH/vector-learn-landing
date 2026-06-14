/**
 * LEDGER-001: Standard Moldovan SNC Chart of Accounts seed
 *
 * Seeds `fin_ledger_accounts` with the standard plan de conturi (SNC Moldova)
 * for a given tenant. The seed is idempotent — if accounts already exist for the
 * tenant (determined by is_system=true count), the function returns without inserting.
 *
 * Account class legend (SNC Moldova):
 *   A = Activ (Assets — normal debit balance)
 *   P = Pasiv (Liabilities / Equity — normal credit balance)
 *   V = Venituri (Revenue — normal credit balance)
 *   C = Cheltuieli (Expenses — normal debit balance)
 *   B = Bifuncțional (can be either, e.g. adjustments)
 *
 * Account numbering (SNC Moldova):
 *   1xx — Active imobilizate (Long-term assets)
 *   2xx — Active circulante (Current assets — stocks/inventory)
 *   3xx — Creanțe și avansuri (Receivables and advances)
 *   4xx — Investiții pe termen scurt și numerar (Investments & cash)
 *   5xx — Capital propriu (Equity)
 *   6xx — Datorii pe termen lung (Long-term liabilities)
 *   7xx — Datorii pe termen scurt (Short-term liabilities)
 *   8xx — Venituri (Revenue)
 *   9xx — Cheltuieli (Expenses)
 */

import { eq, and, count } from "drizzle-orm";
import { db } from "../db/client";
import {
  finLedgerAccounts,
  type InsertFinLedgerAccount,
} from "../db/schema/finLedger";

// ─── Standard SNC Moldova accounts ───────────────────────────────────────────

type AccountSeed = {
  code: string;
  name: string;
  accountClass: string;
  parentCode?: string;
};

/**
 * Representative accounts from each class.
 * A real implementation would have 200+ accounts; this seed covers
 * the most common ones needed for educational center operations.
 */
export const SNC_ACCOUNTS: AccountSeed[] = [
  // ── 1xx Active imobilizate (Long-term assets) — class A ─────────────
  { code: "111", name: "Imobilizări necorporale", accountClass: "A" },
  { code: "113", name: "Amortizarea imobilizărilor necorporale", accountClass: "A" },
  { code: "121", name: "Imobilizări corporale în curs de execuție", accountClass: "A" },
  { code: "123", name: "Mijloace fixe", accountClass: "A" },
  { code: "124", name: "Amortizarea mijloacelor fixe", accountClass: "A" },

  // ── 2xx Active circulante / Stocuri (Inventory) — class A ───────────
  { code: "211", name: "Materiale", accountClass: "A" },
  { code: "213", name: "Obiecte de mică valoare și scurtă durată", accountClass: "A" },

  // ── 3xx Creanțe (Receivables) — class A ─────────────────────────────
  { code: "221", name: "Creanțe comerciale", accountClass: "A" },
  { code: "225", name: "Creanțe ale personalului", accountClass: "A" },
  { code: "229", name: "Alte creanțe", accountClass: "A" },

  // ── 4xx Numerar (Cash & Bank) — class A ─────────────────────────────
  { code: "241", name: "Casa (numerar)", accountClass: "A" },
  { code: "242", name: "Cont curent în MDL", accountClass: "A" },
  { code: "243", name: "Cont curent în valută", accountClass: "A" },

  // ── 5xx Capital propriu (Equity) — class P ───────────────────────────
  { code: "311", name: "Capital social", accountClass: "P" },
  { code: "321", name: "Capital suplimentar", accountClass: "P" },
  { code: "351", name: "Profit nerepartizat (pierdere neacoperită)", accountClass: "B" },

  // ── 6xx Datorii pe termen lung (Long-term liabilities) — class P ────
  { code: "411", name: "Credite bancare pe termen lung", accountClass: "P" },
  { code: "421", name: "Datorii pe termen lung față de terți", accountClass: "P" },

  // ── 7xx Datorii pe termen scurt (Short-term liabilities) — class P ──
  { code: "521", name: "Datorii comerciale", accountClass: "P" },
  { code: "531", name: "Datorii față de personal", accountClass: "P" },
  { code: "533", name: "Datorii privind asigurările sociale și medicale", accountClass: "P" },
  { code: "534", name: "Datorii față de buget (impozite, taxe)", accountClass: "P" },
  { code: "539", name: "Alte datorii pe termen scurt", accountClass: "P" },

  // ── 8xx Venituri (Revenue) — class V ─────────────────────────────────
  { code: "611", name: "Venituri din vânzări (cursuri, servicii educaționale)", accountClass: "V" },
  { code: "612", name: "Alte venituri din activitatea operațională", accountClass: "V" },
  { code: "621", name: "Venituri din activitatea de investiții", accountClass: "V" },

  // ── 9xx Cheltuieli (Expenses) — class C ──────────────────────────────
  { code: "711", name: "Costul vânzărilor", accountClass: "C" },
  { code: "712", name: "Cheltuieli de distribuire", accountClass: "C" },
  { code: "713", name: "Cheltuieli administrative și de gestiune", accountClass: "C" },
  { code: "714", name: "Alte cheltuieli din activitatea operațională", accountClass: "C" },
  { code: "721", name: "Cheltuieli ale activității de investiții", accountClass: "C" },
  { code: "731", name: "Cheltuieli privind impozitul pe venit", accountClass: "C" },
];

// ─── Seed function ────────────────────────────────────────────────────────────

/**
 * Seed the standard SNC Moldova chart of accounts for a tenant.
 * Idempotent: if system accounts already exist for this tenant, returns without inserting.
 *
 * @param tenantId  The tenant UUID to seed accounts for.
 * @returns         Number of accounts inserted (0 if already seeded).
 */
export async function seedLedgerAccounts(tenantId: string): Promise<number> {
  // Check if already seeded (count of system accounts > 0)
  const [existing] = await db
    .select({ cnt: count() })
    .from(finLedgerAccounts)
    .where(
      and(
        eq(finLedgerAccounts.tenantId, tenantId),
        eq(finLedgerAccounts.isSystem, true)
      )
    );

  if ((existing?.cnt ?? 0) > 0) {
    return 0; // Already seeded — skip
  }

  const rows: InsertFinLedgerAccount[] = SNC_ACCOUNTS.map((acc) => ({
    tenantId,
    code: acc.code,
    name: acc.name,
    accountClass: acc.accountClass,
    parentCode: acc.parentCode ?? null,
    isSystem: true,
    isActive: true,
  }));

  await db.insert(finLedgerAccounts).values(rows).onConflictDoNothing();

  return rows.length;
}
