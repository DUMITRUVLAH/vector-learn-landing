/**
 * EXPORT-001: Generator SAF-T RO simplificat (XML).
 *
 * Structură minimă implementată (OECD SAF-T pentru România):
 *   <AuditFile xmlns="urn:StandardAuditFile-Taxation-Financial:RO">
 *     <Header>...</Header>
 *     <MasterFiles>
 *       <GeneralLedgerAccounts>
 *         <Account>...</Account>
 *       </GeneralLedgerAccounts>
 *     </MasterFiles>
 *     <GeneralLedgerEntries>
 *       <Journal>...</Journal>
 *     </GeneralLedgerEntries>
 *   </AuditFile>
 *
 * Fără librărie XML externă — generare cu template strings.
 * SAF-T complet (SchemaVersion 2.0) este mult mai complex;
 * acesta este un subset funcțional pentru import în sisteme contabile.
 */

/** Scapă caractere speciale XML */
function xmlEscape(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "";
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/** Formatează cenți în lei ca string cu 2 zecimale */
function fmtAmount(cents: number): string {
  return (cents / 100).toFixed(2);
}

export interface SaftAccount {
  code: string;
  name: string;
  /** SNC class: 1–9 */
  class?: string | number | null;
}

export interface SaftJournalEntry {
  entryId: string;
  entryDate: string; // YYYY-MM-DD
  description: string;
  accountCode: string;
  debitCents: number;
  creditCents: number;
  ref?: string | null;
}

export interface SaftOptions {
  /** Denumire companie */
  companyName: string;
  /** CUI/IDNO */
  taxRegistrationNumber?: string;
  /** Perioada: ex "2025-01-01" */
  startDate: string;
  /** ex "2025-12-31" */
  endDate: string;
  /** Conturi (plan de conturi) */
  accounts: SaftAccount[];
  /** Înregistrări jurnal GL */
  entries: SaftJournalEntry[];
}

/**
 * Generează un fișier SAF-T RO simplificat ca string XML.
 */
export function generateSafT(opts: SaftOptions): string {
  const { companyName, taxRegistrationNumber, startDate, endDate, accounts, entries } = opts;

  const accountsXml = accounts
    .map(
      (a) => `    <Account>
      <AccountID>${xmlEscape(a.code)}</AccountID>
      <AccountDescription>${xmlEscape(a.name)}</AccountDescription>
      <AccountType>${xmlEscape(a.class ?? "")}</AccountType>
    </Account>`
    )
    .join("\n");

  const linesByEntry = new Map<string, SaftJournalEntry[]>();
  for (const e of entries) {
    if (!linesByEntry.has(e.entryId)) linesByEntry.set(e.entryId, []);
    linesByEntry.get(e.entryId)!.push(e);
  }

  const journalXml = Array.from(linesByEntry.entries())
    .map(([entryId, lines]) => {
      const firstLine = lines[0];
      const linesXml = lines
        .map(
          (l, idx) => `      <Line>
        <RecordID>${xmlEscape(l.entryId)}-${idx + 1}</RecordID>
        <AccountID>${xmlEscape(l.accountCode)}</AccountID>
        <Description>${xmlEscape(l.description)}</Description>
        <DebitAmount>${fmtAmount(l.debitCents)}</DebitAmount>
        <CreditAmount>${fmtAmount(l.creditCents)}</CreditAmount>
        <TaxPointDate>${xmlEscape(l.entryDate)}</TaxPointDate>
      </Line>`
        )
        .join("\n");
      return `  <Journal>
    <JournalID>${xmlEscape(entryId)}</JournalID>
    <TransactionDate>${xmlEscape(firstLine?.entryDate ?? "")}</TransactionDate>
    <Description>${xmlEscape(firstLine?.description ?? "")}</Description>
${linesXml}
  </Journal>`;
    })
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<AuditFile xmlns="urn:StandardAuditFile-Taxation-Financial:RO">
  <Header>
    <AuditFileVersion>2.0</AuditFileVersion>
    <Company>${xmlEscape(companyName)}</Company>
    <TaxRegistrationNumber>${xmlEscape(taxRegistrationNumber ?? "")}</TaxRegistrationNumber>
    <StartDate>${xmlEscape(startDate)}</StartDate>
    <EndDate>${xmlEscape(endDate)}</EndDate>
    <CurrencyCode>MDL</CurrencyCode>
  </Header>
  <MasterFiles>
    <GeneralLedgerAccounts>
${accountsXml}
    </GeneralLedgerAccounts>
  </MasterFiles>
  <GeneralLedgerEntries>
${journalXml}
  </GeneralLedgerEntries>
</AuditFile>`;
}
